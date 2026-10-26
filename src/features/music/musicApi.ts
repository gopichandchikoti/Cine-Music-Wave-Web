import { accountUrl, authRequest } from '../../api'
import type {
  LyricLine,
  Lyrics,
  MusicLibraryResponse,
  PlanResponse,
  PlaylistSummary,
  RadioSeedKind,
  SavedRadio,
} from './musicTypes'

export const fetchMusicLibrary = (signal?: AbortSignal): Promise<MusicLibraryResponse> =>
  authRequest<MusicLibraryResponse>('/music/library', 'GET', undefined, { signal })

export const fetchMusicPlan = (trackId: string, query: string, signal?: AbortSignal): Promise<PlanResponse> =>
  authRequest<PlanResponse>(`/music/plan/${encodeURIComponent(trackId)}?${query}`, 'GET', undefined, { signal })

/** The plan returns a server-relative URL; this adds the configured API origin when the API is hosted separately. */
export const musicStreamUrl = (relativeUrl: string): string => accountUrl(relativeUrl)
export const coverUrl = (albumId: string): string => accountUrl(`/api/music/cover/${albumId}`)

export async function fetchLyrics(trackId: string, signal?: AbortSignal): Promise<Lyrics> {
  const response = await authRequest<{ synced: LyricLine[] | null; plain: string | null; source: 'file' | 'tag' | null }>(
    `/music/lyrics/${encodeURIComponent(trackId)}`,
    'GET',
    undefined,
    { signal },
  )
  return response
}

export const likeTrack = (trackId: string): Promise<unknown> =>
  authRequest(`/music/likes/${encodeURIComponent(trackId)}`, 'PUT', {})
export const unlikeTrack = (trackId: string): Promise<unknown> =>
  authRequest(`/music/likes/${encodeURIComponent(trackId)}`, 'DELETE')

export const reportPlay = (trackId: string, seconds: number, completed: boolean): Promise<unknown> =>
  authRequest('/music/plays', 'POST', { trackId, seconds: Math.round(seconds), completed })

export const createPlaylist = (name: string, trackIds: readonly string[] = []): Promise<PlaylistSummary> =>
  authRequest<PlaylistSummary>('/music/playlists', 'POST', { name, trackIds })
export const renamePlaylist = (id: string, name: string): Promise<PlaylistSummary> =>
  authRequest<PlaylistSummary>(`/music/playlists/${encodeURIComponent(id)}`, 'PATCH', { name })
export const deletePlaylist = (id: string): Promise<unknown> =>
  authRequest(`/music/playlists/${encodeURIComponent(id)}`, 'DELETE')
export const setPlaylistTracks = (id: string, trackIds: readonly string[]): Promise<PlaylistSummary> =>
  authRequest<PlaylistSummary>(`/music/playlists/${encodeURIComponent(id)}/tracks`, 'PUT', { trackIds })
export const addPlaylistTracks = (id: string, trackIds: readonly string[]): Promise<PlaylistSummary> =>
  authRequest<PlaylistSummary>(`/music/playlists/${encodeURIComponent(id)}/tracks`, 'POST', { trackIds })

export const saveRadio = (seedKind: RadioSeedKind, seedValue: string, label: string): Promise<SavedRadio> =>
  authRequest<SavedRadio>('/music/radios', 'POST', { seedKind, seedValue, label })
export const deleteRadio = (id: string): Promise<unknown> => authRequest(`/music/radios/${encodeURIComponent(id)}`, 'DELETE')
