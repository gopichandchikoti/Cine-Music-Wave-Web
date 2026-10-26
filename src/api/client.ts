import { content as copy, formatContent } from '../content.js'
import type { AuthSessionResponse } from '../@types'

const apiOrigin = __API_ORIGIN__.replace(/\/$/, '')

/** The full URL for an API path: same-origin by default, or the separate API service when `API_ORIGIN` is set. */
export const apiEndpoint = (path: string): string => `${apiOrigin}${path}`

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

let csrfToken = ''

/** Headers every write must carry: the current CSRF token and the app marker the server checks. */
export const writeHeaders = (): Record<string, string> => ({ 'x-csrf-token': csrfToken, 'x-requested-with': 'StudyLibrary' })

const isWriteMethod = (method: string | undefined): boolean => Boolean(method) && !['GET', 'HEAD'].includes(method!.toUpperCase())

const errorBody = async (response: Response): Promise<{ message: string | null; code: string | null }> => {
  const body = (await response.json().catch(() => null)) as { message?: unknown; code?: unknown } | null
  return {
    message: typeof body?.message === 'string' ? body.message : null,
    code: typeof body?.code === 'string' ? body.code : null,
  }
}

export const requestJson = async <ResponseBody>(
  url: string,
  options: RequestInit = {},
  canRetryCsrf = true,
): Promise<ResponseBody> => {
  const headers = new Headers(options.headers)
  const isWrite = isWriteMethod(options.method)
  if (isWrite) {
    if (csrfToken) headers.set('x-csrf-token', csrfToken)
    headers.set('x-requested-with', 'StudyLibrary')
  }
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  if (!response.ok) {
    const { message, code } = await errorBody(response)
    // The server rejects a stale CSRF token before any side effect, so one refresh-and-retry is safe. This happens
    // when the server restarted (development) or rotated its signing secret while this page stayed open.
    if (isWrite && canRetryCsrf && code === 'AUTH_CSRF_REJECTED') {
      const refreshed = await requestJson<AuthSessionResponse>(apiEndpoint('/api/auth/session'), {}, false).then(
        () => true,
        () => false,
      )
      if (refreshed) return requestJson<ResponseBody>(url, options, false)
    }
    throw new ApiError(
      message ?? formatContent(copy.api.requestFailedWithStatusValue, { value0: response.status }),
      response.status,
      code,
    )
  }
  const result = (await response.json()) as ResponseBody
  if (result && typeof result === 'object' && 'csrfToken' in result && typeof result.csrfToken === 'string')
    csrfToken = result.csrfToken
  return result
}

export const jsonBody = (body: unknown): Pick<RequestInit, 'headers' | 'body'> => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
