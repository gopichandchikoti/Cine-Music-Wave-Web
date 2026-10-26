import path from 'node:path'
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { createRateLimiter } from '../middlewares/rate-limit.js'
import { CATALOG_PROBLEM_MESSAGE, CatalogError } from './catalog.js'
import type { WatchLibrary } from './library.js'
import type { WatchStore } from './progress.js'
import { sendFileWithRange } from './range.js'
import { planResponse, streamFile, WatchError } from './streaming.js'
import type { CatalogFile, CatalogTitle, ProbeSummary } from './types.js'

const TITLE_ID = /^t_[0-9a-f]{12}$/
const FILE_ID = /^f_[0-9a-f]{12}$/
const RESCANS_PER_MINUTE = 6

const resolutionLabel = (probe: ProbeSummary | null): '4K' | 'HD' | 'SD' | null => {
  const height = probe?.video?.height
  if (!height) return null
  return height >= 2000 ? '4K' : height >= 700 ? 'HD' : 'SD'
}

const handler =
  (action: (request: Request, response: Response) => Promise<void> | void): RequestHandler =>
  (request, response, next) => {
    Promise.resolve()
      .then(() => action(request, response))
      .catch(next)
  }

export type WatchRouterOptions = {
  library: WatchLibrary
  /** Null when accounts are off (shared-password mode): browsing works, saving progress does not. */
  store: WatchStore | null
}

// Mount after the account guard: sign-in, CSRF and the verified-email rule are enforced there,
// and the account id comes only from `response.locals.authUserId`.
export function createWatchRouter({ library, store }: WatchRouterOptions): Router {
  const router = Router()

  const owner = (response: Response): string => {
    const id: unknown = response.locals.authUserId
    if (typeof id !== 'string') throw new WatchError(401, 'AUTH_REQUIRED', 'Sign in to save your place.')
    return id
  }
  const requireStore = (): WatchStore => {
    if (!store) throw new WatchError(501, 'WATCH_SAVING_UNAVAILABLE', 'Saving progress needs personal accounts.')
    return store
  }
  const titleFor = (request: Request): CatalogTitle => {
    const id = String(request.params.titleId)
    const title = TITLE_ID.test(id) ? library.store.findTitle(id) : undefined
    if (!title) throw new WatchError(404, 'WATCH_NOT_FOUND', 'That title could not be found.')
    return title
  }
  const fileFor = (request: Request): { title: CatalogTitle; file: CatalogFile } => {
    const id = String(request.params.fileId)
    const found = FILE_ID.test(id) ? library.store.findFile(id) : undefined
    if (!found || found.file.missing) throw new WatchError(404, 'WATCH_NOT_FOUND', 'That video could not be found.')
    return found
  }

  const serialiseFile = async (file: CatalogFile) => {
    const probe = file.probe
    const thumb = await library.thumbFile(file)
    return {
      id: file.id,
      season: file.season,
      episode: file.episode,
      title: file.episodeTitle,
      duration: probe?.duration ?? null,
      quality: resolutionLabel(probe),
      height: probe?.video?.height ?? null,
      hdr: probe?.video?.hdr ?? false,
      audio:
        probe?.audio.map((track) => ({
          ordinal: track.ordinal,
          label: track.label,
          language: track.language,
          default: track.default,
        })) ?? [],
      subtitles: [
        ...(probe?.subtitles
          .filter((track) => track.text)
          .map((track) => ({ ordinal: track.ordinal, label: track.label, language: track.language, default: track.default })) ??
          []),
        ...file.sidecarSubtitles.map((track, index) => ({
          ordinal: (probe?.subtitles.length ?? 0) + index,
          label: track.label,
          language: track.language,
          default: false,
        })),
      ],
      probed: probe !== null,
      thumb: thumb?.version ?? null,
    }
  }

  const audioLanguages = (title: CatalogTitle): string[] => {
    const names = new Set(title.languages)
    const file = library.representativeFile(title)
    for (const track of file?.probe?.audio ?? []) {
      const match = /^(.*?) ·/.exec(track.label)?.[1]
      if (match && !match.startsWith('Track')) names.add(match)
    }
    return [...names]
  }

  const serialiseTitle = async (title: CatalogTitle) => {
    const files = library.playableFiles(title)
    const art = await library.hasArtwork(title)
    return {
      id: title.id,
      kind: title.kind,
      title: title.title,
      year: title.year,
      overview: title.overview,
      genres: title.genres,
      languages: audioLanguages(title),
      rating: title.rating,
      addedAt: title.addedAt,
      art,
      files: await Promise.all(files.map(serialiseFile)),
    }
  }

  router.get(
    '/catalog',
    handler(async (_request, response) => {
      await library.refresh()
      const visible = library.store.catalog.titles.filter((title) => library.playableFiles(title).length > 0)
      const userId = typeof response.locals.authUserId === 'string' ? response.locals.authUserId : null
      response.json({
        generatedAt: library.store.catalog.updatedAt,
        media: library.tools ? { available: true, version: library.tools.version } : { available: false, version: null },
        status: library.status(),
        titles: await Promise.all(visible.map(serialiseTitle)),
        progress: store && userId ? store.progress(userId) : [],
        list: store && userId ? store.list(userId) : [],
      })
    }),
  )

  // A rescan walks the whole media folder, so it has its own small budget on top of the general write limit.
  router.post(
    '/rescan',
    createRateLimiter({ windowMs: 60_000, limit: RESCANS_PER_MINUTE }),
    handler(async (_request, response) => {
      const summary = await library.rescan()
      response.json({
        added: summary.added,
        removed: summary.removed,
        titles: summary.titles,
        skipped: summary.skipped.slice(0, 50),
      })
    }),
  )

  router.get(
    '/artwork/:titleId/:kind',
    handler(async (request, response) => {
      const title = titleFor(request)
      const kind = request.params.kind === 'backdrop' ? 'backdrop' : request.params.kind === 'card' ? 'card' : null
      if (!kind) throw new WatchError(404, 'WATCH_NOT_FOUND', 'That image could not be found.')
      const art = await library.artworkFile(title, kind)
      if (!art) {
        void library.ensureArtwork(title)
        throw new WatchError(404, 'WATCH_ARTWORK_PENDING', 'This image is still being prepared.')
      }
      response.setHeader('Cache-Control', 'private, max-age=604800, immutable')
      response.type(path.extname(art.file)).sendFile(art.file)
    }),
  )

  // A short silent clip from the title, shown when the pointer rests on a card. Made once, then served from disk with Range support.
  router.get(
    '/preview/:titleId',
    handler(async (request, response) => {
      const title = titleFor(request)
      if (title.kind === 'album') throw new WatchError(404, 'WATCH_PREVIEW_UNAVAILABLE', 'Music has no video preview.')
      const preview = await library.ensurePreview(title)
      if (!preview) throw new WatchError(404, 'WATCH_PREVIEW_UNAVAILABLE', 'A preview could not be made for this title.')
      response.setHeader('Cache-Control', 'private, max-age=86400')
      sendFileWithRange(request, response, preview.file, preview.size, 'video/mp4')
    }),
  )

  router.get(
    '/thumb/:fileId',
    handler(async (request, response) => {
      const { file } = fileFor(request)
      const thumb = await library.thumbFile(file)
      if (!thumb) {
        void library.ensureThumb(file)
        throw new WatchError(404, 'WATCH_ARTWORK_PENDING', 'This image is still being prepared.')
      }
      response.setHeader('Cache-Control', 'private, max-age=604800, immutable')
      response.type('.jpg').sendFile(thumb.file)
    }),
  )

  router.get(
    '/plan/:fileId',
    handler((request, response) => planResponse(library, fileFor(request).file, request, response, '/api/watch/stream')),
  )

  // Where the picture sits inside any baked-in black bars, so the player can fit the picture (not the bars) to the screen.
  router.get(
    '/frame/:fileId',
    handler(async (request, response) => {
      const { file } = fileFor(request)
      response.setHeader('Cache-Control', 'private, max-age=3600')
      response.json({ rect: await library.contentRect(file) })
    }),
  )

  router.get(
    '/stream/:fileId',
    handler((request, response) => streamFile(library, fileFor(request).file, request, response)),
  )

  router.get(
    '/subtitle/:fileId/:ordinal',
    handler(async (request, response) => {
      const { file } = fileFor(request)
      const ordinal = Number(request.params.ordinal)
      if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal > 63)
        throw new WatchError(404, 'WATCH_NOT_FOUND', 'That subtitle track could not be found.')
      const text = await library.subtitleText(file, ordinal)
      if (text === null) throw new WatchError(404, 'WATCH_NOT_FOUND', 'That subtitle track could not be found.')
      response.setHeader('Cache-Control', 'private, max-age=3600')
      response.type('text/vtt').send(text)
    }),
  )

  router.put(
    '/progress/:fileId',
    handler((request, response) => {
      const userId = owner(response)
      const progress = requireStore()
      const { title, file } = fileFor(request)
      const body: unknown = request.body
      if (!request.is('application/json') || !body || typeof body !== 'object')
        throw new WatchError(400, 'WATCH_INVALID', 'Send the position as JSON.')
      const { position, duration } = body as { position?: unknown; duration?: unknown }
      if (
        typeof position !== 'number' ||
        typeof duration !== 'number' ||
        !progress.saveProgress(userId, file.id, title.id, position, duration)
      ) {
        throw new WatchError(400, 'WATCH_INVALID', 'That playback position is not valid.')
      }
      response.json({ ok: true })
    }),
  )

  router.delete(
    '/progress/title/:titleId',
    handler((request, response) => {
      const userId = owner(response)
      requireStore().clearProgress(userId, titleFor(request).id)
      response.json({ ok: true })
    }),
  )

  router.put(
    '/list/:titleId',
    handler((request, response) => {
      const userId = owner(response)
      if (!requireStore().addToList(userId, titleFor(request).id))
        throw new WatchError(409, 'WATCH_LIST_FULL', 'Your list is full. Remove a title first.')
      response.json({ ok: true })
    }),
  )

  router.delete(
    '/list/:titleId',
    handler((request, response) => {
      const userId = owner(response)
      const id = String(request.params.titleId)
      if (!TITLE_ID.test(id)) throw new WatchError(404, 'WATCH_NOT_FOUND', 'That title could not be found.')
      requireStore().removeFromList(userId, id)
      response.json({ ok: true })
    }),
  )

  router.get(
    '/diagnostics',
    handler((_request, response) => {
      const files = library.store.catalog.titles.flatMap((title) => title.files.map((file) => ({ title: title.title, file })))
      response.json({
        media: library.tools
          ? { available: true, version: library.tools.version, hardwareEncoder: library.tools.amf }
          : { available: false },
        status: library.status(),
        titles: library.store.catalog.titles.length,
        files: files.length,
        unreadable: files
          .filter(({ file }) => file.unreadable && !file.missing)
          .slice(0, 50)
          .map(({ title, file }) => ({ title, name: path.posix.basename(file.path), reason: file.unreadable })),
        skipped: library.skipped.slice(0, 50),
      })
    }),
  )

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof WatchError) {
      response.status(error.status).json({ code: error.code, message: error.message })
      return
    }
    if (error instanceof CatalogError) {
      // The detail names files on this machine, so it goes to the server log and not to the browser.
      process.stderr.write(`Watch catalog problem: ${error.message}\n`)
      response.status(500).json({ code: 'WATCH_CATALOG_INVALID', message: CATALOG_PROBLEM_MESSAGE })
      return
    }
    process.stderr.write(`Watch route failed: ${error instanceof Error ? error.message : String(error)}\n`)
    if (!response.headersSent)
      response.status(500).json({ code: 'WATCH_FAILED', message: 'Watch could not complete that request. Try again.' })
  })

  return router
}
