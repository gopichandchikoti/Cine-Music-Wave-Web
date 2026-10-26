import { createHmac } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose'
import type { ProviderConfig } from './config.js'
import { AuthError, type ProviderIdentity } from './types.js'
export type OAuthAttempt = {
  state: string
  nonce: string
  verifier: string
  bindingHash: string
  expiresAt: number
  provider: string
  linkUserId: string | null
}
const unavailable = () => new AuthError(503, 'AUTH_PROVIDER_UNAVAILABLE', 'The sign-in provider is unavailable. Try again later.')
const rejected = () => new AuthError(401, 'AUTH_PROVIDER_REJECTED', 'Provider sign-in could not be verified. Try again.')
export async function fetchProviderJson(url: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
  let response: globalThis.Response
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000), redirect: 'error' })
  } catch {
    throw unavailable()
  }
  if (!response.ok) throw rejected()
  if (!response.body || Number(response.headers.get('content-length') ?? 0) > 65536) {
    await response.body?.cancel()
    throw rejected()
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      length += result.value.byteLength
      if (length > 65536) {
        await reader.cancel()
        throw rejected()
      }
      chunks.push(result.value)
    }
  } catch {
    throw rejected()
  } finally {
    reader.releaseLock()
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error()
    return result
  } catch {
    throw rejected()
  }
}
function microsoftTenant(config: ProviderConfig) {
  return config.tenant === 'consumers' ? '9188040d-6c67-4c5b-b112-36a304b66dad' : config.tenant!
}
function endpoints(config: ProviderConfig) {
  if (config.provider === 'google')
    return {
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      jwks: 'https://www.googleapis.com/oauth2/v3/certs',
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    }
  if (config.provider === 'microsoft') {
    const root = 'https://login.microsoftonline.com/' + config.tenant
    return {
      authorize: root + '/oauth2/v2.0/authorize',
      token: root + '/oauth2/v2.0/token',
      jwks: 'https://login.microsoftonline.com/' + microsoftTenant(config) + '/discovery/v2.0/keys',
      issuer: 'https://login.microsoftonline.com/' + microsoftTenant(config) + '/v2.0',
    }
  }
  return {
    authorize: 'https://www.facebook.com/' + config.version + '/dialog/oauth',
    token: 'https://graph.facebook.com/' + config.version + '/oauth/access_token',
    jwks: '',
    issuer: '',
  }
}
export function authorizationUrl(config: ProviderConfig, attempt: OAuthAttempt, challenge: string): string {
  const url = new URL(endpoints(config).authorize)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state: attempt.state,
    scope: config.provider === 'facebook' ? 'email,public_profile' : 'openid email profile',
    ...(config.provider === 'facebook'
      ? {}
      : { nonce: attempt.nonce, code_challenge: challenge, code_challenge_method: 'S256', response_mode: 'query' }),
  }).toString()
  return url.href
}
const keys = new Map<string, JWTVerifyGetKey>()
export async function verifyOidcToken(
  config: ProviderConfig,
  token: string,
  nonce: string,
  keyOverride?: JWTVerifyGetKey,
): Promise<JWTPayload> {
  const spec = endpoints(config)
  let key = keyOverride ?? keys.get(spec.jwks)
  if (!key) {
    key = createRemoteJWKSet(new URL(spec.jwks), { timeoutDuration: 10000, cooldownDuration: 30000 })
    keys.set(spec.jwks, key)
  }
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: spec.issuer,
      audience: config.clientId,
      algorithms: ['RS256'],
      requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub', 'nonce'],
      maxTokenAge: '10m',
      clockTolerance: 5,
    })
    if (
      payload.nonce !== nonce ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      payload.sub.length > 255 ||
      typeof payload.iat !== 'number' ||
      payload.iat > Date.now() / 1000 + 5
    )
      throw rejected()
    if (config.provider === 'microsoft' && payload.tid !== microsoftTenant(config)) throw rejected()
    if (payload.azp !== undefined && payload.azp !== config.clientId) throw rejected()
    if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId) throw rejected()
    return payload
  } catch {
    throw rejected()
  }
}
function safeName(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback
  const value = input
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N} .'-]/gu, '')
    .trim()
    .slice(0, 50)
  return value || fallback
}
export async function exchangeIdentity(config: ProviderConfig, attempt: OAuthAttempt, code: string): Promise<ProviderIdentity> {
  const spec = endpoints(config),
    form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
      ...(config.provider === 'facebook' ? {} : { code_verifier: attempt.verifier }),
    })
  const tokens = await fetchProviderJson(spec.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (config.provider === 'facebook') {
    if (typeof tokens.access_token !== 'string' || tokens.access_token.length > 8192) throw rejected()
    const access = tokens.access_token,
      proof = createHmac('sha256', config.clientSecret).update(access).digest('hex')
    const debugUrl = new URL('https://graph.facebook.com/' + config.version + '/debug_token')
    debugUrl.search = new URLSearchParams({ input_token: access }).toString()
    const debug = await fetchProviderJson(debugUrl.href, {
      headers: { Authorization: 'Bearer ' + config.clientId + '|' + config.clientSecret },
    })
    const data = debug.data as Record<string, unknown> | undefined
    if (
      !data ||
      data.is_valid !== true ||
      data.type !== 'USER' ||
      !Array.isArray(data.scopes) ||
      !data.scopes.includes('email') ||
      String(data.app_id) !== config.clientId ||
      typeof data.user_id !== 'string' ||
      typeof data.expires_at !== 'number' ||
      data.expires_at <= Date.now() / 1000 ||
      typeof data.data_access_expires_at !== 'number' ||
      data.data_access_expires_at <= Date.now() / 1000
    )
      throw rejected()
    const profileUrl = new URL('https://graph.facebook.com/' + config.version + '/me')
    profileUrl.search = new URLSearchParams({ fields: 'id,email,first_name,last_name', appsecret_proof: proof }).toString()
    const profile = await fetchProviderJson(profileUrl.href, { headers: { Authorization: 'Bearer ' + access } })
    if (profile.id !== data.user_id || typeof profile.email !== 'string') throw rejected()
    return {
      provider: 'facebook',
      subject: data.user_id,
      email: profile.email,
      emailVerified: false,
      firstName: safeName(profile.first_name, 'Learner'),
      lastName: safeName(profile.last_name, ''),
    }
  }
  if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 16384) throw rejected()
  const claims = await verifyOidcToken(config, tokens.id_token, attempt.nonce)
  const email = typeof claims.email === 'string' ? claims.email : null
  return {
    provider: config.provider,
    subject: config.provider === 'microsoft' ? String(claims.iss) + '#' + claims.sub : claims.sub!,
    email,
    emailVerified: claims.email_verified === true,
    firstName: safeName(claims.given_name, 'Learner'),
    lastName: safeName(claims.family_name, ''),
  }
}
