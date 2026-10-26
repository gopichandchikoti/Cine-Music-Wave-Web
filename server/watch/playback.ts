import path from 'node:path'
import type { ClientCapabilities, OutputContainer, PlaybackPlan, PlaybackProfile, ProbeSummary, ProbedAudio } from './types.js'

// The browser reports what it can decode; the server decides, per file, whether to play the original, repackage it, or convert it.
// This is the same decision Plex, Jellyfin and Netflix make, so playback never depends on the codecs inside a particular file.

const CONTAINER_TOKENS = new Set(['mp4', 'webm', 'mkv'])
const VIDEO_TOKENS = new Set(['h264', 'hevc', 'hevc10', 'vp9', 'av1'])
const AUDIO_TOKENS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'ac3', 'eac3'])
const PROFILES = new Set<PlaybackProfile>(['auto', 'direct', 'remux', 'h264', 'webm'])

const tokens = (raw: unknown, allowed: ReadonlySet<string>): Set<string> => {
  if (typeof raw !== 'string' || raw.length > 80) return new Set()
  return new Set(
    raw
      .toLowerCase()
      .split('.')
      .filter((token) => allowed.has(token)),
  )
}

export const parseCapabilities = (query: { c?: unknown; v?: unknown; a?: unknown }): ClientCapabilities => ({
  containers: tokens(query.c, CONTAINER_TOKENS),
  video: tokens(query.v, VIDEO_TOKENS),
  audio: tokens(query.a, AUDIO_TOKENS),
})

export const parseProfile = (raw: unknown): PlaybackProfile =>
  typeof raw === 'string' && PROFILES.has(raw as PlaybackProfile) ? (raw as PlaybackProfile) : 'auto'

const containerOf = (extension: string): string | null => {
  const value = extension.toLowerCase()
  if (value === '.mp4' || value === '.m4v' || value === '.mov' || value === '.m4a') return 'mp4'
  if (value === '.webm') return 'webm'
  if (value === '.mkv') return 'mkv'
  return null
}

// Audio files that need no container support from the browser: a decodable codec in the file's own format plays as it is.
const AUDIO_FILE_CODECS: Record<string, readonly string[]> = {
  '.mp3': ['mp3'],
  '.flac': ['flac'],
  '.ogg': ['vorbis', 'opus'],
  '.opus': ['opus'],
  '.aac': ['aac'],
}

const isHighBitDepthH264 = (profile: string | null): boolean => /high\s*(10|4:2:2|4:4:4)|hi(10|422|444)/i.test(profile ?? '')

export function canPlayVideo(probe: ProbeSummary, caps: ClientCapabilities): boolean {
  const video = probe.video
  if (!video) return true
  if (video.hdr) return false
  switch (video.codec) {
    case 'h264':
      return caps.video.has('h264') && video.bitDepth <= 8 && !isHighBitDepthH264(video.profile)
    case 'hevc':
      return video.bitDepth > 8 ? caps.video.has('hevc10') : caps.video.has('hevc')
    case 'vp9':
      return caps.video.has('vp9') && video.bitDepth <= 8
    case 'av1':
      return caps.video.has('av1') && video.bitDepth <= 10
    default:
      return false
  }
}

const audioCodecName = (audio: ProbedAudio): string => (audio.codec === 'mp3float' ? 'mp3' : audio.codec)

export function canPlayAudio(audio: ProbedAudio | null, caps: ClientCapabilities): boolean {
  if (!audio) return true
  return caps.audio.has(audioCodecName(audio))
}

export const defaultAudioOrdinal = (probe: ProbeSummary): number => probe.audio.find((track) => track.default)?.ordinal ?? 0

export type PlanOptions = {
  audioOrdinal: number | null
  profile: PlaybackProfile
  /** Positive plays the sound later than the picture, negative earlier. Anything but 0 needs the server to re-time the audio. */
  audioDelayMs?: number
}

/** The audio the server writes when it has to convert: AAC for everything, Opus only for a browser that cannot decode AAC. */
const convertedAudio = (caps: ClientCapabilities): 'aac' | 'opus' =>
  !caps.audio.has('aac') && caps.audio.has('opus') ? 'opus' : 'aac'

export function planPlayback(
  probe: ProbeSummary,
  extension: string,
  caps: ClientCapabilities,
  options: PlanOptions,
): PlaybackPlan {
  const chosen = options.audioOrdinal ?? defaultAudioOrdinal(probe)
  const audio = probe.audio[chosen] ?? probe.audio[0] ?? null
  const container = containerOf(extension)
  const videoOk = canPlayVideo(probe, caps)
  const delayMs = options.audioDelayMs ?? 0
  // Re-timing the audio means decoding and re-encoding it, so the original audio can only be copied when there is no offset.
  const audioOk = canPlayAudio(audio, caps) && delayMs === 0
  const containerOk = container !== null && caps.containers.has(container)
  // Browsers pick the first audio track of a file; any other choice needs the server to select it.
  const defaultIsFirst = probe.audio.length <= 1 || (chosen === defaultAudioOrdinal(probe) && chosen === 0)

  if (options.profile === 'direct')
    return { mode: 'direct', videoCodec: 'copy', audioCodec: 'copy', container: 'original', reason: 'Playing the original file.' }
  const plainAudioFile =
    !probe.video &&
    audio !== null &&
    audioOk &&
    (AUDIO_FILE_CODECS[extension.toLowerCase()] ?? []).includes(audioCodecName(audio))
  if (options.profile === 'auto' && (plainAudioFile || (containerOk && videoOk && audioOk && defaultIsFirst))) {
    return { mode: 'direct', videoCodec: 'copy', audioCodec: 'copy', container: 'original', reason: 'Playing the original file.' }
  }

  const audioLabel = audio ? audio.codec.toUpperCase() : 'audio'
  if ((options.profile === 'auto' || options.profile === 'remux') && videoOk && probe.video && caps.containers.has('mp4')) {
    return {
      mode: 'remux',
      videoCodec: 'copy',
      audioCodec: audioOk ? 'copy' : convertedAudio(caps),
      container: 'mp4',
      reason: audioOk
        ? 'Repackaging for your browser.'
        : delayMs !== 0
          ? 'Adjusting the audio sync.'
          : `Converting ${audioLabel} audio for your browser.`,
    }
  }

  const useWebm = options.profile === 'webm' || (options.profile !== 'h264' && !caps.video.has('h264') && caps.video.has('vp9'))
  const videoCodec = !probe.video ? 'copy' : useWebm ? 'vp9' : 'h264'
  const outputContainer: OutputContainer = useWebm ? 'webm' : 'mp4'
  return {
    mode: 'transcode',
    videoCodec,
    audioCodec: useWebm ? 'opus' : convertedAudio(caps),
    container: outputContainer,
    reason: probe.video
      ? `Converting ${probe.video.codec.toUpperCase()} video for your browser.`
      : `Converting ${audioLabel} audio for your browser.`,
  }
}

export type StreamArgsInput = {
  path: string
  probe: ProbeSummary
  plan: PlaybackPlan
  audioOrdinal: number | null
  start: number
  maxHeight: number
  encoder: 'x264' | 'amf'
  audioDelayMs?: number
}

export const HDR_TO_SDR =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv'

/**
 * Resamples the audio onto the video clock. An offset moves every audio timestamp: later pads the start with silence, earlier
 * trims it, and whatever offset the file already had is kept (cutting from the start would throw that offset away).
 */
export function audioFilter(delayMs: number): string {
  const steps: string[] = []
  if (delayMs !== 0) steps.push(`asetpts=PTS${delayMs > 0 ? '+' : '-'}${(Math.abs(delayMs) / 1000).toFixed(3)}/TB`)
  steps.push('aresample=async=1:first_pts=0')
  return steps.join(',')
}

/** The ffmpeg command line that produces a fragmented stream the browser can start playing immediately. */
export function buildStreamArgs(input: StreamArgsInput): string[] {
  const { probe, plan } = input
  if (!path.isAbsolute(input.path)) throw new Error('The media path must be absolute.')
  const chosen = input.audioOrdinal ?? defaultAudioOrdinal(probe)
  const audio = probe.audio[chosen] ?? probe.audio[0] ?? null
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin']
  if (input.start > 0) args.push('-ss', input.start.toFixed(3))
  args.push('-i', input.path)
  if (probe.video) args.push('-map', `0:${probe.video.index}`)
  if (audio) args.push('-map', `0:${audio.index}`)
  args.push('-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1')

  if (!probe.video) {
    args.push('-vn')
  } else if (plan.videoCodec === 'copy') {
    args.push('-c:v', 'copy')
    if (probe.video.codec === 'hevc') args.push('-tag:v', 'hvc1')
  } else {
    const filters: string[] = []
    if (probe.video.height > input.maxHeight) filters.push(`scale=-2:${input.maxHeight}`)
    if (probe.video.hdr) filters.push(HDR_TO_SDR)
    filters.push('format=yuv420p')
    args.push('-vf', filters.join(','))
    if (plan.videoCodec === 'vp9') {
      args.push('-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '6', '-row-mt', '1', '-b:v', '0', '-crf', '32')
    } else if (input.encoder === 'amf') {
      args.push('-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '22', '-qp_p', '24', '-profile:v', 'high')
    } else {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-profile:v', 'high', '-level', '4.1')
    }
    // A keyframe every two seconds keeps the first frame fast and lets the browser seek inside what it has buffered.
    args.push('-force_key_frames', 'expr:gte(t,n_forced*2)')
  }

  if (audio) {
    if (plan.audioCodec === 'copy') args.push('-c:a', 'copy')
    else if (plan.audioCodec === 'opus') args.push('-c:a', 'libopus', '-b:a', '128k', '-ac', '2')
    else args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2')
    if (plan.audioCodec !== 'copy') args.push('-af', audioFilter(input.audioDelayMs ?? 0))
  }

  if (plan.container === 'webm') {
    args.push('-f', 'webm')
  } else {
    // Dolby audio can only be copied into MP4 once ffmpeg has parsed its first packets, so the header waits for the first fragment.
    const dolbyCopy = plan.audioCodec === 'copy' && audio !== null && (audio.codec === 'eac3' || audio.codec === 'ac3')
    args.push('-f', 'mp4', '-movflags', `+frag_keyframe+empty_moov+default_base_moof${dolbyCopy ? '+delay_moov' : ''}`)
  }
  args.push('pipe:1')
  return args
}

export const streamContentType = (plan: PlaybackPlan, probe: ProbeSummary): string => {
  const isAudioOnly = probe.video === null
  if (plan.container === 'webm') return isAudioOnly ? 'audio/webm' : 'video/webm'
  return isAudioOnly ? 'audio/mp4' : 'video/mp4'
}
