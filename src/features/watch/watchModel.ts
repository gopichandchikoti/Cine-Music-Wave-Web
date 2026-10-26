import { content as copy, formatContent } from '../../content.js'
import type { PlayTarget, ProgressEntry, WatchFile, WatchTitle } from './watchTypes'

/** Below this many seconds in, "Resume" is just "Play": nobody wants to resume at 0:04. */
const RESUME_THRESHOLD = 10
const DAY = 24 * 3600 * 1000

/** Mirrors the server: the last 90 seconds, or past 95 percent, counts as watched. */
export const isCompleted = (position: number, duration: number): boolean =>
  duration > 0 && (position / duration >= 0.95 || duration - position <= 90)

const pad = (value: number): string => String(value).padStart(2, '0')

export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`
}

export function formatRuntime(seconds: number): string {
  const minutesTotal = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(minutesTotal / 60)
  const minutes = minutesTotal % 60
  return hours > 0
    ? formatContent(copy.watchView.hoursMinutes, { hours, minutes })
    : formatContent(copy.watchView.minutesOnly, { minutes })
}

export const episodesOf = (title: WatchTitle): WatchFile[] =>
  [...title.files].sort((left, right) => (left.season ?? 0) - (right.season ?? 0) || (left.episode ?? 0) - (right.episode ?? 0))

export const seasonsOf = (title: WatchTitle): number[] =>
  [...new Set(title.files.map((file) => file.season ?? 1))].sort((left, right) => left - right)

/** The file a movie plays: the sharpest copy, or the first one when sizes tie. */
export const primaryFile = (title: WatchTitle): WatchFile => {
  const files =
    title.kind === 'movie' ? [...title.files].sort((left, right) => (right.height ?? 0) - (left.height ?? 0)) : episodesOf(title)
  return files[0]
}

export const episodeLabel = (file: WatchFile): string =>
  file.season !== null && file.episode !== null
    ? formatContent(copy.watchView.episodeCode, { season: file.season, episode: file.episode })
    : ''

export function runtimeLabel(title: WatchTitle): string {
  if (title.kind === 'series') {
    const seasons = seasonsOf(title).length
    return seasons === 1 ? copy.watchView.oneSeason : formatContent(copy.watchView.manySeasons, { count: seasons })
  }
  if (title.kind === 'album')
    return title.files.length === 1
      ? copy.watchView.oneSong
      : formatContent(copy.watchView.manySongs, { count: title.files.length })
  const duration = primaryFile(title)?.duration
  return duration ? formatRuntime(duration) : ''
}

export function metaParts(title: WatchTitle): string[] {
  const parts: string[] = []
  if (title.year) parts.push(String(title.year))
  const quality = title.kind === 'movie' ? primaryFile(title)?.quality : null
  if (quality && quality !== 'SD') parts.push(quality)
  const runtime = runtimeLabel(title)
  if (runtime) parts.push(runtime)
  return parts
}

export const progressByFile = (progress: readonly ProgressEntry[]): Map<string, ProgressEntry> =>
  new Map(progress.map((entry) => [entry.fileId, entry]))

const lastWatched = (title: WatchTitle, byFile: Map<string, ProgressEntry>): ProgressEntry | null => {
  let latest: ProgressEntry | null = null
  for (const file of title.files) {
    const entry = byFile.get(file.id)
    if (entry && (!latest || entry.updatedAt > latest.updatedAt)) latest = entry
  }
  return latest
}

/** What pressing Play should do: resume where you stopped, move to the next episode, or start from the beginning. */
export function nextToPlay(title: WatchTitle, progress: readonly ProgressEntry[]): PlayTarget {
  const byFile = progressByFile(progress)
  const ordered = title.kind === 'movie' ? [primaryFile(title)] : episodesOf(title)
  const latest = lastWatched(title, byFile)
  if (title.kind !== 'movie' && latest) {
    const index = ordered.findIndex((file) => file.id === latest.fileId)
    if (index >= 0) {
      if (!latest.completed && latest.position > RESUME_THRESHOLD)
        return { title, file: ordered[index], startAt: latest.position }
      if (latest.completed && index + 1 < ordered.length) return { title, file: ordered[index + 1], startAt: 0 }
    }
  }
  if (title.kind === 'movie' && latest && !latest.completed && latest.position > RESUME_THRESHOLD) {
    const file = ordered.find((candidate) => candidate.id === latest.fileId) ?? ordered[0]
    return { title, file, startAt: latest.position }
  }
  return { title, file: ordered[0], startAt: 0 }
}

/** True when the title has something in progress, or a next episode waiting. */
export function canResume(title: WatchTitle, progress: readonly ProgressEntry[]): boolean {
  const target = nextToPlay(title, progress)
  return target.startAt > 0 || (title.kind !== 'movie' && target.file.id !== episodesOf(title)[0]?.id)
}

export const episodeAfter = (title: WatchTitle, file: WatchFile): WatchFile | null => {
  const ordered = episodesOf(title)
  const index = ordered.findIndex((candidate) => candidate.id === file.id)
  return index >= 0 && index + 1 < ordered.length ? ordered[index + 1] : null
}

/** 0 to 1 for a card's progress bar: how far into the file the viewer would resume. */
export function progressFraction(title: WatchTitle, progress: readonly ProgressEntry[]): number {
  const target = nextToPlay(title, progress)
  const entry = progressByFile(progress).get(target.file.id)
  if (!entry || entry.completed || entry.duration <= 0 || target.startAt <= 0) return 0
  return Math.min(1, entry.position / entry.duration)
}

export type Row = { id: string; title: string; items: WatchTitle[]; kind: 'continue' | 'standard' | 'wide' }

const newestFirst = (left: WatchTitle, right: WatchTitle): number =>
  right.addedAt.localeCompare(left.addedAt) || (right.year ?? 0) - (left.year ?? 0) || left.title.localeCompare(right.title)
const byYear = (left: WatchTitle, right: WatchTitle): number =>
  (right.year ?? 0) - (left.year ?? 0) || left.title.localeCompare(right.title)

/** Titles added after the first import and within the last week. The first import would otherwise mark everything new. */
export function newTitleIds(titles: readonly WatchTitle[], nowMs: number): Set<string> {
  if (titles.length === 0) return new Set()
  const times = titles.map((title) => Date.parse(title.addedAt)).filter(Number.isFinite)
  const firstImport = Math.min(...times)
  return new Set(
    titles
      .filter((title) => {
        const added = Date.parse(title.addedAt)
        return added - firstImport > DAY && nowMs - added < 7 * DAY
      })
      .map((title) => title.id),
  )
}

export function buildRows(titles: readonly WatchTitle[], progress: readonly ProgressEntry[], list: readonly string[]): Row[] {
  const rows: Row[] = []
  const byId = new Map(titles.map((title) => [title.id, title]))
  const byFile = progressByFile(progress)

  const continuing = titles
    .map((title) => ({ title, latest: lastWatched(title, byFile) }))
    .filter(
      (item): item is { title: WatchTitle; latest: ProgressEntry } =>
        item.latest !== null && canResume(item.title, progress) && item.title.kind !== 'album',
    )
    .sort((left, right) => right.latest.updatedAt.localeCompare(left.latest.updatedAt))
    .map((item) => item.title)
  if (continuing.length > 0)
    rows.push({ id: 'continue', title: copy.watchView.continueWatching, items: continuing, kind: 'continue' })

  const listed = list.map((id) => byId.get(id)).filter((title): title is WatchTitle => title !== undefined)
  if (listed.length > 0) rows.push({ id: 'list', title: copy.watchView.myList, items: listed, kind: 'standard' })

  const recent = [...titles]
    .filter((title) => title.kind !== 'album')
    .sort(newestFirst)
    .slice(0, 24)
  if (recent.length > 0) rows.push({ id: 'recent', title: copy.watchView.recentlyAdded, items: recent, kind: 'standard' })

  const series = titles.filter((title) => title.kind === 'series').sort(byYear)
  if (series.length > 0) rows.push({ id: 'series', title: copy.watchView.tvSeries, items: series, kind: 'standard' })

  const movies = titles.filter((title) => title.kind === 'movie')
  const languageCounts = new Map<string, number>()
  for (const title of movies)
    for (const language of title.languages) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1)
  const languages = [...languageCounts.entries()]
    .filter(([, count]) => count >= 5)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
  for (const [language] of languages) {
    const items = movies
      .filter((title) => title.languages.includes(language))
      .sort(byYear)
      .slice(0, 30)
    rows.push({
      id: `language:${language}`,
      title: formatContent(copy.watchView.moviesInLanguage, { language }),
      items,
      kind: 'standard',
    })
  }

  return rows
}

const normalise = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export function searchTitles(titles: readonly WatchTitle[], query: string): WatchTitle[] {
  const needle = normalise(query)
  if (!needle) return []
  const words = needle.split(' ')
  const scored: { title: WatchTitle; score: number }[] = []
  for (const title of titles) {
    const name = normalise(title.title)
    const haystack = `${name} ${title.year ?? ''} ${title.languages.map(normalise).join(' ')} ${title.genres.map(normalise).join(' ')} ${title.files.map((file) => normalise(file.title ?? '')).join(' ')}`
    if (!words.every((word) => haystack.includes(word))) continue
    scored.push({ title, score: name.startsWith(needle) ? 0 : name.includes(needle) ? 1 : 2 })
  }
  return scored
    .sort((left, right) => left.score - right.score || left.title.title.localeCompare(right.title.title))
    .map((item) => item.title)
}

export function similarTo(title: WatchTitle, titles: readonly WatchTitle[], limit = 9): WatchTitle[] {
  return titles
    .filter((candidate) => candidate.id !== title.id && candidate.kind === title.kind)
    .map((candidate) => ({
      candidate,
      score:
        candidate.languages.filter((language) => title.languages.includes(language)).length * 2 +
        candidate.genres.filter((genre) => title.genres.includes(genre)).length * 3 +
        (candidate.year !== null && title.year !== null && Math.abs(candidate.year - title.year) <= 2 ? 1 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.title.localeCompare(right.candidate.title))
    .slice(0, limit)
    .map((item) => item.candidate)
}

/** The title for the large banner: something to continue, otherwise the newest film or series that already has a wide picture. */
export function pickFeatured(titles: readonly WatchTitle[], progress: readonly ProgressEntry[]): WatchTitle | null {
  const byFile = progressByFile(progress)
  const watchable = titles.filter((title) => title.kind !== 'album')
  const continuing = watchable
    .map((title) => ({ title, latest: lastWatched(title, byFile) }))
    .filter(
      (item): item is { title: WatchTitle; latest: ProgressEntry } => item.latest !== null && canResume(item.title, progress),
    )
    .sort((left, right) => right.latest.updatedAt.localeCompare(left.latest.updatedAt))[0]
  if (continuing) return continuing.title
  const withPicture = [...watchable].sort(newestFirst).filter((title) => title.art.backdrop !== null)
  return withPicture[0] ?? [...watchable].sort(newestFirst)[0] ?? null
}
