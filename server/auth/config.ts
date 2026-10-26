import { randomBytes } from 'node:crypto'
import { AuthError, type Provider } from './types.js'
export type ProviderConfig = {
  provider: Provider
  clientId: string
  clientSecret: string
  redirectUri: string
  tenant?: string
  version?: string
}
export type AuthConfig = {
  mode: 'accounts' | 'owner'
  production: boolean
  origin: string
  secret: string
  providers: Partial<Record<Provider, ProviderConfig>>
  emailKey?: string
  emailFrom?: string
  signupEnabled: boolean
}
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env.NODE_ENV === 'production',
    mode = env.AUTH_MODE ?? 'accounts'
  if (mode !== 'accounts' && mode !== 'owner') throw new Error('AUTH_MODE must be accounts or owner.')
  const origin = new URL(env.AUTH_PUBLIC_ORIGIN ?? (production ? '' : 'http://localhost:4040'))
  if (
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    (production && origin.protocol !== 'https:') ||
    (!production &&
      origin.protocol !== 'https:' &&
      !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))
  )
    throw new Error('AUTH_PUBLIC_ORIGIN must be an HTTPS origin, or loopback HTTP for development.')
  if (production && (!env.AUTH_SESSION_SECRET || Buffer.byteLength(env.AUTH_SESSION_SECRET) < 32))
    throw new Error('A server-only AUTH_SESSION_SECRET of at least 32 bytes is required.')
  if (env.AUTH_IDENTITY_STORE && env.AUTH_IDENTITY_STORE !== 'sqlite')
    throw new Error(
      'Only the single-instance SQLite identity adapter is installed. Do not start with an unsupported identity store.',
    )
  if (mode === 'owner' && !env.LIBRARY_ACCESS_PASSWORD)
    throw new Error('Owner mode requires LIBRARY_ACCESS_PASSWORD. Anonymous library access is disabled.')
  if (production && mode === 'accounts' && env.AUTH_ALLOW_PERSISTENT_SQLITE !== 'true')
    throw new Error(
      'The installed identity adapter requires a single-instance persistent SQLite deployment. Set AUTH_ALLOW_PERSISTENT_SQLITE=true only for that deployment; a PostgreSQL/Supabase identity adapter is not installed.',
    )
  const providers: AuthConfig['providers'] = {}
  for (const provider of ['google', 'microsoft', 'facebook'] as const) {
    const prefix = provider.toUpperCase(),
      id = env[prefix + '_CLIENT_ID'],
      secret = env[prefix + '_CLIENT_SECRET'],
      redirect = env[prefix + '_REDIRECT_URI']
    if (env[prefix + '_LOGIN_ENABLED'] !== 'true') continue
    if (!id || !secret || !redirect) throw new Error(prefix + ' login needs client ID, secret, and redirect URI.')
    const uri = new URL(redirect)
    if (
      uri.origin !== origin.origin ||
      uri.pathname !== '/api/auth/oauth/' + provider + '/callback' ||
      uri.search ||
      uri.hash ||
      uri.username ||
      uri.password
    )
      throw new Error(prefix + ' callback must exactly match the configured public origin and auth callback path.')
    const tenant = env.MICROSOFT_TENANT_ID ?? 'consumers'
    if (provider === 'microsoft' && !/^(consumers|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(tenant))
      throw new Error(
        'Microsoft supports consumers or an explicit tenant GUID; common/organizations need a separate issuer policy.',
      )
    const version = env.FACEBOOK_GRAPH_VERSION
    if (provider === 'facebook' && (!version || !/^v\d{2}\.0$/.test(version)))
      throw new Error('Set an explicitly supported FACEBOOK_GRAPH_VERSION from your Meta dashboard.')
    providers[provider] = { provider, clientId: id, clientSecret: secret, redirectUri: uri.href, tenant, version }
  }
  if (Boolean(env.RESEND_API_KEY) !== Boolean(env.AUTH_EMAIL_FROM))
    throw new Error('Email delivery needs both RESEND_API_KEY and AUTH_EMAIL_FROM.')
  return {
    mode,
    production,
    origin: origin.origin,
    secret: env.AUTH_SESSION_SECRET ?? randomBytes(48).toString('base64url'),
    providers,
    emailKey: env.RESEND_API_KEY,
    emailFrom: env.AUTH_EMAIL_FROM,
    signupEnabled: production ? env.AUTH_SIGNUP_ENABLED === 'true' : env.AUTH_SIGNUP_ENABLED !== 'false',
  }
}
export function providerName(value: string): Provider {
  if (!['google', 'microsoft', 'facebook'].includes(value))
    throw new AuthError(404, 'AUTH_PROVIDER_UNAVAILABLE', 'This sign-in provider is unavailable.')
  return value as Provider
}
