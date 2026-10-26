import { accountUrl, authRequest } from '../../api'
import type { FrameRect } from './picture'
import type { CatalogResponse, Diagnostics, PlanResponse, RescanResult } from './watchTypes'

export const fetchCatalog = (signal?: AbortSignal): Promise<CatalogResponse> =>
  authRequest<CatalogResponse>('/watch/catalog', 'GET', undefined, { signal })
export const rescanLibrary = (): Promise<RescanResult> => authRequest<RescanResult>('/watch/rescan', 'POST', {})
export const fetchDiagnostics = (): Promise<Diagnostics> => authRequest<Diagnostics>('/watch/diagnostics')

export const fetchPlan = (fileId: string, query: string, signal?: AbortSignal): Promise<PlanResponse> =>
  authRequest<PlanResponse>(`/watch/plan/${encodeURIComponent(fileId)}?${query}`, 'GET', undefined, { signal })

/** Where the picture sits inside any baked-in black bars, or null when the frame has none. */
export const fetchFrame = (fileId: string, signal?: AbortSignal): Promise<{ rect: FrameRect | null }> =>
  authRequest<{ rect: FrameRect | null }>(`/watch/frame/${encodeURIComponent(fileId)}`, 'GET', undefined, { signal })

/** The plan returns a server-relative URL; this adds the configured API origin when the API is hosted separately. */
export const streamUrl = (relativeUrl: string): string => accountUrl(relativeUrl)
export const artworkUrl = (titleId: string, kind: 'card' | 'backdrop', version: number): string =>
  accountUrl(`/api/watch/artwork/${titleId}/${kind}?v=${version}`)
/** A short silent clip of the title, made by the server the first time it is needed. */
export const previewUrl = (titleId: string): string => accountUrl(`/api/watch/preview/${titleId}`)
export const thumbUrl = (fileId: string, version: number): string => accountUrl(`/api/watch/thumb/${fileId}?v=${version}`)

export async function fetchSubtitleText(fileId: string, ordinal: number, signal?: AbortSignal): Promise<string> {
  const response = await fetch(accountUrl(`/api/watch/subtitle/${encodeURIComponent(fileId)}/${ordinal}`), {
    credentials: 'include',
    signal,
  })
  if (!response.ok) throw new Error('Subtitles could not be loaded.')
  return response.text()
}

export const saveProgress = (fileId: string, position: number, duration: number, keepalive = false): Promise<unknown> =>
  authRequest(`/watch/progress/${encodeURIComponent(fileId)}`, 'PUT', { position, duration }, { keepalive })
export const clearTitleProgress = (titleId: string): Promise<unknown> =>
  authRequest(`/watch/progress/title/${encodeURIComponent(titleId)}`, 'DELETE')
export const addToMyList = (titleId: string): Promise<unknown> =>
  authRequest(`/watch/list/${encodeURIComponent(titleId)}`, 'PUT', {})
export const removeFromMyList = (titleId: string): Promise<unknown> =>
  authRequest(`/watch/list/${encodeURIComponent(titleId)}`, 'DELETE')
