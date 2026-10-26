export type Provider = 'google' | 'microsoft' | 'facebook'
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
export type UserRow = {
  id: string
  email: string
  username: string
  first_name: string
  last_name: string
  phone_number: string | null
  password_hash: string | null
  email_verified_at: string | null
  disabled_at: string | null
  created_at: string
  updated_at: string
  last_login_at: string | null
  avatar_blob: Uint8Array | null
}
export type SessionRow = {
  id: string
  user_id: string
  token_hash: string
  expires_at: number
  created_at: number
  last_seen_at: number
  revoked_at: number | null
  reauthenticated_at: number
}
export type ProviderIdentity = {
  provider: Provider
  subject: string
  email: string | null
  emailVerified: boolean
  firstName: string
  lastName: string
}
export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
