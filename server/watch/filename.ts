// Turns the noisy file names that downloads and Telegram channels produce into catalog metadata.
// "@PH_FILES - - Do Patti (2024) TRUE WEB-DL - 1080p - AVC - [T.mkv" becomes { title: 'Do Patti', year: 2024 }.
// The catalog JSON is the source of truth afterwards, so a wrong guess is fixed by editing the title there.

export type ParsedVideoName = {
  title: string
  year: number | null
  season: number | null
  episode: number | null
  episodeTitle: string | null
  languages: string[]
}

export type ParsedTrackName = { title: string; track: number | null }

const LANGUAGES: Record<string, string> = {
  tel: 'Telugu',
  telugu: 'Telugu',
  tam: 'Tamil',
  tamil: 'Tamil',
  hin: 'Hindi',
  hindi: 'Hindi',
  mal: 'Malayalam',
  malayalam: 'Malayalam',
  kan: 'Kannada',
  kannada: 'Kannada',
  eng: 'English',
  english: 'English',
  kor: 'Korean',
  korean: 'Korean',
}

// Words that belong to a channel or uploader tag rather than to the title (only stripped right after an "@handle").
const HANDLE_WORDS = new Set([
  'tg',
  'movies4u',
  'movies',
  'files',
  'file',
  'qm',
  'mj',
  'link',
  '4u',
  'linkzz',
  'linkzzz',
  'ms',
  'sy',
  'cc',
  'moviez',
  'channel',
  'vgcinemas',
  'tamilmob',
  'team',
  'tigerss',
  'telugupalaka',
  'ht',
  'mna',
  'hd',
  'force',
  'ph',
  'mf',
])

const QUALITY_TOKEN = new RegExp(
  '^(?:\\d{3,4}p|4k|uhd|hdr\\d*|sdr|web-?dl|webdl|web-?rip|hdrip|bluray|brrip|bdrip|dvdscr|dvdrip|hdtv|hdcam|camrip|[x×]26[45]|h\\.?26[45]|hevc|avc|av1|aac\\d?|ac3|eac3|ddp?\\+?\\d?|10bit|8ch|6ch|2ch|esubs?|multiaudio|atmos|remastered|unrated|proper|repack)$',
  'i',
)
const ROMAN = /^(?:i{1,3}|iv|v|vi{0,3}|ix|x)$/i
const MAX_YEAR = new Date().getUTCFullYear() + 1

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim()

/** Lowercase letters and digits only; two spellings of one title share a key. */
export const titleKey = (title: string): string => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

function titleCase(title: string): string {
  const letters = title.replace(/[^\p{L}]/gu, '')
  if (!letters || (letters !== letters.toUpperCase() && letters !== letters.toLowerCase())) return title
  return title.replace(/[\p{L}][\p{L}']*/gu, (word) => {
    const lower = word.toLowerCase()
    if (ROMAN.test(word) && word === word.toUpperCase()) return word
    if (word.length <= 2 || new Set(word.toLowerCase()).size === 1) return word.toUpperCase()
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })
}

function detectLanguages(text: string): string[] {
  const found = new Set<string>()
  for (const token of text.toLowerCase().split(/[^\p{L}]+/u)) if (LANGUAGES[token]) found.add(LANGUAGES[token])
  return [...found]
}

function stripUploaderTags(input: string): string {
  let value = input.normalize('NFKC').replace(/%20/g, ' ')
  value = value.replace(/\.(?:mp4|mkv|avi|webm) at \S+/i, ' ')
  value = value.replace(/\[[^\]]*(?:\]|$)/g, ' ')
  value = value.replace(/^\s*[-–]+\s*/, '')
  value = value.replace(/^www[_.][^\s_.]+[_.][a-z]{2,10}(?=[\s_.-]|$)\s*[-–]?\s*/i, '')
  value = value.replace(/^nsmovies\d*\s+/i, '')
  const handleToken = /^@\S+(?=\s)/.exec(value)?.[0]
  // A real handle is short and has no year in it; a long token is the title run together with underscores.
  if (handleToken && handleToken.length <= 24 && !/(?:19|20)\d\d/.test(handleToken)) {
    value = value.slice(handleToken.length)
  } else if (value.startsWith('@')) {
    const tokens = value.split(/[_.]/)
    tokens.shift()
    while (tokens.length > 1 && HANDLE_WORDS.has(tokens[0].toLowerCase())) tokens.shift()
    if (tokens.length > 0) tokens[0] = tokens[0].replace(/^Link[Zz]+(?=[A-Z])/, '')
    value = tokens.join(' ')
  }
  value = value.replace(/^[\s\-–_.]+/, '')
  // Dots separate words in "Spider-Man.2017.1080p" names, but not in "Mr. Bachchan" or "5.1".
  const dotted = (value.match(/(?<=\S)\.(?=\S)/g) ?? []).length >= 3
  if (dotted) value = value.replace(/\bH\.(26[45])\b/gi, 'H$1')
  return /\s/.test(value) && !dotted ? value.replace(/_/g, ' ') : value.replace(/[._]/g, ' ')
}

type Token = { text: string; index: number }

function tokenize(value: string): Token[] {
  const tokens: Token[] = []
  for (const match of value.matchAll(/\S+/g)) tokens.push({ text: match[0], index: match.index })
  return tokens
}

function findYear(value: string, firstStop: number): { year: number; index: number } | null {
  const parenthesized = [...value.matchAll(/\(((?:19|20)\d\d)\)/g)].filter((match) => Number(match[1]) <= MAX_YEAR)
  if (parenthesized.length > 0) {
    const last = parenthesized[parenthesized.length - 1]
    return { year: Number(last[1]), index: last.index }
  }
  const bare = [...value.matchAll(/(?<!\d)((?:19|20)\d\d)(?=\D|\d{3,4}p|$)/g)].filter(
    (match) => match.index > 0 && Number(match[1]) <= MAX_YEAR,
  )
  const beforeStop = bare.filter((match) => match.index < firstStop)
  const chosen = beforeStop.length > 0 ? beforeStop[beforeStop.length - 1] : bare[0]
  return chosen ? { year: Number(chosen[1]), index: chosen.index } : null
}

function tidyTitle(value: string): string {
  const withoutDuplicateMarkers = value.replace(/\(\d\)\s*$/g, '')
  return titleCase(collapse(withoutDuplicateMarkers.replace(/[\s(\-–,:]+$/g, '').replace(/^[\s)\-–,:]+/, '')))
}

export function parseVideoName(fileName: string, folders: readonly string[] = []): ParsedVideoName {
  const stem = fileName.replace(/\.[A-Za-z0-9]{2,4}$/, '')
  const languages = detectLanguages([stem, ...folders].join(' '))
  const cleaned = collapse(stripUploaderTags(stem))
  const tokens = tokenize(cleaned)

  let season: number | null = null
  let episode: number | null = null
  let episodeIndex = -1
  let episodeEnd = -1
  const seasonEpisode = /\bS(\d{1,2})[\s._-]*E(?:P)?[\s._(-]*(\d{1,3})/i.exec(cleaned)
  const seasonOnly = /\bS(\d{1,2})\b/i.exec(cleaned)
  if (seasonEpisode) {
    season = Number(seasonEpisode[1])
    episode = Number(seasonEpisode[2])
    episodeIndex = seasonEpisode.index
    episodeEnd = seasonEpisode.index + seasonEpisode[0].length
  } else if (seasonOnly && seasonOnly.index > 0) {
    season = Number(seasonOnly[1])
    episodeIndex = seasonOnly.index
    episodeEnd = seasonOnly.index + seasonOnly[0].length
  }

  let firstStop = Infinity
  tokens.forEach((token, position) => {
    if (position === 0 || firstStop !== Infinity) return
    const word = token.text.replace(/^[(\-–]+|[)\-–,]+$/g, '')
    if (
      QUALITY_TOKEN.test(word) ||
      (position >= 1 && LANGUAGES[word.toLowerCase()] && /^[A-Za-z]+$/.test(word) && word.length > 3)
    )
      firstStop = token.index
  })
  const fullMovie = /\b(?:full length movie|full movie)\b/i.exec(cleaned)
  if (fullMovie && fullMovie.index > 0) firstStop = Math.min(firstStop, fullMovie.index)

  const found = findYear(cleaned, firstStop)
  const cut = Math.min(episodeIndex >= 0 ? episodeIndex : Infinity, found ? found.index : Infinity, firstStop, cleaned.length)
  let title = tidyTitle(cleaned.slice(0, cut).replace(/\bcomplete\s*$/i, ''))
  let year = found?.year ?? null

  if (/^[\d\s]+\w?$/.test(title) && !found && season === null) title = 'Untitled video'
  else if (!title) title = tidyTitle(stem.replace(/[._]/g, ' '))
  if (year === null) {
    for (const folder of folders) {
      const folderYear = /\(((?:19|20)\d\d)\)/.exec(folder)
      if (folderYear && Number(folderYear[1]) <= MAX_YEAR) year = Number(folderYear[1])
    }
  }

  let episodeTitle: string | null = null
  if (episode !== null && episodeEnd >= 0) {
    const rest = cleaned.slice(episodeEnd).split(/\s+/)
    const words: string[] = []
    for (const word of rest) {
      if (!word || QUALITY_TOKEN.test(word) || /^\d{3,4}p$/i.test(word) || /^[x×]26[45]/i.test(word)) break
      words.push(word)
    }
    const candidate = collapse(words.join(' '))
    episodeTitle =
      candidate && candidate.length >= 3 && !/^\d+$/.test(candidate) && !/^(?:ep|episode|repack)\b/i.test(candidate)
        ? candidate
        : null
  }
  return { title, year, season, episode, episodeTitle, languages }
}

export function parseAlbumFolder(folder: string): { title: string; year: number | null } {
  const yearMatch = /\(((?:19|20)\d\d)\)/.exec(folder)
  const withoutTags = collapse(
    folder
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\(((?:19|20)\d\d)\)/g, ' ')
      .replace(/[_]+/g, ' ')
      .replace(/[\s\-–]+$/g, ''),
  )
  const title = withoutTags.toLowerCase() === 'audios' || !withoutTags ? 'Songs' : titleCase(withoutTags)
  return { title, year: yearMatch ? Number(yearMatch[1]) : null }
}

export function parseTrackName(fileName: string): ParsedTrackName {
  const stem = fileName.replace(/\.[A-Za-z0-9]{2,4}$/, '')
  let value = collapse(
    stem
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\(\s*\d{2,3}\s*kbps\s*\)/gi, ' ')
      .replace(/_/g, ' '),
  )
  const number = /^(\d{1,3})\s*[-._)]*\s+(.*)$/.exec(value)
  let track: number | null = null
  if (number && number[2]) {
    track = Number(number[1])
    value = number[2]
  }
  value = collapse(value.replace(/^[\s\-–.]+/, ''))
  return { title: value || stem, track }
}
