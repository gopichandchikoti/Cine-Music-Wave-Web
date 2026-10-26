import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Request, RequestHandler, Response } from 'express'

const ONE_YEAR_SECONDS = 31_536_000
/** Files named by content hash (`assets/app.1a2b3c4d.js`) never change, so browsers may keep them for a year. */
const HASHED_ASSET = /^\/assets\/.+\.[0-9a-f]{8}(?:\.chunk)?\.\w+$/
const ENCODINGS = [
  { name: 'br', extension: '.br' },
  { name: 'gzip', extension: '.gz' },
] as const

const isFile = (candidate: string): Promise<boolean> =>
  fs.stat(candidate).then(
    (stats) => stats.isFile(),
    () => false,
  )

const resolveUnder = (directory: string, requestPath: string): string | null => {
  let decoded: string
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const normalized = path.posix.normalize(`/${decoded.replace(/\\/g, '/')}`)
  // Hidden files and folders (.env, .git) are never part of the built client, so they simply do not exist here.
  if (normalized.split('/').some((segment) => segment.startsWith('.'))) return null
  const target = path.resolve(directory, `.${normalized}`)
  return target.startsWith(directory + path.sep) ? target : null
}

const acceptedEncodings = (request: Request): Set<string> =>
  new Set((request.get('accept-encoding') ?? '').split(',').map((part) => part.split(';')[0].trim().toLowerCase()))

const sendFile = (response: Response, root: string, file: string, immutable: boolean): Promise<void> =>
  new Promise((resolve, reject) => {
    // Sending relative to `root` keeps the dotfile check on the request, not on whatever folder the app is installed in.
    const options = { root, dotfiles: 'deny' as const, cacheControl: false }
    response.setHeader('Cache-Control', immutable ? `public, max-age=${ONE_YEAR_SECONDS}, immutable` : 'no-cache')
    response.sendFile(path.relative(root, file), options, (error) => (error ? reject(error) : resolve()))
  })

/**
 * Serves the built client: hashed assets are cached forever, `index.html` is always revalidated, and a `.br` or `.gz`
 * twin written at build time is sent when the browser accepts it. Unknown page routes fall back to the app shell.
 */
export function staticAssets(directory: string): RequestHandler {
  const root = path.resolve(directory)
  return async (request, response, next) => {
    if ((request.method !== 'GET' && request.method !== 'HEAD') || request.path.startsWith('/api/')) {
      next()
      return
    }
    try {
      if (request.path.endsWith('.map')) {
        next()
        return
      }
      const requested = resolveUnder(root, request.path)
      const asFile = requested && (await isFile(requested)) ? requested : null
      const hasExtension = path.extname(request.path) !== ''
      if (!asFile && hasExtension) {
        next()
        return
      }
      const file = asFile ?? path.join(root, 'index.html')
      const immutable = Boolean(asFile) && HASHED_ASSET.test(request.path)
      const accepted = acceptedEncodings(request)
      response.setHeader('Vary', 'Accept-Encoding')
      for (const encoding of ENCODINGS) {
        if (!accepted.has(encoding.name) || !(await isFile(file + encoding.extension))) continue
        response.setHeader('Content-Encoding', encoding.name)
        response.type(path.extname(file))
        await sendFile(response, root, file + encoding.extension, immutable)
        return
      }
      await sendFile(response, root, file, immutable)
    } catch (error) {
      next(error)
    }
  }
}
