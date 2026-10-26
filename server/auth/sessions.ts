import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import type { AuthConfig } from './config.js'
import type { AuthRepository } from './repository.js'
import type { SessionRow, UserRow } from './types.js'
import { AuthError } from './types.js'
export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex')
export const randomToken = () => randomBytes(32).toString('base64url')
export const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
export function cookie(request: Request, name: string): string | null {
  const entries = (request.headers.cookie ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter((x) => x.startsWith(name + '='))
  if (entries.length !== 1) return null
  const value = entries[0].slice(name.length + 1)
  return /^[A-Za-z0-9_.-]{1,160}$/.test(value) ? value : null
}
export class Sessions {
  readonly name: string
  readonly csrfName: string
  readonly oauthName: string
  constructor(
    readonly repository: AuthRepository,
    readonly config: AuthConfig,
    readonly now = () => Date.now(),
  ) {
    this.name = config.production ? '__Host-cine_music_wave_account' : 'cine_music_wave_account'
    this.csrfName = config.production ? '__Host-cine_music_wave_csrf' : 'cine_music_wave_csrf'
    this.oauthName = config.production ? '__Host-cine_music_wave_oauth' : 'cine_music_wave_oauth'
  }
  setCookie(response: Response, name: string, value: string, maxAge: number) {
    response.append(
      'Set-Cookie',
      name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (this.config.production ? '; Secure' : ''),
    )
  }
  read(request: Request): { session: SessionRow; user: UserRow } | null {
    const raw = cookie(request, this.name)
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null
    const session = this.repository.one<SessionRow>(
        'SELECT * FROM entertainment_auth_sessions WHERE token_hash=?',
        hashToken(raw),
      ),
      now = this.now()
    if (!session || session.revoked_at !== null || session.expires_at <= now || session.last_seen_at <= now - 12 * 3600000)
      return null
    const user = this.repository.user(session.user_id)
    if (!user || user.disabled_at) return null
    if (now - session.last_seen_at > 60000)
      this.repository.run('UPDATE entertainment_auth_sessions SET last_seen_at=? WHERE id=?', now, session.id)
    return { session, user }
  }
  create(request: Request, response: Response, user: UserRow) {
    if (user.disabled_at) throw new AuthError(401, 'AUTH_INVALID_CREDENTIALS', 'The email, username, or password is not correct.')
    const prior = this.read(request)
    if (prior) this.repository.run('UPDATE entertainment_auth_sessions SET revoked_at=? WHERE id=?', this.now(), prior.session.id)
    const token = randomToken(),
      now = this.now()
    this.repository.run(
      'INSERT INTO entertainment_auth_sessions VALUES(?,?,?,?,?,?,NULL,?)',
      randomUUID(),
      user.id,
      hashToken(token),
      now + 7 * 86400000,
      now,
      now,
      now,
    )
    this.repository.run('UPDATE entertainment_users SET last_login_at=? WHERE id=?', new Date(now).toISOString(), user.id)
    this.repository.audit(user.id, 'signed_in', now)
    this.setCookie(response, this.name, token, 7 * 86400)
    return this.repository.publicUser(this.repository.user(user.id)!)
  }
  clear(response: Response) {
    this.setCookie(response, this.name, '', 0)
  }
  revoke(request: Request, response: Response) {
    const current = this.read(request)
    if (current) {
      this.repository.run('UPDATE entertainment_auth_sessions SET revoked_at=? WHERE id=?', this.now(), current.session.id)
      this.repository.audit(current.user.id, 'signed_out', this.now())
    }
    this.clear(response)
  }
  sign(value: string) {
    return createHmac('sha256', this.config.secret).update(value).digest('base64url')
  }
  rotateCsrf(response: Response): string {
    const token = randomToken()
    this.setCookie(response, this.csrfName, token + '.' + this.sign(token), 7 * 86400)
    return token
  }
  csrf(request: Request, response: Response): string {
    const signed = cookie(request, this.csrfName)
    if (signed) {
      const [token, mac] = signed.split('.')
      if (token && mac && equal(mac, this.sign(token))) return token
    }
    return this.rotateCsrf(response)
  }
  checkOrigin(request: Request) {
    const origin = request.get('origin')
    if (!origin || origin !== this.config.origin || request.get('sec-fetch-site') === 'cross-site')
      throw new AuthError(
        403,
        'AUTH_CSRF_REJECTED',
        !this.config.production && origin && origin !== this.config.origin
          ? 'Open the app at ' + this.config.origin + ' and try again. Cookies and sign-in only work on that exact address.'
          : 'Refresh the page and try again.',
      )
  }
  checkCsrf(request: Request) {
    this.checkOrigin(request)
    const signed = cookie(request, this.csrfName),
      header = request.get('x-csrf-token')
    if (!signed || !header || !/^[A-Za-z0-9_-]{43}$/.test(header))
      throw new AuthError(403, 'AUTH_CSRF_REJECTED', 'Refresh the page and try again.')
    const [token, mac] = signed.split('.')
    if (!token || !mac || !equal(mac, this.sign(token)) || !equal(token, header))
      throw new AuthError(403, 'AUTH_CSRF_REJECTED', 'Refresh the page and try again.')
  }
}
