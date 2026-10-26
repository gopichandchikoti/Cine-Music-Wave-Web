import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseAlbumFolder, parseTrackName, parseVideoName, titleKey } from './filename.js'
import type { Catalog, CatalogFile, CatalogTitle, ContentRect } from './types.js'

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv'])
export const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac'])

const MAX_DEPTH = 12
const MAX_FILES = 20_000

export const fileIdFor = (relativePath: string): string =>
  'f_' + createHash('sha1').update(relativePath.toLowerCase()).digest('hex').slice(0, 12)
export const titleIdFor = (key: string): string => 't_' + createHash('sha1').update(key).digest('hex').slice(0, 12)

export type ScanEntry = {
  path: string
  size: number
  modifiedAt: string
  kind: 'video' | 'audio'
  sidecarSubtitles: CatalogFile['sidecarSubtitles']
}

export type ScanResult = {
  entries: ScanEntry[]
  skipped: { path: string; reason: string }[]
}

const toPosix = (value: string): string => value.split(path.sep).join('/')

/** Lists every video and audio file under the media root. Protected or unreadable folders are skipped, not fatal. */
export async function walkMedia(root: string, ignored: ReadonlySet<string>): Promise<ScanResult> {
  const entries: ScanEntry[] = []
  const skipped: ScanResult['skipped'] = []

  async function visit(directory: string, relativeDirectory: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || entries.length >= MAX_FILES) return
    let children
    try {
      children = await fs.readdir(directory, { withFileTypes: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (relativeDirectory && (code === 'EACCES' || code === 'EPERM')) {
        skipped.push({ path: relativeDirectory, reason: 'folder is not readable' })
        return
      }
      throw error
    }
    const sidecars = new Map<string, CatalogFile['sidecarSubtitles']>()
    for (const child of children) {
      if (!child.isFile() || path.extname(child.name).toLowerCase() !== '.vtt') continue
      const stem = child.name.slice(0, -4)
      const dot = stem.lastIndexOf('.')
      const base = dot > 0 ? stem.slice(0, dot) : stem
      const language = dot > 0 ? stem.slice(dot + 1) : 'und'
      const list = sidecars.get(base) ?? []
      list.push({
        language,
        label: language.toUpperCase(),
        path: toPosix(relativeDirectory ? path.join(relativeDirectory, child.name) : child.name),
      })
      sidecars.set(base, list)
    }
    for (const child of children) {
      if (child.name.startsWith('.') || entries.length >= MAX_FILES) continue
      const relativePath = relativeDirectory ? path.join(relativeDirectory, child.name) : child.name
      const absolutePath = path.join(directory, child.name)
      if (child.isDirectory()) {
        if (!ignored.has(child.name)) await visit(absolutePath, relativePath, depth + 1)
        continue
      }
      if (!child.isFile()) continue
      const extension = path.extname(child.name).toLowerCase()
      const kind = VIDEO_EXTENSIONS.has(extension) ? 'video' : AUDIO_EXTENSIONS.has(extension) ? 'audio' : null
      if (!kind) continue
      try {
        const stats = await fs.stat(absolutePath)
        if (stats.size === 0) {
          skipped.push({ path: toPosix(relativePath), reason: 'file is empty' })
          continue
        }
        const stem = child.name.slice(0, -extension.length)
        entries.push({
          path: toPosix(relativePath),
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          kind,
          sidecarSubtitles: kind === 'video' ? (sidecars.get(stem) ?? []) : [],
        })
      } catch {
        skipped.push({ path: toPosix(relativePath), reason: 'file could not be read' })
      }
    }
  }

  await visit(root, '', 0)
  return { entries, skipped }
}

type Group = {
  key: string
  kind: CatalogTitle['kind']
  title: string
  year: number | null
  languages: Set<string>
  files: {
    entry: ScanEntry
    season: number | null
    episode: number | null
    episodeTitle: string | null
    track: number | null
    name: string
  }[]
}

const byEpisode = (left: Group['files'][number], right: Group['files'][number]): number =>
  (left.season ?? 0) - (right.season ?? 0) ||
  (left.episode ?? left.track ?? 0) - (right.episode ?? right.track ?? 0) ||
  left.name.localeCompare(right.name, 'en', { numeric: true })

/** Turns file paths into titles: one movie per film, one series per show, one album per folder of songs. */
export function groupEntries(entries: readonly ScanEntry[]): Map<string, Group> {
  const groups = new Map<string, Group>()
  const add = (key: string, make: () => Omit<Group, 'files' | 'key'>, file: Group['files'][number]): void => {
    const group = groups.get(key) ?? { key, ...make(), files: [] }
    if (!groups.has(key)) groups.set(key, group)
    group.files.push(file)
  }
  for (const entry of entries) {
    const segments = entry.path.split('/')
    const name = segments[segments.length - 1]
    const folders = segments.slice(0, -1)
    if (entry.kind === 'audio') {
      const folder = folders[folders.length - 1] ?? 'Songs'
      const album = parseAlbumFolder(folder)
      const track = parseTrackName(name)
      add(
        `album:${folders.join('/').toLowerCase()}`,
        () => ({ kind: 'album', title: album.title, year: album.year, languages: new Set<string>() }),
        { entry, season: null, episode: null, episodeTitle: track.title, track: track.track, name },
      )
      continue
    }
    const parsed = parseVideoName(name, folders)
    const isSeries = parsed.season !== null
    const key = isSeries ? `series:${titleKey(parsed.title)}` : `movie:${titleKey(parsed.title)}:${parsed.year ?? ''}`
    add(
      key,
      () => ({ kind: isSeries ? 'series' : 'movie', title: parsed.title, year: parsed.year, languages: new Set<string>() }),
      { entry, season: parsed.season, episode: parsed.episode, episodeTitle: parsed.episodeTitle, track: null, name },
    )
    const group = groups.get(key)!
    parsed.languages.forEach((language) => group.languages.add(language))
    if (group.year === null && parsed.year !== null) group.year = parsed.year
  }
  for (const group of groups.values()) group.files.sort(byEpisode)
  return groups
}

export const emptyCatalog = (): Catalog => ({ version: 1, updatedAt: new Date(0).toISOString(), titles: [] })

const toCatalogFile = (item: Group['files'][number]): CatalogFile => ({
  id: fileIdFor(item.entry.path),
  path: item.entry.path,
  size: item.entry.size,
  modifiedAt: item.entry.modifiedAt,
  season: item.season,
  episode: item.episode,
  episodeTitle: item.episodeTitle,
  probe: null,
  sidecarSubtitles: item.entry.sidecarSubtitles,
})

export type MergeSummary = { added: number; removed: number; titles: number }

/**
 * Adds new files and flags vanished ones. Anything already in the catalog keeps the title, overview, genres and artwork the
 * user may have edited by hand; only the technical facts of a file (size, date, probe) are refreshed.
 */
export function mergeScan(catalog: Catalog, entries: readonly ScanEntry[], now: string): MergeSummary {
  const scanned = new Map(entries.map((entry) => [fileIdFor(entry.path), entry]))
  const known = new Set<string>()
  let removed = 0
  for (const title of catalog.titles) {
    for (const file of title.files) {
      known.add(file.id)
      const entry = scanned.get(file.id)
      if (!entry) {
        if (!file.missing) removed += 1
        file.missing = true
        continue
      }
      if (file.missing) delete file.missing
      if (file.size !== entry.size || file.modifiedAt !== entry.modifiedAt) {
        file.size = entry.size
        file.modifiedAt = entry.modifiedAt
        file.probe = null
        delete file.contentRect
        delete file.unreadable
      }
      file.sidecarSubtitles = entry.sidecarSubtitles
    }
  }

  const fresh = entries.filter((entry) => !known.has(fileIdFor(entry.path)))
  let added = 0
  for (const group of groupEntries(fresh).values()) {
    let title = catalog.titles.find((candidate) => candidate.key === group.key)
    if (!title) {
      title = {
        id: titleIdFor(group.key),
        key: group.key,
        kind: group.kind,
        title: group.title,
        year: group.year,
        overview: '',
        genres: [],
        languages: [...group.languages],
        rating: null,
        poster: null,
        backdrop: null,
        addedAt: now,
        files: [],
      }
      catalog.titles.push(title)
    }
    for (const item of group.files) {
      title.files.push(toCatalogFile(item))
      added += 1
    }
    title.files.sort(
      (left, right) =>
        (left.season ?? 0) - (right.season ?? 0) ||
        (left.episode ?? 0) - (right.episode ?? 0) ||
        left.path.localeCompare(right.path, 'en', { numeric: true }),
    )
    for (const language of group.languages) if (!title.languages.includes(language)) title.languages.push(language)
  }
  catalog.updatedAt = now
  return { added, removed, titles: catalog.titles.length }
}

export class CatalogError extends Error {}

/** What a browser is told when the catalog file is unreadable; the real reason names local paths, so it stays in the log. */
export const CATALOG_PROBLEM_MESSAGE = 'The media catalog could not be read. The server log says why.'

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const textList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 40) : []
const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const fraction = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

/** Keeps a measured picture rectangle only if it is a real rectangle inside the frame; null means "measured, no bars". */
const contentRectField = (value: unknown): { contentRect?: ContentRect | null } => {
  if (value === null) return { contentRect: null }
  if (!value || typeof value !== 'object') return {}
  const { x, y, w, h } = value as Record<string, unknown>
  return fraction(x) && fraction(y) && fraction(w) && fraction(h) && w > 0 && h > 0 && x + w <= 1.001 && y + h <= 1.001
    ? { contentRect: { x, y, w, h } }
    : {}
}

/** Accepts a hand-edited file: missing fields get defaults, wrong types are dropped, nothing is trusted. */
export function sanitizeCatalog(raw: unknown): Catalog {
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as { version?: unknown }).version !== 1 ||
    !Array.isArray((raw as { titles?: unknown }).titles)
  ) {
    throw new CatalogError('catalog.json must be an object with "version": 1 and a "titles" array.')
  }
  const source = raw as { updatedAt?: unknown; titles: unknown[] }
  const titles: CatalogTitle[] = []
  for (const item of source.titles) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const id = text(entry.id)
    if (!/^t_[0-9a-f]{12}$/.test(id) || !['movie', 'series', 'album'].includes(text(entry.kind))) continue
    const files: CatalogFile[] = []
    for (const candidate of Array.isArray(entry.files) ? entry.files : []) {
      if (!candidate || typeof candidate !== 'object') continue
      const file = candidate as Record<string, unknown>
      const fileId = text(file.id)
      if (!/^f_[0-9a-f]{12}$/.test(fileId) || typeof file.path !== 'string' || !file.path) continue
      files.push({
        id: fileId,
        path: file.path,
        size: numberOrNull(file.size) ?? 0,
        modifiedAt: text(file.modifiedAt, new Date(0).toISOString()),
        season: numberOrNull(file.season),
        episode: numberOrNull(file.episode),
        episodeTitle: typeof file.episodeTitle === 'string' ? file.episodeTitle : null,
        ...(typeof file.unreadable === 'string' ? { unreadable: file.unreadable } : {}),
        probe: file.probe && typeof file.probe === 'object' ? (file.probe as CatalogFile['probe']) : null,
        sidecarSubtitles: Array.isArray(file.sidecarSubtitles) ? (file.sidecarSubtitles as CatalogFile['sidecarSubtitles']) : [],
        ...contentRectField(file.contentRect),
        ...(file.missing === true ? { missing: true as const } : {}),
      })
    }
    titles.push({
      id,
      key: text(entry.key, id),
      kind: text(entry.kind) as CatalogTitle['kind'],
      title: text(entry.title, 'Untitled'),
      year: numberOrNull(entry.year),
      overview: text(entry.overview),
      genres: textList(entry.genres),
      languages: textList(entry.languages),
      rating: typeof entry.rating === 'string' ? entry.rating : null,
      poster: typeof entry.poster === 'string' && entry.poster ? entry.poster : null,
      backdrop: typeof entry.backdrop === 'string' && entry.backdrop ? entry.backdrop : null,
      addedAt: text(entry.addedAt, new Date(0).toISOString()),
      files,
    })
  }
  return { version: 1, updatedAt: text(source.updatedAt, new Date(0).toISOString()), titles }
}

/** catalog.json on disk is the source of truth. It is reloaded when edited and never overwritten if it cannot be read. */
export class CatalogStore {
  private catalogValue: Catalog = emptyCatalog()
  private loadedMtime = -1
  private saving: Promise<void> = Promise.resolve()

  constructor(readonly directory: string) {}

  get file(): string {
    return path.join(this.directory, 'catalog.json')
  }
  get catalog(): Catalog {
    return this.catalogValue
  }

  async refresh(): Promise<void> {
    let stats
    try {
      stats = await fs.stat(this.file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.loadedMtime = -1
        return
      }
      throw error
    }
    if (stats.mtimeMs === this.loadedMtime) return
    let parsed: unknown
    try {
      parsed = JSON.parse(await fs.readFile(this.file, 'utf8'))
    } catch (error) {
      throw new CatalogError(
        `catalog.json could not be read: ${error instanceof Error ? error.message : String(error)}. Fix the file or delete it to rebuild the catalog.`,
      )
    }
    this.catalogValue = sanitizeCatalog(parsed)
    this.loadedMtime = stats.mtimeMs
  }

  save(): Promise<void> {
    this.saving = this.saving.then(async () => {
      await fs.mkdir(this.directory, { recursive: true })
      const temporary = `${this.file}.tmp`
      await fs.writeFile(temporary, JSON.stringify(this.catalogValue, null, 2), 'utf8')
      await fs.rename(temporary, this.file)
      this.loadedMtime = (await fs.stat(this.file)).mtimeMs
    })
    return this.saving
  }

  findTitle(id: string): CatalogTitle | undefined {
    return this.catalogValue.titles.find((title) => title.id === id)
  }

  findFile(id: string): { title: CatalogTitle; file: CatalogFile } | undefined {
    for (const title of this.catalogValue.titles) {
      const file = title.files.find((candidate) => candidate.id === id)
      if (file) return { title, file }
    }
    return undefined
  }
}
