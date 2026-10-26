// Lyrics come from a .lrc file beside the song, or from the lyrics the song carries inside it. Timed lyrics (LRC) scroll in step with the
// music; plain lyrics are just shown.

export type LyricLine = { time: number; text: string }
export type Lyrics = { synced: LyricLine[] | null; plain: string | null; source: 'file' | 'tag' | null }

const MAX_LYRICS_CHARS = 100_000
const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g

const seconds = (minutes: string, whole: string, fraction: string | undefined): number =>
  Number(minutes) * 60 + Number(whole) + (fraction ? Number(fraction) / 10 ** fraction.length : 0)

/** Parses timed lyrics; returns null unless there are at least three timed lines. Several time tags on one line repeat it (a chorus). */
export function parseLrc(source: string): LyricLine[] | null {
  const text = source.slice(0, MAX_LYRICS_CHARS).replace(/\r\n?/g, '\n')
  const offset = Number(/\[offset:\s*([+-]?\d+)\s*\]/i.exec(text)?.[1] ?? 0) / 1000
  const lines: LyricLine[] = []
  for (const row of text.split('\n')) {
    const stamps = [...row.matchAll(TIME_TAG)]
    if (stamps.length === 0) continue
    const words = row
      .replace(TIME_TAG, '')
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '')
      .trim()
    for (const stamp of stamps)
      lines.push({
        time: Math.max(0, seconds(stamp[1], stamp[2], stamp[3]) - (Number.isFinite(offset) ? offset : 0)),
        text: words,
      })
  }
  if (lines.filter((line) => line.text).length < 3) return null
  lines.sort((left, right) => left.time - right.time)
  // An empty line only matters as a pause, so a run of them collapses into one.
  return lines.filter((line, index) => line.text !== '' || (index > 0 && lines[index - 1].text !== ''))
}

/** Lyrics without timing, with any LRC tags removed. */
export function plainLyrics(source: string): string {
  return source
    .slice(0, MAX_LYRICS_CHARS)
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*\[[a-z]{2,8}:[^\]]*\]\s*$/gim, '')
    .replace(TIME_TAG, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Chooses synced or plain lyrics from raw text, wherever it came from. */
export function lyricsFromText(text: string, source: 'file' | 'tag'): Lyrics | null {
  const synced = parseLrc(text)
  if (synced) return { synced, plain: null, source }
  const plain = plainLyrics(text)
  return plain.length >= 8 ? { synced: null, plain, source } : null
}
