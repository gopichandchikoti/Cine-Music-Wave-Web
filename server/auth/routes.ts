import { Router, type Request, type Response, type NextFunction } from 'express'
import { createHash } from 'node:crypto'
import { AuthRepository } from './repository.js'
import { Sessions, cookie, hashToken, randomToken } from './sessions.js'
import { AuthService } from './service.js'
import { AuthRateLimit } from './rate-limit.js'
import { emailDelivery, type EmailDelivery } from './email.js'
import { authorizationUrl, exchangeIdentity, type OAuthAttempt } from './providers.js'
import { providerName, type AuthConfig } from './config.js'
import { AuthError, type ProviderIdentity, type UserRow, type SessionRow } from './types.js'
import { validateAvatar } from './avatar.js'
import * as v from './validation.js'
type Context = { user: UserRow; session: SessionRow }
export function createAuthSystem(
  config: AuthConfig,
  filename: string,
  options: {
    now?: () => number
    deliver?: EmailDelivery
    exchange?: (
      config: NonNullable<AuthConfig['providers']['google']>,
      attempt: OAuthAttempt,
      code: string,
    ) => Promise<ProviderIdentity>
  } = {},
) {
  const now = options.now ?? (() => Date.now()),
    repository = new AuthRepository(filename),
    sessions = new Sessions(repository, config, now),
    service = new AuthService(repository, options.deliver ?? emailDelivery(config), now),
    rates = new AuthRateLimit(now),
    attempts = new Map<string, OAuthAttempt>()
  const publicRouter = Router(),
    protectedRouter = Router()
  const attemptLimit = new AuthRateLimit(now, 5, 60000)
  const context = (request: Request): Context => {
    const current = sessions.read(request)
    if (!current) throw new AuthError(401, 'AUTH_REQUIRED', 'Sign in to access Cine Music Wave.')
    return current
  }
  const limiter = (request: Request, kind = 'auth') =>
    rates.check(kind + ':' + (request.ip ?? request.socket.remoteAddress ?? 'unknown'))
  const write = (request: Request) => {
    limiter(request)
    sessions.checkCsrf(request)
    if (!request.is('application/json')) throw new AuthError(415, 'AUTH_CONTENT_TYPE', 'Send account data as JSON.')
  }
  const protect = (request: Request, response: Response, next: NextFunction) => {
    try {
      const current = context(request)
      response.locals.authUserId = current.user.id
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        sessions.checkCsrf(request)
        if (!request.path.startsWith('/profile') && !request.path.startsWith('/settings')) service.requireVerified(current.user)
      }
      next()
    } catch (error) {
      next(error)
    }
  }
  const fail = (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const safe =
      error instanceof AuthError ? error : new AuthError(500, 'AUTH_INTERNAL', 'The account request could not be completed.')
    if (safe.status === 429) response.setHeader('Retry-After', '60')
    response.status(safe.status).json({ code: safe.code, message: safe.message, requestId: randomToken().slice(0, 16) })
  }
  const safeHeaders = (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  }
  publicRouter.use(safeHeaders)
  protectedRouter.use(safeHeaders, protect)
  publicRouter.get('/config', (request, response) =>
    response.json({
      mode: config.mode,
      providers: (['google', 'microsoft', 'facebook'] as const).map((provider) => ({
        provider,
        enabled: Boolean(config.providers[provider]),
      })),
      development: !config.production,
      emailDelivery: Boolean(service.deliver),
      signupEnabled: config.signupEnabled,
      csrfToken: sessions.csrf(request, response),
    }),
  )
  publicRouter.get('/session', (request, response) => {
    const current = sessions.read(request)
    response.json({
      authenticated: Boolean(current),
      required: true,
      user: current ? repository.publicUser(current.user) : null,
      csrfToken: sessions.csrf(request, response),
      mode: 'accounts',
    })
  })
  publicRouter.post('/signup', async (request, response) => {
    write(request)
    attemptLimit.check('signup:' + request.ip)
    if (!config.signupEnabled) throw new AuthError(403, 'AUTH_SIGNUP_DISABLED', 'New account registration is closed.')
    const result = await service.signup(request.body)
    const user = sessions.create(request, response, result.user)
    response.status(201).json({
      authenticated: true,
      required: true,
      user,
      mode: 'accounts',
      csrfToken: sessions.rotateCsrf(response),
      verification: result.verification,
    })
  })
  publicRouter.post('/login', async (request, response) => {
    write(request)
    const user = await service.login(request.body)
    response.json({
      authenticated: true,
      required: true,
      user: sessions.create(request, response, user),
      mode: 'accounts',
      csrfToken: sessions.rotateCsrf(response),
    })
  })
  publicRouter.post('/logout', (request, response) => {
    write(request)
    sessions.revoke(request, response)
    response.json({
      authenticated: false,
      required: true,
      user: null,
      mode: 'accounts',
      csrfToken: sessions.rotateCsrf(response),
    })
  })
  publicRouter.post('/logout-all', (request, response) => {
    write(request)
    const current = context(request)
    repository.revokeAll(current.user.id, now())
    repository.audit(current.user.id, 'signed_out_all', now())
    sessions.clear(response)
    response.json({
      authenticated: false,
      required: true,
      user: null,
      mode: 'accounts',
      csrfToken: sessions.rotateCsrf(response),
    })
  })
  publicRouter.post('/verify-email', (request, response) => {
    write(request)
    service.verify(request.body)
    response.json({ message: 'Email verified. You can return to the library.' })
  })
  publicRouter.post('/resend-verification', async (request, response) => {
    write(request)
    attemptLimit.check('verify:' + request.ip)
    const current = context(request)
    if (!current.user.email_verified_at) await service.sendToken(current.user, 'email_verify')
    response.json({ message: 'If verification is needed, an email will be sent.' })
  })
  publicRouter.post('/forgot-password', async (request, response) => {
    write(request)
    attemptLimit.check('forgot:' + request.ip)
    response.json(await service.forgot(request.body))
  })
  publicRouter.post('/reset-password', async (request, response) => {
    write(request)
    attemptLimit.check('reset:' + request.ip)
    await service.reset(request.body)
    sessions.clear(response)
    response.json({ message: 'Password updated. Sign in with your new password.', csrfToken: sessions.rotateCsrf(response) })
  })
  publicRouter.all('/oauth/:provider/start', (request, response) => {
    if (!['GET', 'POST'].includes(request.method)) throw new AuthError(405, 'AUTH_METHOD', 'This method is unavailable.')
    limiter(request, 'oauth')
    sessions.checkCsrf(request)
    const provider = providerName(String(request.params.provider)),
      providerConfig = config.providers[provider]
    if (!providerConfig) throw new AuthError(503, 'AUTH_PROVIDER_UNAVAILABLE', 'This provider is not configured.')
    for (const [id, attempt] of attempts) if (attempt.expiresAt <= now()) attempts.delete(id)
    if (attempts.size >= 1000) throw new AuthError(503, 'AUTH_BUSY', 'Provider sign-in is busy. Try again shortly.')
    let linkUserId: string | null = null
    if (request.query.action === 'link') {
      const current = context(request)
      service.requireVerified(current.user)
      if (now() - current.session.reauthenticated_at > 5 * 60000)
        throw new AuthError(401, 'AUTH_REAUTH_REQUIRED', 'Sign in again before linking a provider.')
      linkUserId = current.user.id
    } else if (request.query.action !== undefined) throw v.invalid()
    const state = randomToken(),
      nonce = randomToken(),
      verifier = randomToken(),
      binding = randomToken()
    const attempt: OAuthAttempt = {
      state,
      nonce,
      verifier,
      bindingHash: hashToken(binding),
      expiresAt: now() + 5 * 60000,
      provider,
      linkUserId,
    }
    attempts.set(hashToken(state), attempt)
    sessions.setCookie(response, sessions.oauthName, binding, 300)
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    response.json({ url: authorizationUrl(providerConfig, attempt, challenge) })
  })
  publicRouter.get('/oauth/:provider/callback', async (request, response) => {
    response.setHeader('Referrer-Policy', 'no-referrer')
    try {
      limiter(request, 'oauth-callback')
      const provider = providerName(String(request.params.provider)),
        providerConfig = config.providers[provider],
        state = typeof request.query.state === 'string' ? request.query.state : ''
      if (!providerConfig || !/^[A-Za-z0-9_-]{43}$/.test(state))
        throw new AuthError(401, 'AUTH_PROVIDER_REJECTED', 'Provider sign-in could not be verified.')
      const attempt = attempts.get(hashToken(state))
      attempts.delete(hashToken(state))
      const binding = cookie(request, sessions.oauthName)
      sessions.setCookie(response, sessions.oauthName, '', 0)
      if (
        !attempt ||
        attempt.provider !== provider ||
        attempt.expiresAt <= now() ||
        !binding ||
        hashToken(binding) !== attempt.bindingHash ||
        request.query.error ||
        typeof request.query.code !== 'string' ||
        request.query.code.length > 2048 ||
        !request.query.code
      )
        throw new AuthError(401, 'AUTH_PROVIDER_REJECTED', 'Provider sign-in could not be verified.')
      if (attempt.linkUserId) {
        const current = context(request)
        if (current.user.id !== attempt.linkUserId || now() - current.session.reauthenticated_at > 5 * 60000)
          throw new AuthError(401, 'AUTH_REAUTH_REQUIRED', 'Sign in again to link this provider.')
      }
      const identity = await (options.exchange ?? exchangeIdentity)(providerConfig, attempt, request.query.code)
      if (identity.provider !== provider)
        throw new AuthError(401, 'AUTH_PROVIDER_REJECTED', 'Provider sign-in could not be verified.')
      const user = service.identity(identity, attempt.linkUserId)
      sessions.create(request, response, user)
      sessions.rotateCsrf(response)
      response.redirect(303, config.origin + '/')
    } catch (error) {
      const code = error instanceof AuthError && error.code === 'AUTH_LINK_REQUIRED' ? 'link-required' : 'provider-failed'
      response.redirect(303, config.origin + '/#auth-error=' + code)
    }
  })
  publicRouter.use(fail)
  protectedRouter.get('/profile', (request, response) => response.json(repository.publicUser(context(request).user)))
  protectedRouter.patch('/profile', (request, response) => {
    write(request)
    response.json(service.updateProfile(context(request).user, request.body))
  })
  protectedRouter.post('/profile/password', async (request, response) => {
    write(request)
    const current = context(request)
    await service.changePassword(current.user, current.session.reauthenticated_at, request.body, current.session.id)
    sessions.clear(response)
    response.json({ message: 'Password changed. Sign in again.', csrfToken: sessions.rotateCsrf(response) })
  })
  protectedRouter.get('/profile/providers', (request, response) =>
    response.json({ providers: repository.publicUser(context(request).user).providers }),
  )
  protectedRouter.delete('/profile/providers/:provider', async (request, response) => {
    write(request)
    const current = context(request)
    await service.reauthenticate(current.user, current.session.reauthenticated_at, request.body)
    context(request)
    service.unlink(current.user, providerName(String(request.params.provider)))
    sessions.clear(response)
    response.json({ message: 'Provider removed. Sign in again.', csrfToken: sessions.rotateCsrf(response) })
  })
  protectedRouter.post('/profile/avatar', (request, response) => {
    write(request)
    const body = v.object(request.body)
    if (typeof body.data !== 'string' || body.data.length > 700000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data))
      throw new AuthError(413, 'AVATAR_TOO_LARGE', 'Choose a PNG no larger than 512 KB.')
    const image = validateAvatar(Buffer.from(body.data, 'base64'), typeof body.mimeType === 'string' ? body.mimeType : '')
    const { user } = context(request)
    repository.run(
      'UPDATE entertainment_users SET avatar_blob=?,updated_at=? WHERE id=?',
      image,
      new Date(now()).toISOString(),
      user.id,
    )
    repository.audit(user.id, 'avatar_updated', now())
    response.json(repository.publicUser(repository.user(user.id)!))
  })
  protectedRouter.get('/profile/avatar', (request, response) => {
    const user = context(request).user
    if (!user.avatar_blob) throw new AuthError(404, 'AVATAR_NOT_FOUND', 'No avatar is saved.')
    response.type('image/png').setHeader('Content-Disposition', 'inline; filename="avatar.png"')
    response.send(Buffer.from(user.avatar_blob))
  })
  protectedRouter.delete('/profile/avatar', (request, response) => {
    write(request)
    const user = context(request).user
    repository.run(
      'UPDATE entertainment_users SET avatar_blob=NULL,updated_at=? WHERE id=?',
      new Date(now()).toISOString(),
      user.id,
    )
    response.json(repository.publicUser(repository.user(user.id)!))
  })
  protectedRouter.get('/settings', (request, response) => {
    const current = context(request)
    response.json({
      ...repository.one<{ theme: string; reading_scale: string }>(
        'SELECT theme,reading_scale FROM entertainment_auth_settings WHERE user_id=?',
        current.user.id,
      ),
      sessions: repository.sessions(current.user.id, now()).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        expiresAt: row.expires_at,
        current: row.id === current.session.id,
      })),
      emailDelivery: Boolean(service.deliver),
    })
  })
  protectedRouter.patch('/settings', (request, response) => {
    write(request)
    const body = v.object(request.body),
      theme = body.theme,
      scale = body.readingScale
    if (!['light', 'dark'].includes(String(theme)) || !['standard', 'large'].includes(String(scale))) throw v.invalid()
    repository.run(
      'UPDATE entertainment_auth_settings SET theme=?,reading_scale=? WHERE user_id=?',
      String(theme),
      String(scale),
      context(request).user.id,
    )
    response.json({ theme, readingScale: scale })
  })
  protectedRouter.post('/account/export', async (request, response) => {
    write(request)
    const current = context(request)
    service.requireVerified(current.user)
    await service.reauthenticate(current.user, current.session.reauthenticated_at, request.body)
    if (v.object(request.body).confirmation !== current.user.username) throw v.invalid('Type your username to confirm.')
    repository.audit(current.user.id, 'account_exported', now())
    response.json({
      profile: repository.publicUser(current.user),
      settings: repository.one('SELECT theme,reading_scale FROM entertainment_auth_settings WHERE user_id=?', current.user.id),
      identities: repository.all(
        'SELECT provider,created_at FROM entertainment_auth_identities WHERE user_id=?',
        current.user.id,
      ),
      audit: repository.all(
        'SELECT event,created_at FROM entertainment_auth_audit WHERE user_id=? ORDER BY created_at',
        current.user.id,
      ),
      watchProgress: repository.all('SELECT * FROM entertainment_watch_progress WHERE user_id=?', current.user.id),
      watchList: repository.all('SELECT * FROM entertainment_watch_list WHERE user_id=?', current.user.id),
      musicLikes: repository.all('SELECT * FROM entertainment_music_likes WHERE user_id=?', current.user.id),
      musicPlaylists: repository.all('SELECT * FROM entertainment_music_playlists WHERE user_id=?', current.user.id),
      musicPlaylistTracks: repository.all(
        'SELECT t.* FROM entertainment_music_playlist_tracks t JOIN entertainment_music_playlists p ON p.id=t.playlist_id WHERE p.user_id=?',
        current.user.id,
      ),
      musicPlays: repository.all('SELECT * FROM entertainment_music_plays WHERE user_id=?', current.user.id),
      musicRadios: repository.all('SELECT * FROM entertainment_music_radios WHERE user_id=?', current.user.id),
      note: 'Cine Music Wave account and saved entertainment data.',
    })
  })
  protectedRouter.delete('/account', async (request, response) => {
    write(request)
    const current = context(request)
    service.requireVerified(current.user)
    await service.reauthenticate(current.user, current.session.reauthenticated_at, request.body)
    if (v.object(request.body).confirmation !== current.user.username) throw v.invalid('Type your username to confirm.')
    repository.transaction(() => {
      repository.audit(current.user.id, 'account_deleted', now())
      repository.run('DELETE FROM entertainment_users WHERE id=?', current.user.id)
    })
    sessions.clear(response)
    response.json({ message: 'Account deleted.', csrfToken: sessions.rotateCsrf(response) })
  })
  protectedRouter.use(fail)
  const guard = (request: Request, response: Response, next: NextFunction) =>
    protect(request, response, (error?: unknown) => (error ? fail(error, request, response, next) : next()))
  const timer = setInterval(() => repository.cleanup(now()), 3600000)
  timer.unref()
  return {
    publicRouter,
    protectedRouter,
    guard,
    repository,
    sessions,
    service,
    close() {
      clearInterval(timer)
      repository.close()
    },
  }
}
