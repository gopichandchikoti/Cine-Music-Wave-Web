export type OAuthProvider = 'google' | 'microsoft' | 'facebook'
export type AuthView = 'sign-in' | 'sign-up' | 'verify-email' | 'forgot-password' | 'reset-password'
export type AuthStatus = 'checking' | 'signed-out' | 'signed-in' | 'error'
export type PublicUser = {
  id: string
  username: string
  firstName: string
  lastName: string
  displayName: string
  email: string
  emailVerified: boolean
  phoneNumber: string | null
  avatarUrl: string | null
  providers: string[]
  createdAt: string
  lastLoginAt: string | null
}
export type AuthConfig = {
  mode: 'accounts' | 'owner'
  providers: { provider: OAuthProvider; enabled: boolean }[]
  development: boolean
  emailDelivery: boolean
  signupEnabled: boolean
  csrfToken?: string
}
export type AccountSession = {
  authenticated: boolean
  required: boolean
  user?: PublicUser | null
  mode?: 'accounts' | 'owner'
  csrfToken?: string
  verification?: 'sent' | 'offline' | 'delivery-unavailable'
}
export type AccountSettings = {
  theme: 'light' | 'dark'
  reading_scale: 'standard' | 'large'
  sessions: { id: string; createdAt: number; lastSeenAt: number; expiresAt: number; current: boolean }[]
  emailDelivery: boolean
}
