import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { PNG } from 'pngjs'
import { generateKeyPair, SignJWT } from 'jose'
import { createAuthSystem } from '../../server/auth/routes.js'
import { loadAuthConfig } from '../../server/auth/config.js'
import { hashPassword, verifyPassword } from '../../server/auth/password.js'
import { hashToken } from '../../server/auth/sessions.js'
import { AuthRateLimit } from '../../server/auth/rate-limit.js'
import { AuthError } from '../../server/auth/types.js'
import { validateAvatar } from '../../server/auth/avatar.js'
import { verifyOidcToken, authorizationUrl, exchangeIdentity, fetchProviderJson } from '../../server/auth/providers.js'
import { isPublicLibraryPath, isContained } from '../../server/auth/file-policy.js'
const origin = 'http://localhost:4040'
const signup = {
  email: 'learner@example.test',
  username: 'learner_one',
  firstName: 'Asha',
  lastName: 'Rao',
  password: 'A unique long test passphrase!',
  confirmPassword: 'A unique long test passphrase!',
}
async function fixture(options: { email?: boolean; providers?: boolean; now?: () => number } = {}) {
  const delivered: { to: string; purpose: string; token: string }[] = []
  const config = loadAuthConfig({
    AUTH_PUBLIC_ORIGIN: origin,
    ...(options.providers
      ? {
          GOOGLE_LOGIN_ENABLED: 'true',
          GOOGLE_CLIENT_ID: 'test-client',
          GOOGLE_CLIENT_SECRET: 'test-only-secret',
          GOOGLE_REDIRECT_URI: origin + '/api/auth/oauth/google/callback',
        }
      : {}),
  })
  const system = createAuthSystem(config, ':memory:', {
    now: options.now,
    deliver: options.email
      ? async (to, purpose, token) => {
          delivered.push({ to, purpose, token })
        }
      : undefined,
    exchange: async (_config, attempt, code) => {
      if (code === 'bad-code') throw new AuthError(401, 'AUTH_PROVIDER_REJECTED', 'Not verified.')
      return {
        provider: 'google',
        subject: code,
        email: code === 'existing-email' ? signup.email : code + '@example.test',
        emailVerified: true,
        firstName: 'Provider',
        lastName: 'Learner',
      }
    },
  })
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/auth', system.publicRouter)
  app.use('/api', system.guard)
  app.use('/api', system.protectedRouter)
  app.get('/api/library', (_req, res) => res.json({ ok: true }))
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
    }),
    address = server.address()
  if (!address || typeof address === 'string') throw Error()
  const base = 'http://127.0.0.1:' + address.port
  function client() {
    const jar = new Map<string, string>()
    let csrf = ''
    return {
      jar,
      async request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
        const response = await fetch(base + '/api' + path, {
          method,
          redirect: 'manual',
          headers: {
            origin,
            cookie: Array.from(jar)
              .map(([key, value]) => key + '=' + value)
              .join('; '),
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...headers,
          },
          ...(body !== undefined && method !== 'GET' && method !== 'HEAD' ? { body: JSON.stringify(body) } : {}),
        })
        for (const raw of response.headers.getSetCookie()) {
          const [key, value] = raw.split(';')[0].split('=')
          if (value) jar.set(key, value)
          else jar.delete(key)
        }
        const text = await response.text()
        let json: any = null
        try {
          json = JSON.parse(text)
        } catch {}
        if (json?.csrfToken) csrf = json.csrfToken
        return { status: response.status, body: json, text, headers: response.headers }
      },
    }
  }
  return {
    system,
    delivered,
    client,
    async close() {
      system.close()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}
test('password hashing uses unique salt, encoded parameters, 256-bit derived hash; wrong and unknown passwords fail', async () => {
  const first = await hashPassword(signup.password),
    second = await hashPassword(signup.password)
  assert.notEqual(first, second)
  assert.match(first, /^scrypt\$131072\$8\$1\$/)
  assert.equal(Buffer.from(first.split('$')[5], 'base64url').length, 32)
  assert.ok(await verifyPassword(signup.password, first))
  assert.equal(await verifyPassword('wrong password', first), false)
  assert.equal(await verifyPassword(signup.password, null), false)
  assert.equal(await verifyPassword(signup.password, 'scrypt$1$8$1$bad$bad'), false)
})
test('signup, normalization, private DB/session storage, generic login, rotation, and logout', async () => {
  const f = await fixture()
  try {
    const client = f.client()
    await client.request('/auth/session')
    assert.equal((await client.request('/library')).status, 401)
    const created = await client.request('/auth/signup', 'POST', {
      ...signup,
      email: 'Learner@Example.Test',
      username: 'LEARNER_ONE',
    })
    assert.equal(created.status, 201)
    assert.equal(created.body.user.email, signup.email)
    assert.equal(created.body.verification, 'offline')
    assert.equal(created.body.user.emailVerified, false)
    assert.equal(created.body.user.password_hash, undefined)
    const row = f.system.repository.byLogin(signup.email)!
    assert.ok(row.password_hash?.startsWith('scrypt$'))
    assert.ok(!row.password_hash?.includes(signup.password))
    const raw = client.jar.get('cine_music_wave_account')!
    assert.ok(created.headers.getSetCookie().some((value) => value.includes('HttpOnly') && value.includes('SameSite=Lax')))
    assert.equal(
      f.system.repository.one<{ token_hash: string }>(
        'SELECT token_hash FROM entertainment_auth_sessions WHERE revoked_at IS NULL',
      )?.token_hash,
      hashToken(raw),
    )
    assert.equal(
      (await client.request('/auth/login', 'POST', { identifier: signup.email, password: 'incorrect' })).body.message,
      (await client.request('/auth/login', 'POST', { identifier: 'absent@example.test', password: 'incorrect' })).body.message,
    )
    const duplicate = await client.request('/auth/signup', 'POST', signup)
    assert.equal(duplicate.status, 409)
    const login = await client.request('/auth/login', 'POST', { identifier: signup.username, password: signup.password })
    assert.equal(login.status, 200)
    assert.notEqual(client.jar.get('cine_music_wave_account'), raw)
    const old = f.client()
    old.jar.set('cine_music_wave_account', raw)
    assert.equal((await old.request('/profile')).status, 401)
    assert.equal((await client.request('/library')).status, 200)
    assert.equal((await client.request('/auth/logout', 'POST', {})).status, 200)
    assert.equal((await client.request('/library')).status, 401)
  } finally {
    await f.close()
  }
})
test('CSRF rejects missing token, wrong origin, mismatched cookie, and unsupported content type', async () => {
  const f = await fixture()
  try {
    const client = f.client()
    await client.request('/auth/session')
    assert.equal((await client.request('/auth/signup', 'POST', signup, { 'x-csrf-token': '' })).status, 403)
    assert.equal((await client.request('/auth/signup', 'POST', signup, { origin: 'https://attacker.invalid' })).status, 403)
    assert.equal((await client.request('/auth/signup', 'POST', signup, { 'x-csrf-token': 'a'.repeat(43) })).status, 403)
    assert.equal((await client.request('/auth/signup', 'POST', signup, { 'content-type': 'text/plain' })).status, 415)
    assert.equal(f.system.repository.all('SELECT id FROM entertainment_users').length, 0)
  } finally {
    await f.close()
  }
})
test('wrong-origin rejection tells a developer which address to open, but not in production', async () => {
  const f = await fixture()
  try {
    const client = f.client()
    await client.request('/auth/session')
    const wrong = await client.request('/auth/signup', 'POST', signup, { origin: 'http://127.0.0.1:4040' })
    assert.equal(wrong.status, 403)
    assert.equal(wrong.body.code, 'AUTH_CSRF_REJECTED')
    assert.ok(wrong.body.message.startsWith('Open the app at http://localhost:4040'))
    const missing = await client.request('/auth/signup', 'POST', signup, { origin: '' })
    assert.equal(missing.status, 403)
    assert.equal(missing.body.message, 'Refresh the page and try again.')
    assert.equal(f.system.repository.all('SELECT id FROM entertainment_users').length, 0)
  } finally {
    await f.close()
  }
  const production = createAuthSystem(
    loadAuthConfig({
      NODE_ENV: 'production',
      AUTH_PUBLIC_ORIGIN: 'https://library.example.test',
      AUTH_SESSION_SECRET: 's'.repeat(40),
      AUTH_ALLOW_PERSISTENT_SQLITE: 'true',
    }),
    ':memory:',
  )
  try {
    assert.throws(
      () =>
        production.sessions.checkOrigin({
          get: (name: string) => (name === 'origin' ? 'https://attacker.invalid' : undefined),
        } as never),
      (error: unknown) => error instanceof AuthError && error.message === 'Refresh the page and try again.',
    )
  } finally {
    production.close()
  }
})
test('media paths resolve inside a folder or a whole-drive root and never outside it', async () => {
  const { resolveWithinRoot } = await import('../../server/auth/file-policy.js'),
    path = (await import('node:path')).default
  for (const root of [path.resolve(process.cwd(), 'tests'), path.parse(process.cwd()).root]) {
    assert.equal(resolveWithinRoot(root, 'movies/a b [x].mkv'), path.join(root, 'movies', 'a b [x].mkv'))
    assert.equal(resolveWithinRoot(root, ''), root)
  }
  const folder = path.resolve(process.cwd(), 'tests')
  assert.equal(resolveWithinRoot(folder, '..' + path.sep + 'package.json'), null)
  assert.equal(resolveWithinRoot(folder, path.resolve(process.cwd(), 'package.json')), null)
  assert.equal(resolveWithinRoot(folder, '..'), null)
  if (path.sep === '\\') {
    assert.equal(resolveWithinRoot('G:\\', 'C:\\Windows\\win.ini'), null)
    assert.equal(resolveWithinRoot('G:\\', 'Telegram movies/x.mkv'), 'G:\\Telegram movies\\x.mkv')
  }
})
test('profile validation, safe avatar, username conflicts, preferences and current-password checks', async () => {
  const f = await fixture()
  try {
    const client = f.client()
    await client.request('/auth/session')
    const created = await client.request('/auth/signup', 'POST', signup),
      id = created.body.user.id
    f.system.repository.createUser({
      email: 'second@example.test',
      username: 'taken_name',
      firstName: 'Second',
      lastName: 'User',
      passwordHash: null,
      verified: false,
    })
    assert.equal(
      (
        await client.request('/profile', 'PATCH', {
          firstName: 'Asha',
          lastName: 'Rao',
          username: 'taken_name',
          phoneNumber: null,
          userId: 'other',
        })
      ).status,
      409,
    )
    const saved = await client.request('/profile', 'PATCH', {
      firstName: 'Ash',
      lastName: 'Rao',
      username: 'new_name',
      phoneNumber: '+14155552671',
      userId: 'other',
    })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.id, id)
    assert.equal(saved.body.firstName, 'Ash')
    assert.equal(
      (await client.request('/profile', 'PATCH', { firstName: '<script>', lastName: 'Rao', username: 'new_name' })).status,
      400,
    )
    const png = PNG.sync.write({ width: 16, height: 16, data: Buffer.alloc(16 * 16 * 4, 255) })
    const avatar = await client.request('/profile/avatar', 'POST', {
      data: png.toString('base64'),
      mimeType: 'image/png',
      filename: '../../secret.png',
    })
    assert.equal(avatar.status, 200)
    assert.ok(avatar.body.avatarUrl)
    assert.equal((await client.request('/profile/avatar')).status, 200)
    assert.equal(
      (
        await client.request('/profile/avatar', 'POST', {
          data: Buffer.from('<svg/>').toString('base64'),
          mimeType: 'image/svg+xml',
        })
      ).status,
      415,
    )
    assert.equal((await client.request('/settings', 'PATCH', { theme: 'light', readingScale: 'large' })).status, 200)
    assert.equal((await client.request('/settings')).body.theme, 'light')
    assert.equal(
      (
        await client.request('/profile/password', 'POST', {
          currentPassword: 'wrong',
          password: 'Another unique long password!',
          confirmPassword: 'Another unique long password!',
        })
      ).status,
      401,
    )
    assert.equal(
      (await client.request('/account/export', 'POST', { currentPassword: signup.password, confirmation: 'incorrect' })).status,
      400,
    )
    const exported = await client.request('/account/export', 'POST', {
      currentPassword: signup.password,
      confirmation: 'new_name',
    })
    assert.equal(exported.status, 200)
    assert.ok(!exported.text.includes('password_hash'))
    assert.ok(!exported.text.includes('token_hash'))
    assert.equal(
      (
        await client.request('/profile/password', 'POST', {
          currentPassword: signup.password,
          password: 'Another unique long password!',
          confirmPassword: 'Another unique long password!',
        })
      ).status,
      200,
    )
    assert.equal((await client.request('/profile')).status, 401)
  } finally {
    await f.close()
  }
})
test('verification/reset tokens are hashed, expire, are single-use; reset revokes all sessions', async () => {
  let clock = Date.now()
  const f = await fixture({ email: true, now: () => clock })
  try {
    const client = f.client()
    await client.request('/auth/session')
    await client.request('/auth/signup', 'POST', signup)
    const verify = f.delivered[0].token
    assert.equal(
      f.system.repository.one<{ token_hash: string }>('SELECT token_hash FROM entertainment_auth_tokens')?.token_hash,
      hashToken(verify),
    )
    assert.equal(
      (await client.request('/account/export', 'POST', { currentPassword: signup.password, confirmation: signup.username }))
        .status,
      403,
    )
    assert.equal((await client.request('/auth/verify-email', 'POST', { token: verify })).status, 200)
    assert.equal((await client.request('/auth/verify-email', 'POST', { token: verify })).status, 400)
    const unknown = await client.request('/auth/forgot-password', 'POST', { email: 'unknown@example.test' }),
      known = await client.request('/auth/forgot-password', 'POST', { email: signup.email })
    assert.deepEqual(unknown.body, known.body)
    const reset = f.delivered.at(-1)!.token
    const second = f.client()
    await second.request('/auth/session')
    await second.request('/auth/login', 'POST', { identifier: signup.email, password: signup.password })
    assert.equal(
      (
        await client.request('/auth/reset-password', 'POST', {
          token: reset,
          password: 'Fresh unique long passphrase!',
          confirmPassword: 'Fresh unique long passphrase!',
        })
      ).status,
      200,
    )
    assert.equal((await second.request('/profile')).status, 401)
    assert.equal(
      (
        await client.request('/auth/reset-password', 'POST', {
          token: reset,
          password: 'Fresh unique long passphrase!',
          confirmPassword: 'Fresh unique long passphrase!',
        })
      ).status,
      400,
    )
    await client.request('/auth/login', 'POST', { identifier: signup.email, password: 'Fresh unique long passphrase!' })
    await client.request('/auth/forgot-password', 'POST', { email: signup.email })
    const expired = f.delivered.at(-1)!.token
    clock += 31 * 60000
    assert.equal(
      (
        await client.request('/auth/reset-password', 'POST', {
          token: expired,
          password: 'Fresh unique long passphrase!',
          confirmPassword: 'Fresh unique long passphrase!',
        })
      ).status,
      400,
    )
  } finally {
    await f.close()
  }
})
test('email outage/offline is honest and never returns reset tokens', async () => {
  const f = await fixture()
  try {
    const client = f.client()
    await client.request('/auth/session')
    const response = await client.request('/auth/forgot-password', 'POST', { email: signup.email })
    assert.equal(response.status, 503)
    assert.equal(response.body.token, undefined)
  } finally {
    await f.close()
  }
})
test('logout-all, disabled entertainment_users, idle/absolute expiry, and deletion cascade', async () => {
  let clock = Date.now()
  const f = await fixture({ now: () => clock })
  try {
    const client = f.client()
    await client.request('/auth/session')
    const created = await client.request('/auth/signup', 'POST', signup),
      id = created.body.user.id
    const second = f.client()
    await second.request('/auth/session')
    await second.request('/auth/login', 'POST', { identifier: signup.email, password: signup.password })
    await client.request('/auth/logout-all', 'POST', {})
    assert.equal((await second.request('/profile')).status, 401)
    await client.request('/auth/login', 'POST', { identifier: signup.email, password: signup.password })
    clock += 12 * 3600000 + 1
    assert.equal((await client.request('/profile')).status, 401)
    await client.request('/auth/login', 'POST', { identifier: signup.email, password: signup.password })
    clock += 7 * 86400000 + 1
    assert.equal((await client.request('/profile')).status, 401)
    f.system.repository.run('UPDATE entertainment_users SET disabled_at=? WHERE id=?', 'disabled', id)
    assert.equal(
      (await client.request('/auth/login', 'POST', { identifier: signup.email, password: signup.password })).status,
      401,
    )
    f.system.repository.run('UPDATE entertainment_users SET disabled_at=NULL WHERE id=?', id)
    await client.request('/auth/login', 'POST', { identifier: signup.email, password: signup.password })
    assert.equal(
      (await client.request('/account', 'DELETE', { currentPassword: signup.password, confirmation: signup.username })).status,
      200,
    )
    assert.equal(f.system.repository.user(id), undefined)
    assert.equal(f.system.repository.all('SELECT id FROM entertainment_auth_sessions').length, 0)
  } finally {
    await f.close()
  }
})
test('OAuth browser binding, single-use state, denial, existing subject and explicit linking', async () => {
  const f = await fixture({ providers: true })
  try {
    const client = f.client()
    await client.request('/auth/session')
    const begin = await client.request('/auth/oauth/google/start', 'POST', {})
    assert.equal(begin.status, 200)
    const auth = new URL(begin.body.url),
      state = auth.searchParams.get('state')!
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256')
    assert.ok(auth.searchParams.get('nonce'))
    assert.equal(auth.searchParams.get('redirect_uri'), origin + '/api/auth/oauth/google/callback')
    const other = f.client()
    const theft = await other.request('/auth/oauth/google/callback?state=' + state + '&code=provider-one')
    assert.equal(theft.headers.get('location'), origin + '/#auth-error=provider-failed')
    assert.equal(
      (await client.request('/auth/oauth/google/callback?state=' + state + '&code=provider-one')).headers.get('location'),
      origin + '/#auth-error=provider-failed',
    )
    const again = await client.request('/auth/oauth/google/start', 'POST', {}),
      state2 = new URL(again.body.url).searchParams.get('state')!
    const success = await client.request('/auth/oauth/google/callback?state=' + state2 + '&code=provider-one')
    assert.equal(success.headers.get('location'), origin + '/')
    const user = (await client.request('/auth/session')).body.user
    assert.deepEqual(user.providers, ['google'])
    assert.equal((await client.request('/profile/providers/google', 'DELETE', {})).status, 409)
    const existing = f.client()
    await existing.request('/auth/session')
    await existing.request('/auth/signup', 'POST', signup)
    const fresh = f.client()
    await fresh.request('/auth/session')
    const match = await fresh.request('/auth/oauth/google/start', 'POST', {})
    const matchState = new URL(match.body.url).searchParams.get('state')!
    assert.equal(
      (await fresh.request('/auth/oauth/google/callback?state=' + matchState + '&code=existing-email')).headers.get('location'),
      origin + '/#auth-error=link-required',
    )
    const linking = await existing.request('/auth/oauth/google/start?action=link', 'POST', {})
    const linkState = new URL(linking.body.url).searchParams.get('state')!
    assert.equal(
      (await existing.request('/auth/oauth/google/callback?state=' + linkState + '&code=existing-email')).headers.get('location'),
      origin + '/',
    )
    assert.deepEqual((await existing.request('/auth/session')).body.user.providers, ['password', 'google'])
    assert.equal(f.system.repository.all('SELECT id FROM entertainment_users').length, 2)
  } finally {
    await f.close()
  }
})
test('unconfigured provider, invalid redirect/tenant/production settings fail closed', () => {
  assert.deepEqual(loadAuthConfig({}).providers, {})
  assert.throws(() => loadAuthConfig({ NODE_ENV: 'production' }))
  assert.throws(() => loadAuthConfig({ AUTH_MODE: 'owner' }))
  assert.throws(() =>
    loadAuthConfig({
      GOOGLE_LOGIN_ENABLED: 'true',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'https://attacker.invalid/callback',
    }),
  )
  assert.throws(() =>
    loadAuthConfig({
      MICROSOFT_LOGIN_ENABLED: 'true',
      MICROSOFT_CLIENT_ID: 'id',
      MICROSOFT_CLIENT_SECRET: 'secret',
      MICROSOFT_REDIRECT_URI: origin + '/api/auth/oauth/microsoft/callback',
      MICROSOFT_TENANT_ID: 'common',
    }),
  )
  assert.equal(
    loadAuthConfig({
      NODE_ENV: 'production',
      AUTH_PUBLIC_ORIGIN: 'https://library.example.test',
      AUTH_SESSION_SECRET: 'x'.repeat(32),
      AUTH_ALLOW_PERSISTENT_SQLITE: 'true',
    }).signupEnabled,
    false,
  )
})
test('OIDC rejects invalid signature, nonce, audience, issuer, expiry, tenant and future issued-at', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256'),
    other = await generateKeyPair('RS256')
  const config = {
    provider: 'google' as const,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    redirectUri: origin + '/api/auth/oauth/google/callback',
  }
  const sign = (claims: Record<string, unknown>, key = privateKey) =>
    new SignJWT({ nonce: 'expected', ...claims })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience('test-client')
      .setSubject('subject')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key)
  const good = await sign({})
  assert.equal((await verifyOidcToken(config, good, 'expected', async () => publicKey)).sub, 'subject')
  await assert.rejects(() => verifyOidcToken(config, good, 'wrong', async () => publicKey))
  await assert.rejects(() => verifyOidcToken({ ...config, clientId: 'other' }, good, 'expected', async () => publicKey))
  await assert.rejects(() => verifyOidcToken(config, good, 'expected', async () => other.publicKey))
  const expired = await new SignJWT({ nonce: 'expected' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://accounts.google.com')
    .setAudience('test-client')
    .setSubject('subject')
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(privateKey)
  await assert.rejects(() => verifyOidcToken(config, expired, 'expected', async () => publicKey))
  const issuer = await new SignJWT({ nonce: 'expected' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://attacker.invalid')
    .setAudience('test-client')
    .setSubject('subject')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
  await assert.rejects(() => verifyOidcToken(config, issuer, 'expected', async () => publicKey))
  const attempt = {
    state: 'state',
    nonce: 'nonce',
    verifier: 'verifier',
    bindingHash: 'hash',
    expiresAt: 0,
    provider: 'google',
    linkUserId: null,
  }
  assert.equal(new URL(authorizationUrl(config, attempt, 'challenge')).origin, 'https://accounts.google.com')
})
test('rate-limit memory is bounded and retries only after expiry; avatar bombs and private paths rejected', () => {
  let now = 0
  const rates = new AuthRateLimit(() => now, 2, 1000, 1)
  rates.check('ip')
  rates.check('ip')
  assert.throws(() => rates.check('ip'))
  assert.throws(() => rates.check('another'))
  now = 1001
  rates.check('another')
  assert.throws(() => validateAvatar(Buffer.alloc(512 * 1024 + 1), 'image/png'))
  assert.throws(() => validateAvatar(Buffer.from('<svg/>'), 'image/svg+xml'))
  const png = PNG.sync.write({ width: 16, height: 16, data: Buffer.alloc(16 * 16 * 4) })
  png.writeUInt32BE(1000000, 16)
  assert.throws(() => validateAvatar(png, 'image/png'))
  const ignored = new Set(['node_modules', 'Study-entertain-library'])
  for (const value of [
    '../secret.md',
    '.env',
    'folder/.env',
    'node_modules/x.md',
    'Study-entertain-library/data/config.json',
    'folder\\..\\secret.md',
  ])
    assert.equal(isPublicLibraryPath(value, ignored), false)
  assert.ok(isPublicLibraryPath('Java/01-welcome.md', ignored))
  assert.equal(isContained('E:\\library', 'E:\\private\\secret'), false)
})

test('Microsoft issuer/tenant and future-issued token checks', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256'),
    tenant = '9188040d-6c67-4c5b-b112-36a304b66dad'
  const config = {
    provider: 'microsoft' as const,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    redirectUri: origin + '/api/auth/oauth/microsoft/callback',
    tenant: 'consumers',
  }
  const sign = (tid: string, iat = Math.floor(Date.now() / 1000)) =>
    new SignJWT({ nonce: 'expected', tid })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://login.microsoftonline.com/' + tenant + '/v2.0')
      .setAudience('test-client')
      .setSubject('subject')
      .setIssuedAt(iat)
      .setExpirationTime('5m')
      .sign(privateKey)
  assert.equal((await verifyOidcToken(config, await sign(tenant), 'expected', async () => publicKey)).tid, tenant)
  const bad = await sign('other')
  await assert.rejects(() => verifyOidcToken(config, bad, 'expected', async () => publicKey))
  const future = await sign(tenant, Math.floor(Date.now() / 1000) + 60)
  await assert.rejects(() => verifyOidcToken(config, future, 'expected', async () => publicKey))
})

test('Facebook opaque-token verification binds application, subject, expiry and proof; responses are bounded', async () => {
  const old = globalThis.fetch,
    config = {
      provider: 'facebook' as const,
      clientId: 'test-app',
      clientSecret: 'test-secret',
      redirectUri: origin + '/api/auth/oauth/facebook/callback',
      version: 'v25.0',
    },
    attempt = {
      state: 'state',
      nonce: 'nonce',
      verifier: 'verifier',
      bindingHash: 'hash',
      expiresAt: Date.now() + 1000,
      provider: 'facebook',
      linkUserId: null,
    }
  let invalid = false,
    proof = false
  globalThis.fetch = async (input, options) => {
    const url = String(input)
    if (url.includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'provider-test-token' }))
    if (url.includes('/debug_token'))
      return new Response(
        JSON.stringify({
          data: {
            is_valid: true,
            type: 'USER',
            scopes: ['email', 'public_profile'],
            app_id: invalid ? 'other-app' : 'test-app',
            user_id: 'subject',
            expires_at: Math.floor(Date.now() / 1000) + 60,
            data_access_expires_at: Math.floor(Date.now() / 1000) + 60,
          },
        }),
      )
    proof =
      url.includes('appsecret_proof=') && new Headers(options?.headers).get('authorization') === 'Bearer provider-test-token'
    return new Response(JSON.stringify({ id: 'subject', email: 'facebook@example.test', first_name: 'Asha', last_name: 'Rao' }))
  }
  try {
    const identity = await exchangeIdentity(config, attempt, 'code')
    assert.equal(identity.subject, 'subject')
    assert.equal(identity.emailVerified, false)
    assert.equal(proof, true)
    invalid = true
    await assert.rejects(() => exchangeIdentity(config, attempt, 'code'))
    globalThis.fetch = async () => new Response('x'.repeat(65537))
    await assert.rejects(() => fetchProviderJson('https://provider.example.test'))
  } finally {
    globalThis.fetch = old
  }
})

test('active document policy prevents script and form execution', async () => {
  const { contentSecurityPolicy, activeDocumentPolicy, isActiveDocument } = await import('../../server/auth/security-headers.js')
  assert.ok(activeDocumentPolicy.includes('sandbox'))
  assert.ok(!activeDocumentPolicy.includes('allow-scripts'))
  assert.ok(activeDocumentPolicy.includes("form-action 'none'"))
  assert.equal(isActiveDocument('chapter.svg'), true)
  assert.equal(isActiveDocument('chapter.png'), false)
  assert.ok(contentSecurityPolicy(true).includes("base-uri 'none'"))
  assert.ok(!contentSecurityPolicy(true).includes('unsafe-eval'))
})

test('failed login delay is temporary and successful login clears the delay history', async () => {
  let clock = Date.now()
  const f = await fixture({ now: () => clock })
  try {
    await f.system.service.signup(signup)
    for (let attempt = 0; attempt < 3; attempt++)
      await assert.rejects(
        () => f.system.service.login({ identifier: signup.email, password: 'incorrect' }),
        (error) => error instanceof AuthError && error.status === 401,
      )
    await assert.rejects(
      () => f.system.service.login({ identifier: signup.email, password: signup.password }),
      (error) => error instanceof AuthError && error.status === 429,
    )
    clock += 1001
    assert.equal(
      (await f.system.service.login({ identifier: signup.email, password: signup.password })).username,
      signup.username,
    )
    await assert.rejects(
      () => f.system.service.login({ identifier: signup.email, password: 'incorrect' }),
      (error) => error instanceof AuthError && error.status === 401,
    )
    assert.equal(
      (await f.system.service.login({ identifier: signup.email, password: signup.password })).username,
      signup.username,
    )
  } finally {
    await f.close()
  }
})

test('in-flight password login rejects a credential changed while hashing', async () => {
  const f = await fixture()
  try {
    const result = await f.system.service.signup(signup)
    const login = f.system.service.login({ identifier: signup.email, password: signup.password })
    f.system.repository.run('UPDATE entertainment_users SET password_hash=NULL WHERE id=?', result.user.id)
    await assert.rejects(
      () => login,
      (error) => error instanceof AuthError && error.status === 401,
    )
  } finally {
    await f.close()
  }
})

test('in-flight password change rejects a revoked session and preserves the credential', async () => {
  const f = await fixture()
  try {
    const client = f.client()
    await client.request('/auth/session')
    await client.request('/auth/signup', 'POST', signup)
    const user = f.system.repository.byLogin(signup.email)!,
      session = f.system.repository.sessions(user.id)[0]
    const changing = f.system.service.changePassword(
      user,
      Date.now(),
      {
        currentPassword: signup.password,
        password: 'Another long unique passphrase!',
        confirmPassword: 'Another long unique passphrase!',
      },
      session.id,
    )
    f.system.repository.revokeAll(user.id)
    await assert.rejects(
      () => changing,
      (error) => error instanceof AuthError && error.status === 401,
    )
    assert.equal(f.system.repository.user(user.id)?.password_hash, user.password_hash)
  } finally {
    await f.close()
  }
})
