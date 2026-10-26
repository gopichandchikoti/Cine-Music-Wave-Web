import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream'
import type { Request, Response } from 'express'

/**
 * Serves a file with HTTP Range support so the browser can seek. pipeline() closes the file when the client goes away,
 * which browsers do constantly (seeking, switching films); a bare .pipe() leaves the handle open and locks the file on Windows.
 */
export function sendFileWithRange(
  request: Request,
  response: Response,
  absolutePath: string,
  size: number,
  contentType: string,
): void {
  response.setHeader('Accept-Ranges', 'bytes')
  response.setHeader('Content-Type', contentType)
  const range = request.headers.range

  if (!range) {
    response.setHeader('Content-Length', size)
    pipeline(createReadStream(absolutePath), response, () => undefined)
    return
  }

  const match = range.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (match[1] === '' && match[2] === '')) {
    response.status(416).setHeader('Content-Range', `bytes */${size}`).end()
    return
  }
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2] || 0), 0)
  const requestedEnd = match[1] && match[2] ? Number(match[2]) : size - 1
  const end = Math.min(requestedEnd, size - 1)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) {
    response.status(416).setHeader('Content-Range', `bytes */${size}`).end()
    return
  }

  response.status(206)
  response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
  response.setHeader('Content-Length', end - start + 1)
  pipeline(createReadStream(absolutePath, { start, end }), response, () => undefined)
}
