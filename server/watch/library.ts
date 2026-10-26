import { promises as fs } from 'node:fs'
import path from 'node:path'
import { resolveWithinRoot } from '../auth/file-policy.js'
import { confinedRealPath } from './root.js'
import {
  CatalogStore,
  mergeScan,
  walkMedia,
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  type MergeSummary,
  type ScanResult,
} from './catalog.js'
import {
  Limiter,
  detectContentRect,
  detectCrop,
  extractAudioCover,
  extractEpisodeThumbnail,
  extractPreviewClip,
  extractVideoArtwork,
  extractWebVtt,
  keyframeAtOrBefore,
  probeFile,
  type MediaTools,
} from './ffmpeg.js'
import { planPlayback } from './playback.js'
import {
  PROBE_VERSION,
  type CatalogFile,
  type CatalogTitle,
  type ClientCapabilities,
  type ContentRect,
  type PlaybackPlan,
  type PlaybackProfile,
  type ProbeSummary,
} from './types.js'

export type LibraryOptions = {
  mediaRoot: string
  /** The only drive letter files may really live on (Windows), or null. */
  allowedDrive: string | null
  catalogDirectory: string
  ignored: ReadonlySet<string>
  tools: MediaTools | null
  maxStreams: number
  /** Prepare hover previews in the background (default). When false they are made the first time a title is hovered. */
  pregeneratePreviews?: boolean
  /** The H.264 encoder for converted streams; `amf` is used only when ffmpeg reports it. */
  encoder?: 'x264' | 'amf'
  now?: () => Date
}

export type ScanSummary = MergeSummary & { skipped: ScanResult['skipped'] }
export type ResolvedPlayback = { plan: PlaybackPlan; probe: ProbeSummary; start: number }

const RESCAN_INTERVAL_MS = 30_000
const PREVIEW_SECONDS = 18

/** Owns the catalog, the background probing and artwork work, and the per-file playback decision. */
export class WatchLibrary {
  readonly store: CatalogStore
  private readonly probeLimiter = new Limiter(3)
  private readonly artworkLimiter = new Limiter(2)
  private readonly subtitleLimiter = new Limiter(2)
  private readonly previewLimiter = new Limiter(1)
  private readonly probes = new Map<string, Promise<ProbeSummary | null>>()
  private readonly artworkJobs = new Map<string, Promise<void>>()
  private readonly artworkFailed = new Set<string>()
  private readonly frames = new Map<string, Promise<ContentRect | null>>()
  private readonly confined = new Map<string, boolean>()
  private scanning: Promise<ScanSummary> | null = null
  private lastScanAt = 0
  private background: Promise<void> | null = null
  private previewBackground: Promise<void> | null = null
  private saveTimer: NodeJS.Timeout | null = null
  private pendingProbes = 0
  private pendingArtwork = 0
  private activeStreams = 0
  skipped: ScanResult['skipped'] = []

  constructor(readonly options: LibraryOptions) {
    this.store = new CatalogStore(options.catalogDirectory)
  }

  get tools(): MediaTools | null {
    return this.options.tools
  }
  private now(): Date {
    return this.options.now ? this.options.now() : new Date()
  }

  async load(): Promise<void> {
    await this.store.refresh()
  }

  /** Picks up hand edits to catalog.json and starts a background rescan when the last one is stale. */
  async refresh(): Promise<void> {
    await this.store.refresh()
    if (Date.now() - this.lastScanAt > RESCAN_INTERVAL_MS) void this.rescan().catch(() => undefined)
  }

  rescan(): Promise<ScanSummary> {
    if (this.scanning) return this.scanning
    this.scanning = (async () => {
      try {
        await this.store.refresh()
        const scan = await walkMedia(this.options.mediaRoot, this.options.ignored)
        this.confined.clear()
        const summary = mergeScan(this.store.catalog, scan.entries, this.now().toISOString())
        this.skipped = scan.skipped
        await this.store.save()
        this.lastScanAt = Date.now()
        this.startBackgroundWork()
        return { ...summary, skipped: scan.skipped }
      } finally {
        this.scanning = null
      }
    })()
    return this.scanning
  }

  /** Where a catalog file is on disk, or null when it is not a media file or really lives outside the media folder (a shortcut or junction). */
  absolutePath(file: CatalogFile): string | null {
    const extension = path.extname(file.path).toLowerCase()
    if (!VIDEO_EXTENSIONS.has(extension) && !AUDIO_EXTENSIONS.has(extension)) return null
    const resolved = resolveWithinRoot(this.options.mediaRoot, file.path)
    if (!resolved) return null
    let inside = this.confined.get(resolved)
    if (inside === undefined) {
      inside = confinedRealPath(this.options.mediaRoot, resolved, this.options.allowedDrive) !== null
      this.confined.set(resolved, inside)
    }
    return inside ? resolved : null
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.store.save().catch(() => undefined)
    }, 1500)
    this.saveTimer.unref()
  }

  /** Songs are read again once when the probe learned to read tags; films never need them. */
  private needsProbe(file: CatalogFile): boolean {
    return !file.probe || (file.probe.version !== PROBE_VERSION && AUDIO_EXTENSIONS.has(path.extname(file.path).toLowerCase()))
  }

  ensureProbe(file: CatalogFile): Promise<ProbeSummary | null> {
    if (!this.needsProbe(file)) return Promise.resolve(file.probe)
    const tools = this.options.tools
    // An older probe is still good enough to play from, so it is kept whenever a newer one cannot be made.
    if (file.unreadable || file.missing || !tools) return Promise.resolve(file.probe)
    const running = this.probes.get(file.id)
    if (running) return running
    const absolute = this.absolutePath(file)
    if (!absolute) return Promise.resolve(file.probe)
    const job = this.probeLimiter
      .run(async () => {
        try {
          file.probe = await probeFile(tools, absolute)
          delete file.unreadable
        } catch (error) {
          if (file.probe) file.probe.version = PROBE_VERSION
          else
            file.unreadable = (error instanceof Error ? error.message : 'unreadable').replace(absolute, 'the file').slice(0, 200)
        }
        this.scheduleSave()
        return file.probe
      })
      .finally(() => {
        this.probes.delete(file.id)
      })
    this.probes.set(file.id, job)
    return job
  }

  playableFiles(title: CatalogTitle): CatalogFile[] {
    return title.files.filter((file) => !file.missing && !file.unreadable)
  }

  /** The file that represents a title in artwork: the largest copy of a film, the first episode of a series. */
  representativeFile(title: CatalogTitle): CatalogFile | null {
    const files = this.playableFiles(title)
    if (files.length === 0) return null
    if (title.kind === 'movie') return [...files].sort((left, right) => right.size - left.size)[0]
    return files[0]
  }

  // --- artwork -----------------------------------------------------------------------------------------------------------------

  private artworkDirectory(titleId: string): string {
    return path.join(this.options.catalogDirectory, 'artwork', titleId)
  }

  private async customImage(relative: string | null): Promise<string | null> {
    if (!relative) return null
    const resolved = resolveWithinRoot(this.options.catalogDirectory, relative)
    if (!resolved || !['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(resolved).toLowerCase())) return null
    try {
      return (await fs.stat(resolved)).isFile() ? resolved : null
    } catch {
      return null
    }
  }

  /** Resolves a title image to a file on disk: a hand-placed image wins over a generated frame. */
  async artworkFile(title: CatalogTitle, kind: 'card' | 'backdrop'): Promise<{ file: string; version: number } | null> {
    const candidates = [
      await this.customImage(kind === 'card' ? title.poster : title.backdrop),
      path.join(this.artworkDirectory(title.id), `${kind}.jpg`),
    ]
    for (const candidate of candidates) {
      if (!candidate) continue
      try {
        return { file: candidate, version: Math.round((await fs.stat(candidate)).mtimeMs) }
      } catch {
        /* try the next candidate */
      }
    }
    return null
  }

  async hasArtwork(title: CatalogTitle): Promise<{ card: number | null; backdrop: number | null }> {
    const [card, backdrop] = await Promise.all([this.artworkFile(title, 'card'), this.artworkFile(title, 'backdrop')])
    return { card: card?.version ?? null, backdrop: backdrop?.version ?? null }
  }

  private seekSecond(duration: number, fraction: number): number {
    return Math.max(0, Math.min(duration * fraction, duration - 10))
  }

  private async generateTitleArtwork(title: CatalogTitle): Promise<void> {
    const tools = this.options.tools
    const file = this.representativeFile(title)
    if (!tools || !file) return
    const absolute = this.absolutePath(file)
    if (!absolute) return
    const directory = this.artworkDirectory(title.id)
    await fs.mkdir(directory, { recursive: true })
    const outputs = { backdrop: path.join(directory, 'backdrop.jpg'), card: path.join(directory, 'card.jpg') }
    if (title.kind === 'album') {
      await extractAudioCover(tools, absolute, outputs.card)
      await fs.copyFile(outputs.card, outputs.backdrop)
      return
    }
    const probe = await this.ensureProbe(file)
    if (!probe?.video) return
    const second = this.seekSecond(probe.duration, title.kind === 'series' ? 0.25 : 0.18)
    const crop = await detectCrop(tools, absolute, probe.video.index, second, probe.video)
    await extractVideoArtwork(tools, absolute, probe.video.index, second, probe.video.hdr, crop, outputs)
  }

  ensureArtwork(title: CatalogTitle): Promise<void> {
    const running = this.artworkJobs.get(title.id)
    if (running) return running
    if (this.artworkFailed.has(title.id)) return Promise.resolve()
    const job = this.artworkLimiter
      .run(async () => {
        try {
          await this.generateTitleArtwork(title)
        } catch {
          this.artworkFailed.add(title.id)
        }
      })
      .finally(() => {
        this.artworkJobs.delete(title.id)
      })
    this.artworkJobs.set(title.id, job)
    return job
  }

  private thumbPath(file: CatalogFile): string {
    return path.join(this.options.catalogDirectory, 'thumbs', `${file.id}.jpg`)
  }

  /** The still for one episode if it already exists. Never waits: the browser has few connections and playback needs them. */
  async thumbFile(file: CatalogFile): Promise<{ file: string; version: number } | null> {
    const output = this.thumbPath(file)
    try {
      return { file: output, version: Math.round((await fs.stat(output)).mtimeMs) }
    } catch {
      return null
    }
  }

  /** Starts generating an episode still in the background (at most once per file). */
  ensureThumb(file: CatalogFile): Promise<void> {
    const key = `thumb:${file.id}`
    const running = this.artworkJobs.get(key)
    if (running) return running
    const tools = this.options.tools
    const absolute = this.absolutePath(file)
    if (!tools || !absolute || file.missing || file.unreadable || this.artworkFailed.has(key)) return Promise.resolve()
    const output = this.thumbPath(file)
    const job = this.artworkLimiter
      .run(async () => {
        try {
          const probe = await this.ensureProbe(file)
          if (!probe?.video) return
          await fs.mkdir(path.dirname(output), { recursive: true })
          const second = this.seekSecond(probe.duration, 0.22)
          const crop = await detectCrop(tools, absolute, probe.video.index, second, probe.video)
          await extractEpisodeThumbnail(tools, absolute, probe.video.index, second, probe.video.hdr, crop, output)
        } catch {
          this.artworkFailed.add(key)
        }
      })
      .finally(() => {
        this.artworkJobs.delete(key)
      })
    this.artworkJobs.set(key, job)
    return job
  }

  /** The picture inside any black bars, measured once and remembered in the catalog. Null means the frame has no bars. */
  contentRect(file: CatalogFile): Promise<ContentRect | null> {
    if (file.contentRect !== undefined) return Promise.resolve(file.contentRect)
    const tools = this.options.tools
    const absolute = this.absolutePath(file)
    if (!tools || !absolute || file.missing || file.unreadable) return Promise.resolve(null)
    const running = this.frames.get(file.id)
    if (running) return running
    const job = this.artworkLimiter
      .run(async () => {
        const probe = await this.ensureProbe(file)
        if (!probe?.video) return null
        try {
          const rect = await detectContentRect(tools, absolute, probe.video, probe.duration)
          file.contentRect = rect
          this.scheduleSave()
          return rect
        } catch {
          return null
        }
      })
      .finally(() => {
        this.frames.delete(file.id)
      })
    this.frames.set(file.id, job)
    return job
  }

  // --- hover previews ----------------------------------------------------------------------------------------------------------

  private previewPath(title: CatalogTitle): string {
    return path.join(this.options.catalogDirectory, 'previews', `${title.id}.mp4`)
  }

  /** The cached preview clip for a title, or null when none has been made yet. */
  async previewFile(title: CatalogTitle): Promise<{ file: string; size: number } | null> {
    const output = this.previewPath(title)
    try {
      const stats = await fs.stat(output)
      return stats.isFile() && stats.size > 0 ? { file: output, size: stats.size } : null
    } catch {
      return null
    }
  }

  private async generatePreview(title: CatalogTitle): Promise<void> {
    const tools = this.options.tools
    const file = this.representativeFile(title)
    if (!tools || !file || title.kind === 'album') return
    const absolute = this.absolutePath(file)
    const probe = await this.ensureProbe(file)
    if (!absolute || !probe?.video) return
    // Skip the opening titles but stay well clear of the ending: about a quarter in, or a fifth of a short clip.
    const length = Math.max(4, Math.min(PREVIEW_SECONDS, probe.duration * 0.5))
    const seconds = Math.max(0, Math.min(probe.duration * (title.kind === 'series' ? 0.2 : 0.26), probe.duration - length - 1))
    const crop = await detectCrop(tools, absolute, probe.video.index, seconds, probe.video)
    const output = this.previewPath(title)
    const temporary = `${output}.${process.pid}.tmp`
    await fs.mkdir(path.dirname(output), { recursive: true })
    try {
      await extractPreviewClip(tools, absolute, probe.video.index, { seconds, length, hdr: probe.video.hdr, crop }, temporary)
      await fs.rename(temporary, output)
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  /** Makes the preview if it does not exist (at most once at a time per title) and resolves when it is ready. */
  async ensurePreview(title: CatalogTitle): Promise<{ file: string; size: number } | null> {
    const existing = await this.previewFile(title)
    if (existing) return existing
    const key = `preview:${title.id}`
    if (this.artworkFailed.has(key)) return null
    let job = this.artworkJobs.get(key)
    if (!job) {
      job = this.previewLimiter
        .run(async () => {
          try {
            await this.generatePreview(title)
          } catch {
            this.artworkFailed.add(key)
          }
        })
        .finally(() => {
          this.artworkJobs.delete(key)
        })
      this.artworkJobs.set(key, job)
    }
    await job
    return this.previewFile(title)
  }

  /** Quietly prepares previews for every film and series, newest first, so hovering is instant. Turn off with WATCH_PREVIEWS=lazy. */
  private startPreviewWork(): void {
    if (this.previewBackground || !this.options.tools || !this.options.pregeneratePreviews) return
    this.previewBackground = (async () => {
      try {
        const titles = this.store.catalog.titles
          .filter((title) => title.kind !== 'album' && this.playableFiles(title).length > 0)
          .sort((left, right) => right.addedAt.localeCompare(left.addedAt))
        for (const title of titles) await this.ensurePreview(title)
      } catch {
        /* previews are a nicety; hovering still makes one on demand */
      } finally {
        this.previewBackground = null
      }
    })()
  }

  // --- background work ---------------------------------------------------------------------------------------------------------

  startBackgroundWork(): void {
    if (this.background || !this.options.tools) return
    this.background = (async () => {
      try {
        for (let round = 0; round < 3; round += 1) {
          const files = this.store.catalog.titles
            .flatMap((title) => title.files)
            .filter((file) => this.needsProbe(file) && !file.unreadable && !file.missing)
          this.pendingProbes = files.length
          await Promise.all(
            files.map((file) =>
              this.ensureProbe(file).finally(() => {
                this.pendingProbes -= 1
              }),
            ),
          )
          const titles = this.store.catalog.titles.filter((title) => this.playableFiles(title).length > 0)
          const needing: CatalogTitle[] = []
          for (const title of titles)
            if (!title.poster && !(await this.hasArtwork(title)).card && !this.artworkFailed.has(title.id)) needing.push(title)
          this.pendingArtwork = needing.length
          await Promise.all(
            needing.map((title) =>
              this.ensureArtwork(title).finally(() => {
                this.pendingArtwork -= 1
              }),
            ),
          )
          const stills: CatalogFile[] = []
          for (const title of titles)
            if (title.kind === 'series')
              for (const file of this.playableFiles(title)) if (!(await this.thumbFile(file))) stills.push(file)
          this.pendingArtwork = stills.length
          await Promise.all(
            stills.map((file) =>
              this.ensureThumb(file).finally(() => {
                this.pendingArtwork -= 1
              }),
            ),
          )
          await this.store.save()
          this.startPreviewWork()
          const more = this.store.catalog.titles.some((title) =>
            title.files.some((file) => this.needsProbe(file) && !file.unreadable && !file.missing),
          )
          if (!more) break
        }
      } catch {
        /* background work is best effort; the catalog stays usable */
      } finally {
        this.pendingProbes = 0
        this.pendingArtwork = 0
        this.background = null
      }
    })()
  }

  status(): { scanning: boolean; probing: number; artwork: number; streams: number } {
    return {
      scanning: this.scanning !== null,
      probing: this.pendingProbes,
      artwork: this.pendingArtwork,
      streams: this.activeStreams,
    }
  }

  // --- subtitles ---------------------------------------------------------------------------------------------------------------

  async subtitleText(file: CatalogFile, ordinal: number): Promise<string | null> {
    const probe = await this.ensureProbe(file)
    const tools = this.options.tools
    const absolute = this.absolutePath(file)
    if (!probe || !absolute) return null
    const embedded = probe.subtitles[ordinal]
    if (embedded) {
      if (!embedded.text || !tools) return null
      const cache = path.join(this.options.catalogDirectory, 'subs', `${file.id}-${ordinal}.vtt`)
      try {
        return await fs.readFile(cache, 'utf8')
      } catch {
        /* extract below */
      }
      const text = await this.subtitleLimiter.run(() => extractWebVtt(tools, absolute, embedded.index))
      await fs.mkdir(path.dirname(cache), { recursive: true })
      await fs.writeFile(cache, text, 'utf8')
      return text
    }
    const sidecar = file.sidecarSubtitles[ordinal - probe.subtitles.length]
    const resolved = sidecar ? resolveWithinRoot(this.options.mediaRoot, sidecar.path) : null
    if (!resolved || !confinedRealPath(this.options.mediaRoot, resolved, this.options.allowedDrive)) return null
    try {
      return (await fs.readFile(resolved, 'utf8')).slice(0, 2_000_000)
    } catch {
      return null
    }
  }

  // --- playback ----------------------------------------------------------------------------------------------------------------

  /** `snap` aligns a repackaged (copied) stream's start to a keyframe; the plan endpoint does it once and the stream URL carries the result. */
  async resolvePlayback(
    file: CatalogFile,
    caps: ClientCapabilities,
    options: { audioOrdinal: number | null; profile: PlaybackProfile; start: number; snap: boolean; audioDelayMs: number },
  ): Promise<ResolvedPlayback | null> {
    const probe = await this.ensureProbe(file)
    const absolute = this.absolutePath(file)
    if (!probe || !absolute) return null
    const plan = planPlayback(probe, path.extname(file.path), caps, {
      audioOrdinal: options.audioOrdinal,
      profile: options.profile,
      audioDelayMs: options.audioDelayMs,
    })
    let start = Math.min(Math.max(options.start, 0), Math.max(probe.duration - 1, 0))
    if (plan.mode === 'direct') start = 0
    else if (plan.mode === 'remux' && start > 0 && options.snap && this.options.tools)
      start = await keyframeAtOrBefore(this.options.tools, absolute, start)
    return { plan, probe, start }
  }

  /** Returns a release function, or null when the machine is already converting as many streams as it should. */
  acquireStream(): (() => void) | null {
    if (this.activeStreams >= this.options.maxStreams) return null
    this.activeStreams += 1
    let released = false
    return () => {
      if (!released) {
        released = true
        this.activeStreams -= 1
      }
    }
  }

  async close(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    await this.store.save().catch(() => undefined)
  }
}
