import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Readable } from 'node:stream'
import {
  PROBE_VERSION,
  type ContentRect,
  type ProbeSummary,
  type ProbedAudio,
  type ProbedSubtitle,
  type ProbedTags,
  type ProbedVideo,
} from './types.js'
import { HDR_TO_SDR } from './playback.js'

export type MediaTools = { ffmpeg: string; ffprobe: string; version: string; amf: boolean }

const EXECUTABLE = process.platform === 'win32' ? '.exe' : ''

type RunResult = { stdout: Buffer; stderr: string }

function run(
  file: string,
  args: string[],
  limits: { timeoutMs: number; maxBytes: number; stderrBytes?: number; lowPriority?: boolean },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    // Background work (hover previews) must never make the film someone is watching stutter.
    if (limits.lowPriority && child.pid !== undefined) {
      try {
        os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
      } catch {
        /* the default priority is fine */
      }
    }
    const chunks: Buffer[] = []
    let size = 0
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('The media tool timed out.'))
    }, limits.timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limits.maxBytes) {
        child.kill()
        reject(new Error('The media tool produced too much output.'))
        return
      }
      chunks.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < (limits.stderrBytes ?? 4000)) stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout: Buffer.concat(chunks), stderr })
      else reject(new Error(stderr.trim().split(/\r?\n/).pop() || `The media tool exited with code ${code}.`))
    })
  })
}

async function versionOf(ffmpeg: string): Promise<string | null> {
  try {
    const { stdout } = await run(ffmpeg, ['-hide_banner', '-version'], { timeoutMs: 8000, maxBytes: 65536 })
    return /version\s+(\S+)/.exec(stdout.toString())?.[1] ?? 'unknown'
  } catch {
    return null
  }
}

/** FFMPEG_PATH (a folder or ffmpeg itself), then the project's .tools/ffmpeg, then whatever is on PATH. */
export async function findMediaTools(appDirectory: string, env: NodeJS.ProcessEnv = process.env): Promise<MediaTools | null> {
  const candidates: { ffmpeg: string; ffprobe: string }[] = []
  const configured = env.FFMPEG_PATH?.trim()
  if (configured) {
    const isFolder = !/ffmpeg(\.exe)?$/i.test(configured)
    const folder = isFolder ? configured : path.dirname(configured)
    candidates.push({ ffmpeg: path.join(folder, `ffmpeg${EXECUTABLE}`), ffprobe: path.join(folder, `ffprobe${EXECUTABLE}`) })
  }
  const local = path.join(appDirectory, '.tools', 'ffmpeg', 'bin')
  candidates.push({ ffmpeg: path.join(local, `ffmpeg${EXECUTABLE}`), ffprobe: path.join(local, `ffprobe${EXECUTABLE}`) })
  candidates.push({ ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' })
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate.ffmpeg) && !(existsSync(candidate.ffmpeg) && existsSync(candidate.ffprobe))) continue
    const version = await versionOf(candidate.ffmpeg)
    if (!version) continue
    let amf = false
    try {
      const { stdout } = await run(candidate.ffmpeg, ['-hide_banner', '-encoders'], { timeoutMs: 8000, maxBytes: 262144 })
      amf = /\bh264_amf\b/.test(stdout.toString())
    } catch {
      /* the encoder list is only used to offer hardware encoding */
    }
    return { ...candidate, version, amf }
  }
  return null
}

const LANGUAGE_NAMES: Record<string, string> = {
  tel: 'Telugu',
  tam: 'Tamil',
  hin: 'Hindi',
  mal: 'Malayalam',
  kan: 'Kannada',
  eng: 'English',
  kor: 'Korean',
  jpn: 'Japanese',
  spa: 'Spanish',
  fre: 'French',
  fra: 'French',
  ger: 'German',
  deu: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  rus: 'Russian',
  chi: 'Chinese',
  zho: 'Chinese',
  ara: 'Arabic',
  ben: 'Bengali',
  mar: 'Marathi',
  pan: 'Punjabi',
  guj: 'Gujarati',
  urd: 'Urdu',
  tha: 'Thai',
  tur: 'Turkish',
  ind: 'Indonesian',
}
const AUDIO_CODEC_NAMES: Record<string, string> = {
  eac3: 'Dolby Digital Plus',
  ac3: 'Dolby Digital',
  aac: 'AAC',
  dts: 'DTS',
  truehd: 'Dolby TrueHD',
  mp3: 'MP3',
  opus: 'Opus',
  flac: 'FLAC',
  vorbis: 'Vorbis',
}
const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'])

export const languageName = (code: string | null): string | null => {
  if (!code) return null
  const lower = code.toLowerCase()
  if (lower === 'und' || lower === 'unk') return null
  return LANGUAGE_NAMES[lower] ?? code.toUpperCase()
}

const channelLabel = (channels: number): string =>
  channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : channels === 6 ? '5.1' : channels === 8 ? '7.1' : `${channels}ch`

type RawStream = {
  index?: number
  codec_type?: string
  codec_name?: string
  profile?: string
  width?: number
  height?: number
  pix_fmt?: string
  bits_per_raw_sample?: string
  channels?: number
  avg_frame_rate?: string
  color_transfer?: string
  tags?: Record<string, string>
  disposition?: Record<string, number>
}
type RawProbe = { format?: { duration?: string; format_name?: string; tags?: Record<string, string> }; streams?: RawStream[] }

/** Tag names differ by format (ID3 is lowercase through ffprobe, Vorbis comments are uppercase), so look them up without case. */
const lowerKeys = (tags: Record<string, string> | undefined): Map<string, string> =>
  new Map(Object.entries(tags ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]))

export function summarizeTags(raw: RawProbe): ProbedTags | null {
  const streams = Array.isArray(raw.streams) ? raw.streams : []
  const merged = lowerKeys(streams.find((stream) => stream.codec_type === 'audio')?.tags)
  for (const [key, value] of lowerKeys(raw.format?.tags)) merged.set(key, value)
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = merged.get(key)?.trim()
      if (value) return value.slice(0, 300)
    }
    return null
  }
  const bpm = Number(pick('bpm', 'tbpm'))
  const tags: ProbedTags = {
    title: pick('title'),
    artist: pick('artist', 'author'),
    albumArtist: pick('album_artist', 'albumartist'),
    album: pick('album'),
    genre: pick('genre'),
    date: pick('date', 'year', 'originaldate'),
    track: pick('track', 'tracknumber'),
    disc: pick('disc', 'discnumber'),
    composer: pick('composer'),
    language: pick('language', 'lang'),
    bpm: Number.isFinite(bpm) && bpm > 30 && bpm < 300 ? Math.round(bpm) : null,
    hasLyrics: ['lyrics', 'unsyncedlyrics', 'syncedlyrics', 'lyrics-eng', 'uslt'].some(
      (key) => (merged.get(key)?.trim().length ?? 0) > 8,
    ),
  }
  return Object.entries(tags).some(([key, value]) => key !== 'hasLyrics' && value !== null) || tags.hasLyrics ? tags : null
}

const bitDepthOf = (stream: RawStream): number => {
  const raw = Number(stream.bits_per_raw_sample)
  if (Number.isFinite(raw) && raw > 0) return raw
  const match = /p(\d{2})/.exec(stream.pix_fmt ?? '')
  return match ? Number(match[1]) : 8
}

const frameRate = (value: string | undefined): number | null => {
  const [top, bottom] = (value ?? '').split('/').map(Number)
  return top > 0 && bottom > 0 ? Math.round((top / bottom) * 100) / 100 : null
}

export function summarizeProbe(raw: unknown): ProbeSummary {
  const probe = (raw && typeof raw === 'object' ? raw : {}) as RawProbe
  const streams = Array.isArray(probe.streams) ? probe.streams : []
  const duration = Number(probe.format?.duration)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('The file has no readable duration.')

  const videoStream =
    streams.find(
      (stream) =>
        stream.codec_type === 'video' &&
        stream.disposition?.attached_pic !== 1 &&
        !['png', 'mjpeg', 'bmp'].includes(stream.codec_name ?? ''),
    ) ?? streams.find((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1)
  const video: ProbedVideo | null =
    videoStream && typeof videoStream.index === 'number'
      ? {
          index: videoStream.index,
          codec: videoStream.codec_name ?? 'unknown',
          profile: videoStream.profile ?? null,
          width: videoStream.width ?? 0,
          height: videoStream.height ?? 0,
          pixFmt: videoStream.pix_fmt ?? null,
          bitDepth: bitDepthOf(videoStream),
          fps: frameRate(videoStream.avg_frame_rate),
          hdr: videoStream.color_transfer === 'smpte2084' || videoStream.color_transfer === 'arib-std-b67',
        }
      : null

  const advertisement = /@|www\.|\.com|exclusive|telegram|join/i
  const audio: ProbedAudio[] = []
  const subtitles: ProbedSubtitle[] = []
  for (const stream of streams) {
    if (typeof stream.index !== 'number') continue
    const code = stream.tags?.language ?? null
    const language = languageName(code)
    if (stream.codec_type === 'audio') {
      const channels = stream.channels ?? 2
      const codec = stream.codec_name ?? 'unknown'
      const detail = `${AUDIO_CODEC_NAMES[codec] ?? codec.toUpperCase()} ${channelLabel(channels)}`
      audio.push({
        ordinal: audio.length,
        index: stream.index,
        codec,
        channels,
        language: code,
        label: `${language ?? `Track ${audio.length + 1}`} · ${detail}`,
        default: stream.disposition?.default === 1,
      })
    } else if (stream.codec_type === 'subtitle') {
      const codec = stream.codec_name ?? 'unknown'
      const title = stream.tags?.title && !advertisement.test(stream.tags.title) ? stream.tags.title : null
      subtitles.push({
        ordinal: subtitles.length,
        index: stream.index,
        codec,
        language: code,
        label: `${language ?? `Subtitles ${subtitles.length + 1}`}${title && title.toLowerCase() !== (language ?? '').toLowerCase() ? ` (${title})` : ''}`,
        default: stream.disposition?.default === 1,
        text: TEXT_SUBTITLE_CODECS.has(codec),
      })
    }
  }
  const coverStream = streams.find(
    (stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic === 1 && typeof stream.index === 'number',
  )
  return {
    duration,
    container: probe.format?.format_name ?? 'unknown',
    video,
    audio,
    subtitles,
    version: PROBE_VERSION,
    tags: summarizeTags(probe),
    cover: coverStream && typeof coverStream.index === 'number' ? { index: coverStream.index } : null,
  }
}

export async function probeFile(tools: MediaTools, absolutePath: string): Promise<ProbeSummary> {
  if (!path.isAbsolute(absolutePath)) throw new Error('The media path must be absolute.')
  const { stdout } = await run(
    tools.ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', absolutePath],
    { timeoutMs: 45000, maxBytes: 4_000_000 },
  )
  return summarizeProbe(JSON.parse(stdout.toString()))
}

/** The last keyframe at or before `seconds`, so a repackaged (not re-encoded) stream starts exactly where the player says it does. */
export async function keyframeAtOrBefore(tools: MediaTools, absolutePath: string, seconds: number): Promise<number> {
  if (seconds <= 0) return 0
  for (const window of [30, 120]) {
    const from = Math.max(0, seconds - window)
    try {
      const { stdout } = await run(
        tools.ffprobe,
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-skip_frame',
          'nokey',
          '-read_intervals',
          `${from.toFixed(3)}%${(seconds + 0.5).toFixed(3)}`,
          '-show_entries',
          'frame=pts_time',
          '-of',
          'csv=p=0',
          absolutePath,
        ],
        { timeoutMs: 20000, maxBytes: 65536 },
      )
      const times = stdout
        .toString()
        .split(/\r?\n/)
        .map((line) => Number.parseFloat(line))
        .filter((value) => Number.isFinite(value) && value <= seconds + 0.001)
      if (times.length > 0) return Math.max(...times)
    } catch {
      break
    }
  }
  return seconds
}

export type MediaProcess = ChildProcessByStdio<null, Readable, Readable>

export function spawnFfmpeg(tools: MediaTools, args: string[]): MediaProcess {
  return spawn(tools.ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
}

export async function extractWebVtt(tools: MediaTools, absolutePath: string, streamIndex: number): Promise<string> {
  const { stdout } = await run(
    tools.ffmpeg,
    ['-v', 'error', '-nostdin', '-i', absolutePath, '-map', `0:${streamIndex}`, '-f', 'webvtt', 'pipe:1'],
    { timeoutMs: 180000, maxBytes: 6_000_000 },
  )
  return stdout.toString('utf8')
}

type PixelRect = { w: number; h: number; x: number; y: number }

/** The largest picture area seen over a second of video starting at `seconds` (cropdetect never shrinks it), or null. */
async function sampleCrop(
  tools: MediaTools,
  absolutePath: string,
  videoIndex: number,
  seconds: number,
): Promise<PixelRect | null> {
  try {
    const { stderr } = await run(
      tools.ffmpeg,
      [
        '-hide_banner',
        '-nostdin',
        '-ss',
        seconds.toFixed(3),
        '-i',
        absolutePath,
        '-map',
        `0:${videoIndex}`,
        '-an',
        '-sn',
        '-frames:v',
        '30',
        '-vf',
        'cropdetect=limit=0.094:round=2:reset=0',
        '-f',
        'null',
        '-',
      ],
      { timeoutMs: 30000, maxBytes: 65536, stderrBytes: 60000 },
    )
    const all = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)]
    const last = all[all.length - 1]
    return last ? { w: Number(last[1]), h: Number(last[2]), x: Number(last[3]), y: Number(last[4]) } : null
  } catch {
    return null
  }
}

/** Finds the real picture inside letterboxed frames, so artwork has no black bars. Returns null when the frame is already full. */
export async function detectCrop(
  tools: MediaTools,
  absolutePath: string,
  videoIndex: number,
  seconds: number,
  size: { width: number; height: number },
): Promise<string | null> {
  const found = await sampleCrop(tools, absolutePath, videoIndex, seconds)
  if (!found) return null
  const savesEnough = found.h < size.height * 0.95 || found.w < size.width * 0.95
  const plausible = found.w * found.h >= size.width * size.height * 0.4
  return savesEnough && plausible ? `crop=${found.w}:${found.h}:${found.x}:${found.y}` : null
}

/**
 * Where the picture sits inside baked-in black bars, as fractions of the frame. Three places in the film are measured and the
 * union is kept, so one dark scene cannot make the picture look smaller than it is. Null means the frame has no worthwhile bars.
 */
export async function detectContentRect(
  tools: MediaTools,
  absolutePath: string,
  video: { index: number; width: number; height: number },
  duration: number,
): Promise<ContentRect | null> {
  if (video.width <= 0 || video.height <= 0) return null
  const samples = (
    await Promise.all(
      [0.2, 0.45, 0.7].map((fraction) => sampleCrop(tools, absolutePath, video.index, Math.max(0, duration * fraction))),
    )
  ).filter((sample): sample is PixelRect => sample !== null)
  if (samples.length === 0) return null
  const left = Math.min(...samples.map((sample) => sample.x))
  const top = Math.min(...samples.map((sample) => sample.y))
  const right = Math.max(...samples.map((sample) => sample.x + sample.w))
  const bottom = Math.max(...samples.map((sample) => sample.y + sample.h))
  const rect = { x: left / video.width, y: top / video.height, w: (right - left) / video.width, h: (bottom - top) / video.height }
  const savesEnough = rect.w < 0.97 || rect.h < 0.97
  const plausible = rect.w * rect.h >= 0.4 && rect.w > 0 && rect.h > 0
  return savesEnough && plausible ? rect : null
}

/** One representative frame becomes both the wide backdrop and the small card image. */
export async function extractVideoArtwork(
  tools: MediaTools,
  absolutePath: string,
  videoIndex: number,
  seconds: number,
  hdr: boolean,
  crop: string | null,
  outputs: { backdrop: string; card: string },
): Promise<void> {
  const graph = `[0:${videoIndex}]${crop ? `${crop},` : ''}thumbnail=120,split=2[a][b];[a]scale=1280:-2${hdr ? `,${HDR_TO_SDR},format=yuvj420p` : ''}[bd];[b]scale=480:-2${hdr ? `,${HDR_TO_SDR},format=yuvj420p` : ''}[cd]`
  await run(
    tools.ffmpeg,
    [
      '-v',
      'error',
      '-nostdin',
      '-y',
      '-ss',
      seconds.toFixed(3),
      '-i',
      absolutePath,
      '-an',
      '-sn',
      '-filter_complex',
      graph,
      '-map',
      '[bd]',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      outputs.backdrop,
      '-map',
      '[cd]',
      '-frames:v',
      '1',
      '-q:v',
      '4',
      outputs.card,
    ],
    { timeoutMs: 90000, maxBytes: 65536 },
  )
}

export async function extractEpisodeThumbnail(
  tools: MediaTools,
  absolutePath: string,
  videoIndex: number,
  seconds: number,
  hdr: boolean,
  crop: string | null,
  output: string,
): Promise<void> {
  const filters = `${crop ? `${crop},` : ''}thumbnail=90,scale=480:-2${hdr ? `,${HDR_TO_SDR},format=yuvj420p` : ''}`
  await run(
    tools.ffmpeg,
    [
      '-v',
      'error',
      '-nostdin',
      '-y',
      '-ss',
      seconds.toFixed(3),
      '-i',
      absolutePath,
      '-map',
      `0:${videoIndex}`,
      '-an',
      '-sn',
      '-vf',
      filters,
      '-frames:v',
      '1',
      '-q:v',
      '4',
      output,
    ],
    { timeoutMs: 60000, maxBytes: 65536 },
  )
}

export type PreviewClip = { seconds: number; length: number; hdr: boolean; crop: string | null }

/** The ffmpeg arguments for a short, silent, universally decodable (H.264 / yuv420p) clip used for hover previews. */
export function buildPreviewArgs(absolutePath: string, videoIndex: number, clip: PreviewClip, output: string): string[] {
  const filters: string[] = []
  if (clip.crop) filters.push(clip.crop)
  filters.push('scale=-2:min(432\\,ih)')
  if (clip.hdr) filters.push(HDR_TO_SDR)
  filters.push('format=yuv420p')
  return [
    '-v',
    'error',
    '-nostdin',
    '-y',
    '-ss',
    clip.seconds.toFixed(3),
    '-t',
    clip.length.toFixed(3),
    '-i',
    absolutePath,
    '-map',
    `0:${videoIndex}`,
    '-an',
    '-sn',
    '-dn',
    '-vf',
    filters.join(','),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '27',
    '-profile:v',
    'main',
    '-level',
    '4.0',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ]
}

export async function extractPreviewClip(
  tools: MediaTools,
  absolutePath: string,
  videoIndex: number,
  clip: PreviewClip,
  output: string,
): Promise<void> {
  await run(tools.ffmpeg, buildPreviewArgs(absolutePath, videoIndex, clip, output), {
    timeoutMs: 120000,
    maxBytes: 65536,
    lowPriority: true,
  })
}

/** The picture embedded in a song file, as a JPEG no larger than 640 px. */
export async function extractMusicCover(
  tools: MediaTools,
  absolutePath: string,
  streamIndex: number,
  output: string,
): Promise<void> {
  await run(
    tools.ffmpeg,
    [
      '-v',
      'error',
      '-nostdin',
      '-y',
      '-i',
      absolutePath,
      '-map',
      `0:${streamIndex}`,
      '-an',
      '-frames:v',
      '1',
      '-vf',
      'scale=640:-2:force_original_aspect_ratio=decrease',
      '-q:v',
      '3',
      output,
    ],
    { timeoutMs: 30000, maxBytes: 65536, lowPriority: true },
  )
}

/** How loud a stretch of a song is. Louder, denser songs read as higher energy. Null when the stretch cannot be decoded. */
export async function measureLoudness(
  tools: MediaTools,
  absolutePath: string,
  startSeconds: number,
  lengthSeconds: number,
): Promise<{ meanDb: number; maxDb: number } | null> {
  try {
    const { stderr } = await run(
      tools.ffmpeg,
      [
        '-hide_banner',
        '-nostdin',
        '-ss',
        startSeconds.toFixed(2),
        '-i',
        absolutePath,
        '-t',
        lengthSeconds.toFixed(2),
        '-vn',
        '-af',
        'volumedetect',
        '-f',
        'null',
        '-',
      ],
      { timeoutMs: 60000, maxBytes: 65536, stderrBytes: 40000, lowPriority: true },
    )
    const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1])
    const max = Number(/max_volume: (-?[\d.]+) dB/.exec(stderr)?.[1])
    return Number.isFinite(mean) && Number.isFinite(max) ? { meanDb: mean, maxDb: max } : null
  } catch {
    return null
  }
}

/** The lyrics a song carries inside it (ID3 USLT, Vorbis LYRICS and the like), as raw text. */
export async function readLyricsTag(tools: MediaTools, absolutePath: string): Promise<string | null> {
  try {
    const { stdout } = await run(
      tools.ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_entries', 'format_tags:stream_tags', absolutePath],
      { timeoutMs: 20000, maxBytes: 2_000_000 },
    )
    const parsed = JSON.parse(stdout.toString()) as {
      format?: { tags?: Record<string, string> }
      streams?: { tags?: Record<string, string> }[]
    }
    const tagSets = [parsed.format?.tags, ...(parsed.streams ?? []).map((stream) => stream.tags)]
    for (const tags of tagSets) {
      for (const [key, value] of Object.entries(tags ?? {}))
        if (/^(?:lyrics|unsyncedlyrics|syncedlyrics|uslt)/i.test(key) && typeof value === 'string' && value.trim().length > 8)
          return value
    }
    return null
  } catch {
    return null
  }
}

export async function extractAudioCover(tools: MediaTools, absolutePath: string, output: string): Promise<void> {
  await run(
    tools.ffmpeg,
    [
      '-v',
      'error',
      '-nostdin',
      '-y',
      '-i',
      absolutePath,
      '-an',
      '-sn',
      '-frames:v',
      '1',
      '-vf',
      'scale=480:-2',
      '-q:v',
      '4',
      output,
    ],
    { timeoutMs: 30000, maxBytes: 65536 },
  )
}

/** Counts running work and queues the rest, so a rescan cannot start hundreds of ffmpeg processes at once. */
export class Limiter {
  private active = 0
  private readonly waiting: (() => void)[] = []
  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.active += 1
    try {
      return await task()
    } finally {
      this.active -= 1
      this.waiting.shift()?.()
    }
  }

  get running(): number {
    return this.active
  }
  get queued(): number {
    return this.waiting.length
  }
}
