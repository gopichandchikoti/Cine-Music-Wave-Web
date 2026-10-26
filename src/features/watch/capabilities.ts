// What this browser can decode. The server uses it to choose, per file, between playing the original, repackaging it,
// or converting it, so playback does not depend on the codecs a downloaded file happens to use.

type Probe = { token: string; label: string; type: string }

const CONTAINERS: Probe[] = [
  { token: 'mp4', label: 'MP4', type: 'video/mp4' },
  { token: 'webm', label: 'WebM', type: 'video/webm' },
  { token: 'mkv', label: 'Matroska (MKV)', type: 'video/x-matroska' },
]

const VIDEO: Probe[] = [
  { token: 'h264', label: 'H.264 (AVC)', type: 'video/mp4; codecs="avc1.640028"' },
  { token: 'hevc', label: 'H.265 (HEVC)', type: 'video/mp4; codecs="hvc1.1.6.L120.90"' },
  { token: 'hevc10', label: 'H.265 10-bit', type: 'video/mp4; codecs="hvc1.2.4.L120.90"' },
  { token: 'vp9', label: 'VP9', type: 'video/webm; codecs="vp9"' },
  { token: 'av1', label: 'AV1', type: 'video/mp4; codecs="av01.0.08M.08"' },
]

const AUDIO: Probe[] = [
  { token: 'aac', label: 'AAC', type: 'audio/mp4; codecs="mp4a.40.2"' },
  { token: 'mp3', label: 'MP3', type: 'audio/mpeg' },
  { token: 'opus', label: 'Opus', type: 'audio/webm; codecs="opus"' },
  { token: 'vorbis', label: 'Vorbis', type: 'audio/webm; codecs="vorbis"' },
  { token: 'flac', label: 'FLAC', type: 'audio/flac' },
  { token: 'ac3', label: 'Dolby Digital (AC-3)', type: 'audio/mp4; codecs="ac-3"' },
  { token: 'eac3', label: 'Dolby Digital Plus (E-AC-3)', type: 'audio/mp4; codecs="ec-3"' },
]

export type CapabilityRow = { group: 'Containers' | 'Video' | 'Audio'; label: string; supported: boolean }

export type BrowserCapabilities = {
  /** Query-string fragment understood by /api/watch/plan and /api/watch/stream. */
  query: string
  rows: CapabilityRow[]
}

/** Audio every browser decodes in practice. Dolby, FLAC and Opus claims are the ones that sometimes turn out to be silent. */
const SAFE_AUDIO = new Set(['aac', 'mp3'])

const supports = (element: HTMLMediaElement, type: string): boolean => {
  try {
    return element.canPlayType(type) !== ''
  } catch {
    return false
  }
}

export function probeCapabilities(element: HTMLMediaElement = document.createElement('video')): BrowserCapabilities {
  const rows: CapabilityRow[] = []
  const tokens = (probes: Probe[], group: CapabilityRow['group']): string =>
    probes
      .filter((probe) => {
        const supported = supports(element, probe.type)
        rows.push({ group, label: probe.label, supported })
        return supported
      })
      .map((probe) => probe.token)
      .join('.')
  const c = tokens(CONTAINERS, 'Containers')
  const v = tokens(VIDEO, 'Video')
  const a = tokens(AUDIO, 'Audio')
  return { query: `c=${c}&v=${v}&a=${a}`, rows }
}

let cached: BrowserCapabilities | null = null

export function browserCapabilities(): BrowserCapabilities {
  if (!cached) cached = probeCapabilities()
  return cached
}

/**
 * The query the server uses to choose how to play a file. With `safeAudio` only AAC and MP3 are offered as playable, so the
 * server converts every other audio format (Dolby, FLAC, Opus) to AAC. Used when a browser claims a codec but plays it silently.
 */
export function capabilitiesQuery(safeAudio: boolean): string {
  const { query } = browserCapabilities()
  if (!safeAudio) return query
  return query.replace(
    /(^|&)a=([^&]*)/,
    (_match, lead: string, list: string) =>
      `${lead}a=${list
        .split('.')
        .filter((token) => SAFE_AUDIO.has(token))
        .join('.')}`,
  )
}
