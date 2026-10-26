export type Cue = { start: number; end: number; text: string }

const TIMESTAMP = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/

const toSeconds = (match: RegExpExecArray): number =>
  Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000

const decode = (value: string): string =>
  value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** Parses WebVTT (and tolerant SRT) into plain-text cues sorted by start time. Markup is stripped, never rendered. */
export function parseCues(source: string): Cue[] {
  const cues: Cue[] = []
  for (const block of source.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const timing = lines.findIndex((line) => line.includes('-->'))
    if (timing < 0) continue
    const [from, to] = lines[timing].split('-->')
    const start = TIMESTAMP.exec(from ?? '')
    const end = TIMESTAMP.exec(to ?? '')
    if (!start || !end) continue
    const text = decode(lines.slice(timing + 1).join('\n')).trim()
    if (text) cues.push({ start: toSeconds(start), end: toSeconds(end), text })
  }
  return cues.sort((left, right) => left.start - right.start)
}

/** The cue showing at `time`, or null. Cues are sorted, so this is a binary search. */
export function activeCue(cues: readonly Cue[], time: number): Cue | null {
  let low = 0
  let high = cues.length - 1
  let candidate = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (cues[middle].start <= time) {
      candidate = middle
      low = middle + 1
    } else high = middle - 1
  }
  // Overlapping cues are rare, so look a few back for one that is still showing.
  for (let index = candidate; index >= 0 && index > candidate - 4; index -= 1) if (time < cues[index].end) return cues[index]
  return null
}
