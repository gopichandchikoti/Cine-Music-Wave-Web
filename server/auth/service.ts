import { randomUUID } from 'node:crypto'
import { AuthRepository } from './repository.js'
import { hashPassword, verifyPassword } from './password.js'
import { AuthError, type ProviderIdentity, type UserRow } from './types.js'
import { hashToken, randomToken } from './sessions.js'
import * as v from './validation.js'
import type { EmailDelivery } from './email.js'
export class AuthService {
  private emailActive = 0
  private failures = new Map<string, { count: number; nextAt: number; expiresAt: number }>()
  constructor(
    readonly repository: AuthRepository,
    readonly deliver?: EmailDelivery,
    readonly now = () => Date.now(),
  ) {}
  async signup(input: unknown) {
    const body = v.object(input),
      email = v.email(body.email),
      username = v.username(body.username),
      firstName = v.name(body.firstName),
      lastName = v.name(body.lastName),
      password = v.password(body.password, [username, email.split('@')[0]])
    if (body.confirmPassword !== password) throw v.invalid('The passwords must match.')
    const passwordHash = await hashPassword(password)
    let user: UserRow
    try {
      user = this.repository.transaction(() =>
        this.repository.createUser({ email, username, firstName, lastName, passwordHash, verified: false }, this.now()),
      )
    } catch (error) {
      if (String(error).includes('UNIQUE constraint'))
        throw new AuthError(
          409,
          'AUTH_ACCOUNT_CONFLICT',
          'Those account details cannot be used. Try different details or sign in.',
        )
      throw error
    }
    if (this.deliver) {
      try {
        await this.sendToken(user, 'email_verify')
      } catch {
        return { user, verification: 'delivery-unavailable' as const }
      }
    }
    return { user, verification: this.deliver ? ('sent' as const) : ('offline' as const) }
  }
  async login(input: unknown): Promise<UserRow> {
    const body = v.object(input)
    let identifier: string
    try {
      identifier = v.loginIdentifier(body.identifier)
    } catch {
      identifier = 'invalid-identifier'
    }
    const password =
      typeof body.password === 'string' && body.password.length <= 128 && Buffer.byteLength(body.password) <= 512
        ? body.password
        : ''
    const now = this.now(),
      key = hashToken(identifier)
    for (const [id, row] of this.failures) if (row.expiresAt <= now) this.failures.delete(id)
    const prior = this.failures.get(key)
    if (prior && prior.nextAt > now) throw new AuthError(429, 'AUTH_RATE_LIMIT', 'Too many attempts. Try again shortly.')
    if (!prior && this.failures.size >= 5000) throw new AuthError(503, 'AUTH_BUSY', 'Sign-in is busy. Try again shortly.')
    const user = this.repository.byLogin(identifier)
    const valid = await verifyPassword(password, user?.password_hash ?? null)
    const fresh = user ? this.repository.user(user.id) : undefined
    if (!valid || !user || !fresh || fresh.disabled_at || fresh.password_hash !== user.password_hash) {
      const count = (prior?.count ?? 0) + 1
      this.failures.set(key, {
        count,
        nextAt: now + (count < 3 ? 0 : Math.min(16000, 1000 * 2 ** Math.min(count - 3, 4))),
        expiresAt: now + 15 * 60000,
      })
      throw new AuthError(401, 'AUTH_INVALID_CREDENTIALS', 'The email, username, or password is not correct.')
    }
    this.failures.delete(key)
    return fresh!
  }
  async sendToken(user: UserRow, purpose: 'email_verify' | 'password_reset') {
    if (!this.deliver)
      throw new AuthError(503, 'AUTH_EMAIL_UNAVAILABLE', 'Email delivery is not configured for this installation.')
    if (this.emailActive >= 2) throw new AuthError(503, 'AUTH_EMAIL_UNAVAILABLE', 'Email delivery is busy. Try again later.')
    this.emailActive++
    const token = randomToken(),
      now = this.now(),
      id = randomUUID()
    try {
      this.repository.transaction(() => {
        this.repository.run(
          'UPDATE entertainment_auth_tokens SET consumed_at=? WHERE user_id=? AND purpose=? AND consumed_at IS NULL',
          now,
          user.id,
          purpose,
        )
        this.repository.run(
          'INSERT INTO entertainment_auth_tokens VALUES(?,?,?,?,?,NULL,?)',
          id,
          user.id,
          purpose,
          hashToken(token),
          now + (purpose === 'email_verify' ? 86400000 : 1800000),
          now,
        )
      })
      try {
        await this.deliver(user.email, purpose, token)
      } catch (error) {
        this.repository.run('DELETE FROM entertainment_auth_tokens WHERE id=?', id)
        throw error
      }
    } finally {
      this.emailActive--
    }
  }
  async forgot(input: unknown) {
    if (!this.deliver)
      throw new AuthError(503, 'AUTH_EMAIL_UNAVAILABLE', 'Email delivery is not configured for this installation.')
    const address = v.email(v.object(input).email),
      user = this.repository.one<UserRow>('SELECT * FROM entertainment_users WHERE email=?', address)
    if (user && !user.disabled_at && user.password_hash)
      queueMicrotask(() => {
        void this.sendToken(user, 'password_reset').catch(() => {})
      })
    return { message: 'If an eligible account exists, a reset link will be sent.' }
  }
  consume(raw: string, purpose: 'email_verify' | 'password_reset', action: (user: UserRow) => void) {
    const now = this.now()
    this.repository.transaction(() => {
      const row = this.repository.one<{ id: string; user_id: string }>(
        'SELECT id,user_id FROM entertainment_auth_tokens WHERE token_hash=? AND purpose=? AND consumed_at IS NULL AND expires_at>?',
        hashToken(raw),
        purpose,
        now,
      )
      const user = row ? this.repository.user(row.user_id) : undefined
      if (!row || !user || user.disabled_at)
        throw new AuthError(400, 'AUTH_TOKEN_INVALID', 'This link is invalid or expired. Request another link.')
      const changed = this.repository.run(
        'UPDATE entertainment_auth_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL',
        now,
        row.id,
      )
      if (changed.changes !== 1)
        throw new AuthError(400, 'AUTH_TOKEN_INVALID', 'This link is invalid or expired. Request another link.')
      action(user)
    })
  }
  verify(input: unknown) {
    const raw = v.token(v.object(input).token)
    this.consume(raw, 'email_verify', (user) => {
      this.repository.run(
        'UPDATE entertainment_users SET email_verified_at=?,updated_at=? WHERE id=?',
        new Date(this.now()).toISOString(),
        new Date(this.now()).toISOString(),
        user.id,
      )
      this.repository.audit(user.id, 'email_verified', this.now())
    })
  }
  async reset(input: unknown) {
    const body = v.object(input),
      raw = v.token(body.token),
      password = v.password(body.password)
    if (body.confirmPassword !== password) throw v.invalid('The passwords must match.')
    const hash = await hashPassword(password)
    this.consume(raw, 'password_reset', (user) => {
      this.repository.run(
        'UPDATE entertainment_users SET password_hash=?,updated_at=? WHERE id=?',
        hash,
        new Date(this.now()).toISOString(),
        user.id,
      )
      this.repository.revokeAll(user.id, this.now())
      this.repository.audit(user.id, 'password_reset', this.now())
    })
  }
  async reauthenticate(user: UserRow, sessionReauth: number, input: unknown) {
    if (user.password_hash) {
      const body = v.object(input)
      const valid = await verifyPassword(
        typeof body.currentPassword === 'string' && body.currentPassword.length <= 128 ? body.currentPassword : '',
        user.password_hash,
      )
      if (!valid || this.repository.user(user.id)?.password_hash !== user.password_hash)
        throw new AuthError(401, 'AUTH_REAUTH_REQUIRED', 'Confirm your current password to continue.')
    } else if (this.now() - sessionReauth > 5 * 60000)
      throw new AuthError(401, 'AUTH_REAUTH_REQUIRED', 'Sign in with your provider again, then retry within five minutes.')
  }
  requireVerified(user: UserRow) {
    if (this.deliver && !user.email_verified_at)
      throw new AuthError(403, 'AUTH_EMAIL_UNVERIFIED', 'Verify your email before this account action.')
  }
  async changePassword(user: UserRow, reauth: number, input: unknown, sessionId: string) {
    this.requireVerified(user)
    const body = v.object(input)
    await this.reauthenticate(user, reauth, body)
    const password = v.password(body.password, [user.username, user.email.split('@')[0]])
    if (body.confirmPassword !== password) throw v.invalid('The passwords must match.')
    const hash = await hashPassword(password)
    this.repository.transaction(() => {
      const current = this.repository.user(user.id)
      if (
        !current ||
        current.disabled_at ||
        current.password_hash !== user.password_hash ||
        !this.repository.one(
          'SELECT id FROM entertainment_auth_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>? AND last_seen_at>?',
          sessionId,
          user.id,
          this.now(),
          this.now() - 12 * 3600000,
        )
      )
        throw new AuthError(401, 'AUTH_REAUTH_REQUIRED', 'Sign in again before changing your password.')
      this.repository.run(
        'UPDATE entertainment_auth_tokens SET consumed_at=? WHERE user_id=? AND purpose=? AND consumed_at IS NULL',
        this.now(),
        user.id,
        'password_reset',
      )
      this.repository.run(
        'UPDATE entertainment_users SET password_hash=?,updated_at=? WHERE id=?',
        hash,
        new Date(this.now()).toISOString(),
        user.id,
      )
      this.repository.revokeAll(user.id, this.now())
      this.repository.audit(user.id, 'password_changed', this.now())
    })
  }
  updateProfile(user: UserRow, input: unknown) {
    const body = v.object(input),
      firstName = v.name(body.firstName),
      lastName = v.name(body.lastName),
      username = v.username(body.username),
      phone = v.phone(body.phoneNumber ?? null)
    if (username !== user.username) this.requireVerified(user)
    try {
      this.repository.run(
        'UPDATE entertainment_users SET first_name=?,last_name=?,username=?,phone_number=?,updated_at=? WHERE id=?',
        firstName,
        lastName,
        username,
        phone,
        new Date(this.now()).toISOString(),
        user.id,
      )
    } catch (error) {
      if (String(error).includes('UNIQUE constraint'))
        throw new AuthError(409, 'PROFILE_USERNAME_CONFLICT', 'That username is unavailable.')
      throw error
    }
    this.repository.audit(user.id, 'profile_updated', this.now())
    return this.repository.publicUser(this.repository.user(user.id)!)
  }
  identity(identity: ProviderIdentity, linkUserId: string | null): UserRow {
    const prior = this.repository.one<{ user_id: string }>(
      'SELECT user_id FROM entertainment_auth_identities WHERE provider=? AND provider_subject=?',
      identity.provider,
      identity.subject,
    )
    if (prior) {
      if (linkUserId && prior.user_id !== linkUserId)
        throw new AuthError(409, 'AUTH_LINK_REJECTED', 'This provider cannot be linked to this account.')
      const user = this.repository.user(prior.user_id)!
      if (user.disabled_at) throw new AuthError(401, 'AUTH_PROVIDER_REJECTED', 'Provider sign-in could not be verified.')
      return user
    }
    return this.repository.transaction(() => {
      let user = linkUserId ? this.repository.user(linkUserId) : undefined
      if (linkUserId && (!user || user.disabled_at)) throw new AuthError(401, 'AUTH_REQUIRED', 'Sign in again.')
      if (!user) {
        if (!identity.email)
          throw new AuthError(
            401,
            'AUTH_PROVIDER_REJECTED',
            'The provider did not supply the account details needed to continue.',
          )
        const address = v.email(identity.email)
        if (this.repository.one('SELECT id FROM entertainment_users WHERE email=?', address))
          throw new AuthError(
            409,
            'AUTH_LINK_REQUIRED',
            'Sign in to your existing account and link this provider from your profile.',
          )
        const username = 'learner_' + randomUUID().replace(/-/g, '').slice(0, 12)
        user = this.repository.createUser(
          {
            email: address,
            username,
            firstName: identity.firstName,
            lastName: identity.lastName,
            passwordHash: null,
            verified: identity.emailVerified,
          },
          this.now(),
        )
      }
      if (
        this.repository.one(
          'SELECT id FROM entertainment_auth_identities WHERE user_id=? AND provider=?',
          user.id,
          identity.provider,
        )
      )
        throw new AuthError(409, 'AUTH_LINK_REJECTED', 'This provider is already linked to your account.')
      this.repository.run(
        'INSERT INTO entertainment_auth_identities VALUES(?,?,?,?,?,?)',
        randomUUID(),
        user.id,
        identity.provider,
        identity.subject,
        identity.email,
        new Date(this.now()).toISOString(),
      )
      this.repository.audit(user.id, 'provider_linked', this.now())
      return user
    })
  }
  unlink(user: UserRow, provider: string) {
    this.requireVerified(user)
    this.repository.transaction(() => {
      const providers = this.repository.all('SELECT id FROM entertainment_auth_identities WHERE user_id=?', user.id)
      if (!user.password_hash && providers.length <= 1)
        throw new AuthError(409, 'AUTH_LAST_METHOD', 'Add another sign-in method before removing this one.')
      this.repository.run('DELETE FROM entertainment_auth_identities WHERE user_id=? AND provider=?', user.id, provider)
      this.repository.revokeAll(user.id, this.now())
      this.repository.audit(user.id, 'provider_unlinked', this.now())
    })
  }
}
