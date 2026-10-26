import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream'
import type { Request, Response } from 'express'
import { spawnFfmpeg } from './ffmpeg.js'
import type { WatchLibrary } from './library.js'
import { buildStreamArgs, parseCapabilities, parseProfile, streamContentType } from './playback.js'
import { sendFileWithRange } from './range.js'
import type { CatalogFile, ClientCapabilities, PlaybackProfile } from './types.js'

// How one file is played for one browser: the original with byte ranges, or a repackaged or converted stream from ffmpeg.
// Watch (films) and Music (songs) both use this, each behind its own routes.

export class WatchError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const FIRST_BYTE_TIMEOUT_MS = 45_000

export const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
}

export const numberParam = (value: unknown, min: number, max: number, fallback: number): number => {
  if (typeof value !== 'string' || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export type StreamQuery = {
  caps: ClientCapabilities
  audioOrdinal: number | null
  profile: PlaybackProfile
  start: number
  audioDelayMs: number
}

export const queryOf = (request: Request): StreamQuery => ({
  caps: parseCapabilities({ c: request.query.c, v: request.query.v, a: request.query.a }),
  audioOrdinal: request.query.audio === undefined ? null : Math.floor(numberParam(request.query.audio, 0, 63, 0)),
  profile: parseProfile(request.query.profile),
  start: numberParam(request.query.start, 0, 7 * 24 * 3600, 0),
  audioDelayMs: Math.round(numberParam(request.query.delay, -5000, 5000, 0)),
})

/** The parts of the request that choose how a file is played, passed on to the stream URL so plan and stream agree. */
export const carriedQuery = (request: Request, extra: Record<string, string>): string => {
  const params = new URLSearchParams()
  for (const key of ['c', 'v', 'a', 'audio', 'profile', 'delay'])
    if (typeof request.query[key] === 'string') params.set(key, String(request.query[key]))
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  return params.toString()
}

/** Answers "how will this file play in your browser?", with the URL to stream it from. */
export async function planResponse(
  library: WatchLibrary,
  file: CatalogFile,
  request: Request,
  response: Response,
  streamBase: string,
): Promise<void> {
  const query = queryOf(request)
  const resolved = await library.resolvePlayback(file, query.caps, {
    audioOrdinal: query.audioOrdinal,
    profile: query.profile,
    start: query.start,
    snap: true,
    audioDelayMs: query.audioDelayMs,
  })
  if (!resolved)
    throw new WatchError(
      422,
      'WATCH_UNPLAYABLE',
      file.unreadable
        ? 'This file is incomplete or damaged and cannot be played.'
        : 'This file is not ready yet. Try again in a moment.',
    )
  response.json({
    mode: resolved.plan.mode,
    reason: resolved.plan.reason,
    container: resolved.plan.container,
    videoCodec: resolved.plan.videoCodec,
    audioCodec: resolved.plan.audioCodec,
    start: resolved.start,
    duration: resolved.probe.duration,
    url: `${streamBase}/${file.id}?${carriedQuery(request, { start: resolved.start.toFixed(3) })}`,
  })
}

/** Sends the file: untouched with Range support when the browser can play it, otherwise through ffmpeg as a fragmented stream. */
export async function streamFile(library: WatchLibrary, file: CatalogFile, request: Request, response: Response): Promise<void> {
  const query = queryOf(request)
  const resolved = await library.resolvePlayback(file, query.caps, {
    audioOrdinal: query.audioOrdinal,
    profile: query.profile,
    start: query.start,
    snap: false,
    audioDelayMs: query.audioDelayMs,
  })
  const absolute = library.absolutePath(file)
  if (!resolved || !absolute) throw new WatchError(422, 'WATCH_UNPLAYABLE', 'This file cannot be played.')

  if (resolved.plan.mode === 'direct') {
    const stats = await fs.stat(absolute).catch(() => null)
    if (!stats?.isFile()) throw new WatchError(404, 'WATCH_NOT_FOUND', 'That file could not be found.')
    sendFileWithRange(
      request,
      response,
      absolute,
      stats.size,
      MIME_BY_EXTENSION[path.extname(absolute).toLowerCase()] ?? 'application/octet-stream',
    )
    return
  }

  const tools = library.tools
  if (!tools) throw new WatchError(503, 'WATCH_CONVERTER_MISSING', 'Converting this file needs ffmpeg, which is not installed.')
  const release = library.acquireStream()
  if (!release) throw new WatchError(503, 'WATCH_BUSY', 'Too many files are being prepared right now. Try again in a moment.')

  const args = buildStreamArgs({
    path: absolute,
    probe: resolved.probe,
    plan: resolved.plan,
    audioOrdinal: query.audioOrdinal,
    start: resolved.start,
    maxHeight: 1080,
    encoder: library.options.encoder === 'amf' && tools.amf ? 'amf' : 'x264',
    audioDelayMs: query.audioDelayMs,
  })
  const child = spawnFfmpeg(tools, args)
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length < 2000) stderr += chunk.toString()
  })
  const stop = (): void => {
    release()
    if (child.exitCode === null) child.kill()
  }
  response.on('close', stop)
  child.on('error', stop)

  const first = await new Promise<Buffer | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, FIRST_BYTE_TIMEOUT_MS)
    child.stdout.once('data', (chunk: Buffer) => {
      clearTimeout(timer)
      child.stdout.pause()
      resolve(chunk)
    })
    child.once('close', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
  if (!first) {
    stop()
    if (!response.headersSent)
      throw new WatchError(502, 'WATCH_CONVERT_FAILED', 'This file could not be prepared for your browser.')
    return
  }
  response.setHeader('Content-Type', streamContentType(resolved.plan, resolved.probe))
  response.setHeader('Accept-Ranges', 'none')
  response.setHeader('X-Watch-Mode', resolved.plan.mode)
  response.write(first)
  pipeline(child.stdout, response, () => stop())
}
