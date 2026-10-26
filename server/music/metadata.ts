// Song files downloaded from film-music sites carry tags like title "[iSongs.info] 01 - Aakupachhani Chandamaamalaa", artist "[UrsTelugu.Net]",
// album "Jyo Achyutananda - (2016)" and genre "www.AtoZmp3.in". This turns them into what a music app should show: a song, its singers,
// the film (album) and year, and the cast. Nothing here edits a file; it only changes what is displayed and grouped.

import { parseAlbumFolder, parseTrackName, titleKey } from '../watch/filename.js'
import type { ProbedTags } from '../watch/types.js'

const TLD = 'com|net|org|in|info|asia|co|me|fm|ws|biz|pk|cc|us|tv|io|xyz|app|site|online|mobi|name'
const domainPattern = (flags: string): RegExp =>
  new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?[\\p{L}\\p{N}]+(?:\\.[\\p{L}\\p{N}]+)*\\.(?:${TLD})(?![\\p{L}\\p{N}])`, flags)

const AUDIO_EXTENSION = /\.(?:mp3|m4a|aac|ogg|opus|wav|flac)\s*$/i
const LANGUAGES: Record<string, string> = {
  telugu: 'Telugu',
  tel: 'Telugu',
  tamil: 'Tamil',
  tam: 'Tamil',
  hindi: 'Hindi',
  hin: 'Hindi',
  malayalam: 'Malayalam',
  mal: 'Malayalam',
  kannada: 'Kannada',
  kan: 'Kannada',
  english: 'English',
  eng: 'English',
  punjabi: 'Punjabi',
  bengali: 'Bengali',
  marathi: 'Marathi',
  korean: 'Korean',
}
const JUNK_GENRES = new Set(['other', 'indian', 'unknown', 'various', 'genre', 'mp3', 'music', 'songs', 'audio'])

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim()

/** True for text that is a website or an uploader tag rather than a name: "[UrsTelugu.Net]", "TeluguMp3.Asia", "www.fdmr.in". */
export function looksLikeSite(value: string): boolean {
  const text = value.trim()
  return (
    /^\[.*\]$/.test(text) ||
    domainPattern('iu').test(text) ||
    /\bwww\b/i.test(text) ||
    /mp3/i.test(text) ||
    /telugu\s*wap|\bwap\b/i.test(text)
  )
}

/** Removes site names, uploader brackets and underscores from a tagged or file-name string. */
function stripSites(input: string): string {
  // Underscores first: they count as word characters, which would hide a bitrate like "_128Kbps" from the checks below.
  return input
    .replace(/_/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*(?:www|\.(?:com|net|in|info|asia|co))[^)]*\)/gi, ' ')
    .replace(domainPattern('giu'), ' ')
    .replace(/\b(?:www|https?)\b\S*/gi, ' ')
    .replace(/\(?\b\d{2,3}\s*kbps\b\)?/gi, ' ')
    .replace(/\.(?:mp3|m4a|aac|ogg|opus|wav|flac)\b/gi, ' ')
    .replace(/(?<![\p{L}\p{N}])mp3(?![\p{L}\p{N}])/giu, ' ')
}

const trimSeparators = (value: string): string =>
  collapse(value)
    .replace(/^[\s\-–—|:.,]+/, '')
    .replace(/[\s\-–—|:,]+$/, '')

/** Capitalises a name that was written all in lower case ("sun raha hai na tu"); a name with any capital is left as it is. */
function capitalise(value: string): string {
  if (value !== value.toLowerCase()) return value
  return value.replace(/(^|[\s(])(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase())
}

// "Emjarugutondi - Mahatma (2009)": a file name that carries the film as well as the song. Only the song is the title.
const SONG_AND_FILM = /^(.+?)\s+[-–]\s+[^()]+\((?:19|20)\d\d\)\s*$/u

function titleFrom(raw: string | null | undefined): string {
  const stripped = trimSeparators(
    stripSites((raw ?? '').replace(AUDIO_EXTENSION, ''))
      .replace(/^\s*\d{1,3}\s*[-._)]\s+/, '')
      .replace(/^\s*\d{1,3}\s*[-._)]\s*(?=\p{L})/u, '')
      .replace(/^\s*\d{1,2}\s{2,}(?=\p{L})/u, ''),
  )
  return SONG_AND_FILM.exec(stripped)?.[1] ?? stripped
}

/** The song's title: the tag when it has one, otherwise the cleaned file name. */
export function cleanTitle(tag: string | null, fileName: string): string {
  let title = titleFrom(tag)
  if (!/\p{L}/u.test(title)) {
    // "[TeluguMp3.Asia]" style names leave nothing behind; the file name is then the best source.
    title = titleFrom(parseTrackName(fileName).title)
    if (!/\s/.test(title) && /[-_]/.test(title)) title = title.replace(/[-_]+/g, ' ')
  }
  return capitalise(trimSeparators(title)) || 'Untitled'
}

export type CleanAlbum = { name: string; year: number | null }

/** The film (album) name and year: "Jyo Achyutananda - (2016)" becomes { name: 'Jyo Achyutananda', year: 2016 }. */
export function cleanAlbum(tag: string | null, folder: string | null): CleanAlbum {
  const fromTag = stripSites(tag ?? '')
  const yearMatch = /\(((?:19|20)\d\d)\)/.exec(fromTag) ?? /[\s-]((?:19|20)\d\d)\s*$/.exec(fromTag)
  const name = trimSeparators(
    fromTag
      .replace(/\(((?:19|20)\d\d)\)/g, ' ')
      .replace(/[\s-]((?:19|20)\d\d)\s*$/, ' ')
      .replace(/\(\s*\)/g, ' '),
  )
  if (/[\p{L}\p{N}]/u.test(name)) return { name: capitalise(name), year: yearMatch ? Number(yearMatch[1]) : null }
  // The tag was only a site name: the folder is the next best guess, unless it is just the shared "audios" folder.
  const parsed = folder ? parseAlbumFolder(folder) : null
  if (parsed && parsed.title !== 'Songs') return { name: parsed.title, year: parsed.year }
  return { name: 'Singles', year: yearMatch ? Number(yearMatch[1]) : null }
}

const NAME_SPLIT = /\s*(?:,|;|\/|&|\+|\bfeat\.?|\bft\.?|\bfeaturing\b|\band\b|\bwith\b|\bx\b)\s*/i

/** Splits "Karthik, Ramya Behara" or "S.P.Balasubrahmanyam & Swarnalatha" into individual names, dropping site tags and notes like "(Humming)". */
export function splitNames(raw: string | null, limit = 10): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const piece of raw.replace(/\([^)]*\)/g, ' ').split(NAME_SPLIT)) {
    const name = collapse(piece).replace(/^[\s.\-–]+|[\s,\-–]+$/g, '')
    if (!name || name.length > 60 || looksLikeSite(name) || !/\p{L}/u.test(name)) continue
    const key = nameKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length >= limit) break
  }
  return names
}

/** Two spellings of one person ("S.P.Balasubrahmanyam", "S. P. Balasubrahmanyam") share a key. */
export const nameKey = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

export function detectLanguage(...sources: (string | null | undefined)[]): string | null {
  for (const source of sources) {
    if (!source) continue
    for (const word of source.toLowerCase().split(/[^\p{L}]+/u)) if (LANGUAGES[word]) return LANGUAGES[word]
    // "TeluguMp3" and "TeluguWap" run the language into a site name.
    const embedded = Object.keys(LANGUAGES)
      .filter((key) => key.length > 3)
      .find((key) => source.toLowerCase().includes(key))
    if (embedded) return LANGUAGES[embedded]
  }
  return null
}

/** A genre worth showing: site names and "Other" are dropped, and a bare language is reported as the language instead. */
export function cleanGenre(raw: string | null): string | null {
  if (!raw || looksLikeSite(raw)) return null
  const text = trimSeparators(stripSites(raw).replace(/\(\s*\)/g, ' '))
  if (!/\p{L}/u.test(text) || JUNK_GENRES.has(text.toLowerCase()) || LANGUAGES[text.toLowerCase()]) return null
  return text.length > 40 ? null : capitalise(text)
}

export const parseYear = (value: string | null): number | null => {
  const year = Number(/(?:19|20)\d\d/.exec(value ?? '')?.[0])
  return Number.isFinite(year) && year <= new Date().getUTCFullYear() + 1 ? year : null
}

export const parseNumber = (value: string | null): number | null => {
  const number = Number.parseInt(/^\s*(\d+)/.exec(value ?? '')?.[1] ?? '', 10)
  return Number.isFinite(number) && number > 0 ? number : null
}

export type CleanTags = {
  title: string
  artists: string[]
  album: string
  albumKey: string
  year: number | null
  track: number | null
  disc: number | null
  genre: string | null
  language: string | null
  cast: string[]
  bpm: number | null
  hasLyrics: boolean
}

/** Everything the music library shows about one file, from its tags, its name and the folder it sits in. */
export function cleanTags(tags: ProbedTags | null, relativePath: string): CleanTags {
  const segments = relativePath.split('/')
  const fileName = segments[segments.length - 1] ?? relativePath
  const folder = segments.length > 1 ? segments[segments.length - 2] : null
  const album = cleanAlbum(tags?.album ?? null, folder)
  const year = parseYear(tags?.date ?? null) ?? album.year
  return {
    title: cleanTitle(tags?.title ?? null, fileName),
    artists: splitNames(tags?.artist ?? null),
    album: album.name,
    albumKey: `${titleKey(album.name)}:${year ?? ''}`,
    year,
    track: parseNumber(tags?.track ?? null) ?? parseTrackName(fileName).track,
    disc: parseNumber(tags?.disc ?? null),
    genre: cleanGenre(tags?.genre ?? null),
    language: detectLanguage(tags?.language, tags?.genre, album.name, ...segments.slice(0, -1)),
    cast: splitNames(tags?.albumArtist ?? null, 8),
    bpm: tags?.bpm ?? null,
    hasLyrics: tags?.hasLyrics ?? false,
  }
}
