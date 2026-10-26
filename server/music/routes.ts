import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { CATALOG_PROBLEM_MESSAGE, CatalogError } from '../watch/catalog.js'
import { planResponse, streamFile, WatchError } from '../watch/streaming.js'
import type { CatalogFile } from '../watch/types.js'
import type { MusicLibrary } from './library.js'
import { isTrackId, MAX_PLAYLIST_TRACKS, type MusicStore } from './store.js'

const ALBUM_ID = /^a_[0-9a-f]{12}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const handler =
  (action: (request: Request, response: Response) => Promise<void> | void): RequestHandler =>
  (request, response, next) => {
    Promise.resolve()
      .then(() => action(request, response))
      .catch(next)
  }

export type MusicRouterOptions = {
  library: MusicLibrary
  /** Null when accounts are off (shared-password mode): browsing and playing work, saving does not. */
  store: MusicStore | null
}

const trackIdsFrom = (value: unknown): string[] => {
  if (!Array.isArray(value)) throw new WatchError(400, 'MUSIC_INVALID', 'Send a list of songs.')
  if (value.length > MAX_PLAYLIST_TRACKS) throw new WatchError(400, 'MUSIC_INVALID', 'That is too many songs for one playlist.')
  const ids = value.filter(isTrackId)
  if (ids.length !== value.length) throw new WatchError(400, 'MUSIC_INVALID', 'One of those songs is not valid.')
  return ids
}

const bodyOf = (request: Request): Record<string, unknown> => {
  const body: unknown = request.body
  if (!request.is('application/json') || !body || typeof body !== 'object' || Array.isArray(body))
    throw new WatchError(400, 'MUSIC_INVALID', 'Send the details as JSON.')
  return body as Record<string, unknown>
}

// Mount after the account guard: sign-in, CSRF and the verified-email rule are enforced there, and the account id comes only from
// `response.locals.authUserId`. Music has its own routes and never serves documents, films or Learning submissions.
export function createMusicRouter({ library, store }: MusicRouterOptions): Router {
  const router = Router()

  const owner = (response: Response): string => {
    const id: unknown = response.locals.authUserId
    if (typeof id !== 'string') throw new WatchError(401, 'AUTH_REQUIRED', 'Sign in to save your music.')
    return id
  }
  const requireStore = (): MusicStore => {
    if (!store) throw new WatchError(501, 'MUSIC_SAVING_UNAVAILABLE', 'Saving music needs personal accounts.')
    return store
  }
  const trackFor = (request: Request): CatalogFile => {
    const file = library.find(String(request.params.trackId))
    if (!file) throw new WatchError(404, 'MUSIC_NOT_FOUND', 'That song could not be found.')
    return file
  }
  const playlistId = (request: Request): string => {
    const id = String(request.params.playlistId)
    if (!UUID.test(id)) throw new WatchError(404, 'MUSIC_NOT_FOUND', 'That playlist could not be found.')
    return id
  }

  router.get(
    '/library',
    handler(async (_request, response) => {
      await library.watch.refresh()
      library.kick()
      const userId = typeof response.locals.authUserId === 'string' ? response.locals.authUserId : null
      const films = library.watch.store.catalog.titles
        .filter((title) => title.kind !== 'album' && library.watch.playableFiles(title).length > 0)
        .map((title) => ({ title: title.title, year: title.year }))
      response.json({
        generatedAt: new Date().toISOString(),
        pending: library.pending(),
        tracks: library.tracks(),
        films,
        state: {
          likes: store && userId ? store.likes(userId) : [],
          plays: store && userId ? store.playCounts(userId) : [],
          recent: store && userId ? store.recent(userId) : [],
          playlists: store && userId ? store.playlists(userId) : [],
          radios: store && userId ? store.radios(userId) : [],
          community: store ? store.community() : [],
        },
      })
    }),
  )

  router.get(
    '/plan/:trackId',
    handler((request, response) => planResponse(library.watch, trackFor(request), request, response, '/api/music/stream')),
  )
  router.get(
    '/stream/:trackId',
    handler((request, response) => streamFile(library.watch, trackFor(request), request, response)),
  )

  router.get(
    '/cover/:albumId',
    handler(async (request, response) => {
      const id = String(request.params.albumId)
      const cover = ALBUM_ID.test(id) ? await library.coverFor(id) : null
      if (!cover) throw new WatchError(404, 'MUSIC_NO_COVER', 'This album has no cover picture.')
      response.setHeader('Cache-Control', 'private, max-age=86400')
      response.type('.jpg').sendFile(cover)
    }),
  )

  router.get(
    '/lyrics/:trackId',
    handler(async (request, response) => {
      const lyrics = await library.lyricsFor(trackFor(request))
      response.setHeader('Cache-Control', 'private, max-age=300')
      response.json(lyrics ?? { synced: null, plain: null, source: null })
    }),
  )

  // --- likes and history ---------------------------------------------------------------------------------------------------------

  router.put(
    '/likes/:trackId',
    handler((request, response) => {
      const userId = owner(response)
      const saved = requireStore()
      saved.like(userId, trackFor(request).id)
      response.json({ ok: true })
    }),
  )

  router.delete(
    '/likes/:trackId',
    handler((request, response) => {
      const userId = owner(response)
      const id = String(request.params.trackId)
      if (!isTrackId(id)) throw new WatchError(404, 'MUSIC_NOT_FOUND', 'That song could not be found.')
      requireStore().unlike(userId, id)
      response.json({ ok: true })
    }),
  )

  router.post(
    '/plays',
    handler((request, response) => {
      const userId = owner(response)
      const saved = requireStore()
      const body = bodyOf(request)
      const file = library.find(String(body.trackId))
      if (!file || typeof body.seconds !== 'number' || !saved.recordPlay(userId, file.id, body.seconds, body.completed === true))
        throw new WatchError(400, 'MUSIC_INVALID', 'That play could not be recorded.')
      response.json({ ok: true })
    }),
  )

  // --- playlists -----------------------------------------------------------------------------------------------------------------

  router.post(
    '/playlists',
    handler((request, response) => {
      const userId = owner(response)
      const saved = requireStore()
      const body = bodyOf(request)
      const trackIds = body.trackIds === undefined ? [] : trackIdsFrom(body.trackIds)
      const created = saved.createPlaylist(userId, body.name, trackIds)
      if (!created)
        throw new WatchError(400, 'MUSIC_INVALID', 'Give the playlist a name. An account can have up to 200 playlists.')
      response.status(201).json(created)
    }),
  )

  router.patch(
    '/playlists/:playlistId',
    handler((request, response) => {
      const userId = owner(response)
      const body = bodyOf(request)
      const updated = requireStore().updatePlaylist(userId, playlistId(request), {
        name: body.name,
        description: body.description,
      })
      if (!updated) throw new WatchError(404, 'MUSIC_NOT_FOUND', 'That playlist could not be found, or its name is empty.')
      response.json(updated)
    }),
  )

  router.delete(
    '/playlists/:playlistId',
    handler((request, response) => {
      const userId = owner(response)
      if (!requireStore().deletePlaylist(userId, playlistId(request)))
        throw new WatchError(404, 'MUSIC_NOT_FOUND', 'That playlist could not be found.')
      response.json({ ok: true })
    }),
  )

  // The exact list, in order: removing and re-ordering songs are saved by sending the new list.
  router.put(
    '/playlists/:playlistId/tracks',
    handler((request, response) => {
      const userId = owner(response)
      const updated = requireStore().setTracks(userId, playlistId(request), trackIdsFrom(bodyOf(request).trackIds))
      if (!updated) throw new WatchError(404, 'MUSIC_NOT_FOUND', 'That playlist could not be found.')
      response.json(updated)
    }),
  )

  router.post(
    '/playlists/:playlistId/tracks',
    handler((request, response) => {
      const userId = owner(response)
      const updated = requireStore().addTracks(userId, playlistId(request), trackIdsFrom(bodyOf(request).trackIds))
      if (!updated) throw new WatchError(404, 'MUSIC_NOT_FOUND', 'That playlist could not be found, or it is full.')
      response.json(updated)
    }),
  )

  // --- radios --------------------------------------------------------------------------------------------------------------------

  router.post(
    '/radios',
    handler((request, response) => {
      const userId = owner(response)
      const body = bodyOf(request)
      const radio = requireStore().addRadio(userId, body.seedKind, body.seedValue, body.label)
      if (!radio) throw new WatchError(400, 'MUSIC_INVALID', 'That radio could not be saved.')
      response.status(201).json(radio)
    }),
  )

  router.delete(
    '/radios/:radioId',
    handler((request, response) => {
      const userId = owner(response)
      const id = String(request.params.radioId)
      if (!UUID.test(id) || !requireStore().removeRadio(userId, id))
        throw new WatchError(404, 'MUSIC_NOT_FOUND', 'That radio could not be found.')
      response.json({ ok: true })
    }),
  )

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof WatchError) {
      response.status(error.status).json({ code: error.code, message: error.message })
      return
    }
    if (error instanceof CatalogError) {
      process.stderr.write(`Music catalog problem: ${error.message}\n`)
      response.status(500).json({ code: 'MUSIC_CATALOG_INVALID', message: CATALOG_PROBLEM_MESSAGE })
      return
    }
    process.stderr.write(`Music route failed: ${error instanceof Error ? error.message : String(error)}\n`)
    if (!response.headersSent)
      response.status(500).json({ code: 'MUSIC_FAILED', message: 'Music could not complete that request. Try again.' })
  })

  return router
}
