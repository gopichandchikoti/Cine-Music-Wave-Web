import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { AUDIO_EXTENSIONS } from '../watch/catalog.js'
import { Limiter, extractMusicCover, measureLoudness, readLyricsTag } from '../watch/ffmpeg.js'
import type { WatchLibrary } from '../watch/library.js'
import { confinedRealPath } from '../watch/root.js'
import { PROBE_VERSION, type CatalogFile } from '../watch/types.js'
import { lyricsFromText, type Lyrics } from './lyrics.js'
import { cleanTags, nameKey, type CleanTags } from './metadata.js'

/** One song, as the music screen shows it. Everything is cleaned (no site names); the file's own tags are never changed. */
export type MusicTrack = {
  id: string
  title: string
  /** The singers, one name each. */
  artists: string[]
  /** The film or album. */
  album: string
  albumId: string
  year: number | null
  track: number | null
  disc: number | null
  genre: string | null
  language: string | null
  /** Who acted in the film (the album artist tag of film albums). */
  cast: string[]
  bpm: number | null
  duration: number
  format: string
  size: number
  cover: boolean
  lyrics: boolean
  addedAt: string
  /** Mean loudness in dB (higher is louder); null until measured. */
  loudness: number | null
}

type Analysis = { version: 1; tracks: Record<string, { meanDb: number; maxDb: number; size: number; modifiedAt: string }> }

const albumIdFor = (albumKey: string): string => 'a_' + createHash('sha1').update(albumKey).digest('hex').slice(0, 12)
const TRACK_ID = /^f_[0-9a-f]{12}$/

type Source = { file: CatalogFile; clean: CleanTags }

/** The song list, built from the Watch catalog's audio files, plus cover art, lyrics and loudness. */
export class MusicLibrary {
  private readonly cleaned = new Map<string, { signature: string; clean: CleanTags }>()
  private readonly coverJobs = new Map<string, Promise<string | null>>()
  private readonly coverFailed = new Set<string>()
  private readonly coverLimiter = new Limiter(2)
  private analysis: Analysis = { version: 1, tracks: {} }
  private analysisLoaded = false
  private analysing: Promise<void> | null = null

  constructor(readonly watch: WatchLibrary) {}

  private get directory(): string {
    return this.watch.options.catalogDirectory
  }

  private audioFiles(): CatalogFile[] {
    const files: CatalogFile[] = []
    for (const title of this.watch.store.catalog.titles) {
      if (title.kind !== 'album') continue
      for (const file of title.files)
        if (!file.missing && !file.unreadable && AUDIO_EXTENSIONS.has(path.extname(file.path).toLowerCase())) files.push(file)
    }
    return files
  }

  private cleanOf(file: CatalogFile): CleanTags {
    const tags = file.probe?.tags ?? null
    const signature = `${file.probe?.version ?? 0}|${file.size}|${file.modifiedAt}|${tags?.title}|${tags?.album}|${tags?.artist}|${tags?.date}`
    const known = this.cleaned.get(file.id)
    if (known?.signature === signature) return known.clean
    const clean = cleanTags(tags, file.path)
    this.cleaned.set(file.id, { signature, clean })
    return clean
  }

  /** Songs still being read (their tags are not known yet), so the screen can say so and look again shortly. */
  pending(): number {
    return this.audioFiles().filter((file) => !file.probe || file.probe.version !== PROBE_VERSION).length
  }

  private sources(): Source[] {
    return this.audioFiles()
      .filter((file) => file.probe)
      .map((file) => ({ file, clean: this.cleanOf(file) }))
  }

  tracks(): MusicTrack[] {
    const sources = this.sources()
    // One person is written many ways ("S.P.Balasubrahmanyam", "S. P. Balasubrahmanyam"); the most common spelling is used everywhere.
    const spellings = new Map<string, Map<string, number>>()
    for (const { clean } of sources)
      for (const name of [...clean.artists, ...clean.cast]) {
        const counts = spellings.get(nameKey(name)) ?? new Map<string, number>()
        counts.set(name, (counts.get(name) ?? 0) + 1)
        spellings.set(nameKey(name), counts)
      }
    const canonical = (name: string): string =>
      [...(spellings.get(nameKey(name)) ?? new Map([[name, 1]])).entries()].sort(
        (left, right) => right[1] - left[1] || left[0].length - right[0].length,
      )[0][0]
    const withCover = new Set(sources.filter(({ file }) => file.probe?.cover).map(({ clean }) => albumIdFor(clean.albumKey)))
    return sources.map(({ file, clean }) => {
      const albumId = albumIdFor(clean.albumKey)
      const probe = file.probe!
      return {
        id: file.id,
        title: clean.title,
        artists: clean.artists.map(canonical),
        album: clean.album,
        albumId,
        year: clean.year,
        track: clean.track,
        disc: clean.disc,
        genre: clean.genre,
        language: clean.language,
        cast: clean.cast.map(canonical),
        bpm: clean.bpm,
        duration: probe.duration,
        format: probe.audio[0]?.codec ?? path.extname(file.path).slice(1),
        size: file.size,
        cover: withCover.has(albumId),
        lyrics: clean.hasLyrics,
        addedAt: file.modifiedAt,
        loudness: this.analysis.tracks[file.id]?.meanDb ?? null,
      }
    })
  }

  find(trackId: string): CatalogFile | null {
    if (!TRACK_ID.test(trackId)) return null
    return this.audioFiles().find((file) => file.id === trackId) ?? null
  }

  // --- cover art ---------------------------------------------------------------------------------------------------------------

  /** The cover JPEG for an album (made once from the picture inside its songs), or null when no song has one. */
  coverFor(albumId: string): Promise<string | null> {
    if (!/^a_[0-9a-f]{12}$/.test(albumId)) return Promise.resolve(null)
    const output = path.join(this.directory, 'music-art', `${albumId}.jpg`)
    const running = this.coverJobs.get(albumId)
    if (running) return running
    const job = (async (): Promise<string | null> => {
      try {
        if ((await fs.stat(output)).size > 0) return output
      } catch {
        /* made below */
      }
      if (this.coverFailed.has(albumId)) return null
      const tools = this.watch.tools
      const source = this.sources().find(({ file, clean }) => file.probe?.cover && albumIdFor(clean.albumKey) === albumId)
      const absolute = source ? this.watch.absolutePath(source.file) : null
      if (!tools || !source?.file.probe?.cover || !absolute) return null
      try {
        await fs.mkdir(path.dirname(output), { recursive: true })
        const temporary = path.join(path.dirname(output), `${albumId}.${process.pid}.tmp.jpg`)
        await this.coverLimiter.run(() => extractMusicCover(tools, absolute, source.file.probe!.cover!.index, temporary))
        await fs.rename(temporary, output)
        return output
      } catch {
        this.coverFailed.add(albumId)
        return null
      }
    })().finally(() => {
      this.coverJobs.delete(albumId)
    })
    this.coverJobs.set(albumId, job)
    return job
  }

  // --- lyrics ------------------------------------------------------------------------------------------------------------------

  /** Timed lyrics from a .lrc file beside the song, otherwise the lyrics inside the song. */
  async lyricsFor(file: CatalogFile): Promise<Lyrics | null> {
    const absolute = this.watch.absolutePath(file)
    if (!absolute) return null
    const sidecar = absolute.slice(0, absolute.length - path.extname(absolute).length) + '.lrc'
    // The .lrc must really live inside the media folder, like every other file this app reads.
    if (confinedRealPath(this.watch.options.mediaRoot, sidecar, this.watch.options.allowedDrive)) {
      try {
        const found = lyricsFromText(await fs.readFile(sidecar, 'utf8'), 'file')
        if (found) return found
      } catch {
        /* no sidecar */
      }
    }
    const tools = this.watch.tools
    const tagged = tools ? await readLyricsTag(tools, absolute) : null
    return tagged ? lyricsFromText(tagged, 'tag') : null
  }

  // --- loudness (for "workout" style mixes) --------------------------------------------------------------------------------------

  private get analysisFile(): string {
    return path.join(this.directory, 'music-analysis.json')
  }

  private async loadAnalysis(): Promise<void> {
    if (this.analysisLoaded) return
    this.analysisLoaded = true
    try {
      const parsed = JSON.parse(await fs.readFile(this.analysisFile, 'utf8')) as Analysis
      if (parsed.version === 1 && parsed.tracks && typeof parsed.tracks === 'object') this.analysis = parsed
    } catch {
      /* first run, or an unreadable cache that is simply measured again */
    }
  }

  /** Measures the loudness of songs that have not been measured, quietly in the background. Safe to call often. */
  kick(): void {
    if (this.analysing || !this.watch.tools) return
    this.analysing = (async () => {
      try {
        await this.loadAnalysis()
        const tools = this.watch.tools
        if (!tools) return
        let changed = 0
        for (const { file } of this.sources()) {
          const known = this.analysis.tracks[file.id]
          if (known && known.size === file.size && known.modifiedAt === file.modifiedAt) continue
          const absolute = this.watch.absolutePath(file)
          const duration = file.probe?.duration ?? 0
          if (!absolute || duration <= 0) continue
          const length = Math.min(30, duration)
          const result = await measureLoudness(tools, absolute, duration > 60 ? Math.min(30, duration * 0.3) : 0, length)
          if (!result) continue
          this.analysis.tracks[file.id] = { ...result, size: file.size, modifiedAt: file.modifiedAt }
          changed += 1
          if (changed % 20 === 0) await this.saveAnalysis()
        }
        if (changed > 0) await this.saveAnalysis()
      } catch {
        /* loudness is a nicety; the shelves fall back to other signals */
      } finally {
        this.analysing = null
      }
    })()
  }

  private async saveAnalysis(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true })
    const temporary = `${this.analysisFile}.tmp`
    await fs.writeFile(temporary, JSON.stringify(this.analysis), 'utf8')
    await fs.rename(temporary, this.analysisFile)
  }
}
