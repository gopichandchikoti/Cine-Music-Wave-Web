import path from 'node:path'
import express, { type Express, type Request, type Response } from 'express'
import { createAuthSystem } from './auth/routes.js'
import { IGNORED_DIRECTORIES, type ServerConfig } from './config/index.js'
import { responseCompression } from './middlewares/compression.js'
import { createRateLimiter, skipSafeMethods } from './middlewares/rate-limit.js'
import { errorHandler, requestId } from './middlewares/request-context.js'
import { requireHttps, securityHeaders } from './middlewares/security-headers.js'
import { staticAssets } from './middlewares/static-assets.js'
import { configureTrustProxy } from './middlewares/trust-proxy.js'
import { MusicLibrary } from './music/library.js'
import { createMusicRouter } from './music/routes.js'
import { MusicStore } from './music/store.js'
import { findMediaTools } from './watch/ffmpeg.js'
import { WatchLibrary } from './watch/library.js'
import { WatchStore } from './watch/progress.js'
import { createWatchRouter } from './watch/routes.js'

const MINUTE_MS = 60_000
/** A flood guard, not a quota: a page of artwork plus several range requests stays far below it. */
const API_REQUESTS_PER_MINUTE = 2000
/** Saving a playback position, a like or a playlist: far above what one person does by hand, far below a script. */
const WRITES_PER_MINUTE = 240

export type RunningApp = { app: Express; close: () => void }

/** Builds the Express application: hardening first, then sign-in, then the media API, then the built client. */
export async function createApp(config: ServerConfig): Promise<RunningApp> {
  const app = express()
  app.disable('x-powered-by')
  app.use(requestId)
  app.use(securityHeaders(config))
  configureTrustProxy(app, config.trustProxy)
  app.use(requireHttps(config))
  app.use(responseCompression)
  app.use(
    '/api',
    createRateLimiter({ windowMs: MINUTE_MS, limit: API_REQUESTS_PER_MINUTE, skip: (request) => request.path === '/health' }),
  )
  app.use(express.json({ limit: '1mb' }))

  const accounts = createAuthSystem(config.accounts, config.personalDatabasePath)
  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, storage: 'filesystem', authRequired: true, application: 'cine-music-wave' })
  })
  app.use('/api/auth', accounts.publicRouter)
  app.use('/api', accounts.guard, accounts.protectedRouter)

  const { media } = config
  if (media.refusal) {
    const refuse = (_request: Request, response: Response): void => {
      response.status(403).json({ code: 'WATCH_DRIVE_NOT_ALLOWED', message: media.refusal })
    }
    app.use('/api/watch', refuse)
    app.use('/api/music', refuse)
  } else {
    const library = new WatchLibrary({
      mediaRoot: media.root,
      allowedDrive: media.allowedDrive,
      catalogDirectory: config.watch.catalogDirectory,
      ignored: new Set([path.basename(config.appDirectory), ...IGNORED_DIRECTORIES]),
      tools: await findMediaTools(config.appDirectory),
      maxStreams: config.watch.maxStreams,
      pregeneratePreviews: config.watch.pregeneratePreviews,
      encoder: config.watch.encoder,
    })
    await library.load()
    library.rescan().catch(() => process.stderr.write('Media scan failed; use Refresh library to retry.\n'))
    // Progress saves arrive every few seconds while playing, so the budget is generous; it only stops a runaway script.
    const writes = createRateLimiter({ windowMs: MINUTE_MS, limit: WRITES_PER_MINUTE, skip: skipSafeMethods })
    app.use('/api/watch', writes, createWatchRouter({ library, store: new WatchStore(accounts.repository) }))
    app.use(
      '/api/music',
      writes,
      createMusicRouter({ library: new MusicLibrary(library), store: new MusicStore(accounts.repository) }),
    )
  }
  app.use('/api', (_request, response) => {
    response.status(404).json({ code: 'NOT_FOUND', message: 'That API route is unavailable.' })
  })

  app.use(staticAssets(config.staticDirectory))
  app.use(errorHandler)
  return { app, close: () => accounts.close() }
}
