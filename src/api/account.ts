import type { AuthSessionResponse } from '../@types'
import { content as copy } from '../content.js'
import type { AuthConfig as AccountConfig, OAuthProvider } from '../features/auth/authTypes'
import { apiEndpoint, jsonBody, requestJson } from './client'

export const accountUrl = (path: string): string => apiEndpoint(path)

export const fetchSession = (): Promise<AuthSessionResponse> => requestJson<AuthSessionResponse>(apiEndpoint('/api/auth/session'))

export const login = (password: string): Promise<AuthSessionResponse> =>
  requestJson<AuthSessionResponse>(apiEndpoint('/api/auth/login'), { method: 'POST', ...jsonBody({ password }) })

export const logout = (): Promise<AuthSessionResponse> =>
  requestJson<AuthSessionResponse>(apiEndpoint('/api/auth/logout'), { method: 'POST', ...jsonBody({}) })

export const fetchAuthConfig = (): Promise<AccountConfig> => requestJson<AccountConfig>(apiEndpoint('/api/auth/config'))

/** A call to an `/api/<path>` account route; the body, when given, is sent as JSON. */
export const authRequest = <T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  body?: unknown,
  options: Pick<RequestInit, 'keepalive' | 'signal'> = {},
): Promise<T> =>
  requestJson<T>(apiEndpoint(`/api${path}`), {
    ...options,
    method,
    ...(body === undefined ? {} : jsonBody(body)),
  })

/** Starts an OAuth sign-in or account link and returns the provider address, which must be HTTPS. */
export const oauthStart = async (provider: OAuthProvider, action?: 'link'): Promise<string> => {
  const suffix = action ? '?action=link' : ''
  const result = await authRequest<{ url: string }>(`/auth/oauth/${provider}/start${suffix}`, 'POST', {})
  const target = new URL(result.url)
  if (target.protocol !== 'https:') throw new Error(copy.api.theProviderUrlIsInvalid)
  return target.href
}
