import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { audioFilter, buildStreamArgs, parseCapabilities, planPlayback } from '../../server/watch/playback.js'
import { buildPreviewArgs } from '../../server/watch/ffmpeg.js'
import type { ProbeSummary } from '../../server/watch/types.js'

const absolute = path.resolve('film.mkv')

const probe = (
  overrides: Partial<ProbeSummary> & { audioCodecs?: string[]; videoCodec?: string; bitDepth?: number; hdr?: boolean } = {},
): ProbeSummary => ({
  duration: 7200,
  container: 'matroska,webm',
  video:
    overrides.video === null
      ? null
      : {
          index: 0,
          codec: overrides.videoCodec ?? 'h264',
          profile: 'High',
          width: 1920,
          height: 1080,
          pixFmt: 'yuv420p',
          bitDepth: overrides.bitDepth ?? 8,
          fps: 24,
          hdr: overrides.hdr ?? false,
        },
  audio: (overrides.audioCodecs ?? ['aac']).map((codec, ordinal) => ({
    ordinal,
    index: ordinal + 1,
    codec,
    channels: 2,
    language: 'eng',
    label: `Track ${ordinal + 1}`,
    default: ordinal === 0,
  })),
  subtitles: [],
})

const caps = (c: string, v: string, a: string) => parseCapabilities({ c, v, a })

test('a browser that plays everything in the file gets the original', () => {
  const plan = planPlayback(probe(), '.mkv', caps('mp4.mkv', 'h264', 'aac'), { audioOrdinal: null, profile: 'auto' })
  assert.equal(plan.mode, 'direct')
})

test('MKV in a browser without MKV support is repackaged, keeping the video untouched', () => {
  const plan = planPlayback(probe(), '.mkv', caps('mp4', 'h264', 'aac'), { audioOrdinal: null, profile: 'auto' })
  assert.deepEqual([plan.mode, plan.videoCodec, plan.audioCodec, plan.container], ['remux', 'copy', 'copy', 'mp4'])
})

test('audio the browser cannot decode is converted to AAC while the video is still copied', () => {
  const plan = planPlayback(probe({ audioCodecs: ['eac3'] }), '.mkv', caps('mp4.mkv', 'h264', 'aac'), {
    audioOrdinal: null,
    profile: 'auto',
  })
  assert.deepEqual([plan.mode, plan.videoCodec, plan.audioCodec], ['remux', 'copy', 'aac'])
})

test('video the browser cannot decode is converted, to VP9 when that is all it supports', () => {
  const hevc = planPlayback(probe({ videoCodec: 'hevc' }), '.mkv', caps('mp4', 'h264', 'aac'), {
    audioOrdinal: null,
    profile: 'auto',
  })
  assert.deepEqual([hevc.mode, hevc.videoCodec, hevc.container], ['transcode', 'h264', 'mp4'])
  const webmOnly = planPlayback(probe({ videoCodec: 'hevc' }), '.mkv', caps('webm', 'vp9', 'opus'), {
    audioOrdinal: null,
    profile: 'auto',
  })
  assert.deepEqual(
    [webmOnly.mode, webmOnly.videoCodec, webmOnly.audioCodec, webmOnly.container],
    ['transcode', 'vp9', 'opus', 'webm'],
  )
})

test('10-bit H.264 and HDR are converted even when the codec name is supported', () => {
  assert.equal(
    planPlayback(probe({ bitDepth: 10 }), '.mkv', caps('mp4.mkv', 'h264', 'aac'), { audioOrdinal: null, profile: 'auto' }).mode,
    'transcode',
  )
  assert.equal(
    planPlayback(probe({ videoCodec: 'hevc', bitDepth: 10, hdr: true }), '.mkv', caps('mp4.mkv', 'h264.hevc.hevc10', 'aac'), {
      audioOrdinal: null,
      profile: 'auto',
    }).mode,
    'transcode',
  )
})

test('picking a non-default audio language needs the server, because browsers always play the first track', () => {
  const two = probe({ audioCodecs: ['aac', 'aac'] })
  assert.equal(planPlayback(two, '.mkv', caps('mp4.mkv', 'h264', 'aac'), { audioOrdinal: 1, profile: 'auto' }).mode, 'remux')
  const args = buildStreamArgs({
    path: absolute,
    probe: two,
    plan: planPlayback(two, '.mkv', caps('mp4.mkv', 'h264', 'aac'), { audioOrdinal: 1, profile: 'auto' }),
    audioOrdinal: 1,
    start: 0,
    maxHeight: 1080,
    encoder: 'x264',
  })
  assert.ok(args.join(' ').includes('-map 0:2'), 'the second audio stream is mapped')
  assert.ok(!args.join(' ').includes('-map 0:1'), 'the first audio stream is not')
})

test('plain audio files play directly, and an audio offset converts them', () => {
  const song = probe({ video: null, audioCodecs: ['mp3'] })
  const supported = caps('mp4', 'h264', 'aac.mp3')
  assert.equal(planPlayback(song, '.mp3', supported, { audioOrdinal: null, profile: 'auto' }).mode, 'direct')
  assert.equal(
    planPlayback(song, '.mp3', supported, { audioOrdinal: null, profile: 'auto', audioDelayMs: 200 }).mode,
    'transcode',
  )
})

test('an audio offset keeps the video copied but re-times the audio', () => {
  const plan = planPlayback(probe(), '.mkv', caps('mp4.mkv', 'h264', 'aac'), {
    audioOrdinal: null,
    profile: 'auto',
    audioDelayMs: 150,
  })
  assert.deepEqual([plan.mode, plan.videoCodec, plan.audioCodec], ['remux', 'copy', 'aac'])
  const args = buildStreamArgs({
    path: absolute,
    probe: probe(),
    plan,
    audioOrdinal: null,
    start: 0,
    maxHeight: 1080,
    encoder: 'x264',
    audioDelayMs: 150,
  })
  assert.ok(args.includes('asetpts=PTS+0.150/TB,aresample=async=1:first_pts=0'))
})

test("the audio filter moves timestamps instead of cutting, so a file's own audio offset survives", () => {
  assert.equal(audioFilter(0), 'aresample=async=1:first_pts=0')
  assert.equal(audioFilter(300), 'asetpts=PTS+0.300/TB,aresample=async=1:first_pts=0')
  assert.equal(audioFilter(-250), 'asetpts=PTS-0.250/TB,aresample=async=1:first_pts=0')
})

test('Dolby audio copied into MP4 delays the header, because ffmpeg must parse it first', () => {
  const dolby = probe({ audioCodecs: ['eac3'] })
  const plan = planPlayback(dolby, '.mkv', caps('mp4.mkv', 'h264', 'aac.eac3'), { audioOrdinal: null, profile: 'remux' })
  assert.equal(plan.audioCodec, 'copy')
  const args = buildStreamArgs({
    path: absolute,
    probe: dolby,
    plan,
    audioOrdinal: null,
    start: 0,
    maxHeight: 1080,
    encoder: 'x264',
  })
  assert.ok(args.some((arg) => arg.includes('+delay_moov')))
  const plain = buildStreamArgs({
    path: absolute,
    probe: probe(),
    plan: planPlayback(probe(), '.mkv', caps('mp4', 'h264', 'aac'), { audioOrdinal: null, profile: 'auto' }),
    audioOrdinal: null,
    start: 0,
    maxHeight: 1080,
    encoder: 'x264',
  })
  assert.ok(!plain.some((arg) => arg.includes('delay_moov')))
})

test('a stream can only be built for an absolute path, and seeking is applied before the input', () => {
  const plan = planPlayback(probe(), '.mkv', caps('mp4', 'h264', 'aac'), { audioOrdinal: null, profile: 'auto' })
  assert.throws(() =>
    buildStreamArgs({
      path: 'relative.mkv',
      probe: probe(),
      plan,
      audioOrdinal: null,
      start: 0,
      maxHeight: 1080,
      encoder: 'x264',
    }),
  )
  const args = buildStreamArgs({
    path: absolute,
    probe: probe(),
    plan,
    audioOrdinal: null,
    start: 61.5,
    maxHeight: 1080,
    encoder: 'x264',
  })
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'))
  assert.equal(args[args.indexOf('-ss') + 1], '61.500')
})

test('the capability query only accepts known tokens and bounded length', () => {
  const parsed = parseCapabilities({ c: 'mp4.evil.mkv', v: 'h264.<script>', a: 'x'.repeat(200) })
  assert.deepEqual([...parsed.containers], ['mp4', 'mkv'])
  assert.deepEqual([...parsed.video], ['h264'])
  assert.deepEqual([...parsed.audio], [])
})

test('hover previews are silent, small, H.264 and tone-mapped when the film is HDR', () => {
  const plain = buildPreviewArgs(absolute, 0, { seconds: 120, length: 18, hdr: false, crop: 'crop=1920:800:0:140' }, 'out.mp4')
  const filter = plain[plain.indexOf('-vf') + 1]
  assert.ok(plain.includes('-an'))
  assert.ok(plain.includes('libx264'))
  assert.ok(filter.startsWith('crop=1920:800:0:140,scale=-2:min(432\\,ih)'))
  assert.ok(filter.endsWith('format=yuv420p'))
  assert.ok(!filter.includes('tonemap'))
  const hdr = buildPreviewArgs(absolute, 0, { seconds: 120, length: 18, hdr: true, crop: null }, 'out.mp4')
  assert.ok(hdr[hdr.indexOf('-vf') + 1].includes('tonemap'))
})
