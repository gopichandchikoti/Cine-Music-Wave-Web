import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { startAccountServer, STRONG_PASSWORD, type AccountServer } from './harness.js'

let server: AccountServer

/** The id of the record a response created. */
const idOf = (body: Record<string, unknown> | null): string => String((body as { id?: unknown } | null)?.id)

before(async () => {
  server = await startAccountServer()
})
after(async () => {
  await server.stop()
})

const PROTECTED_READS = [
  '/api/profile',
  '/api/settings',
  '/api/watch/catalog',
  '/api/watch/diagnostics',
  '/api/music/library',
  '/api/music/lyrics/anything',
]

test('every protected route refuses a visitor with no session', async () => {
  const visitor = await server.anonymous()
  for (const route of PROTECTED_READS) {
    const response = await visitor.request(route)
    assert.equal(response.status, 401, `${route} answered ${response.status}`)
  }
})

test('a forged, truncated or stolen-looking session cookie is not a session', async () => {
  const { client } = await server.signUp('forge')
  assert.ok(client.cookieNames().includes('cine_music_wave_account'), 'a session cookie exists')
  for (const value of ['', 'x', 'A'.repeat(43), '../../etc/passwd', '%00', 'a.b.c', 'A'.repeat(4000)]) {
    const attacker = await server.anonymous()
    attacker.forgeCookie('cine_music_wave_account', value)
    assert.equal((await attacker.request('/api/music/library')).status, 401, `cookie ${value.slice(0, 12)}`)
  }
})

test('a write without the CSRF token or from another origin is rejected before it acts', async () => {
  const { client } = await server.signUp('csrf')
  const noToken = await client.request('/api/music/playlists', { method: 'POST', body: { name: 'mine' }, csrf: false })
  assert.equal(noToken.status, 403)
  const wrongOrigin = await client.request('/api/music/playlists', {
    method: 'POST',
    body: { name: 'mine' },
    headers: { origin: 'https://evil.example' },
  })
  assert.equal(wrongOrigin.status, 403)
  const ok = await client.request('/api/music/playlists', { method: 'POST', body: { name: 'mine' } })
  assert.equal(ok.status, 201)
})

test("one account cannot read, rename or delete another account's playlists (no IDOR)", async () => {
  const owner = (await server.signUp('owner')).client
  const intruder = (await server.signUp('intruder')).client
  const created = await owner.request('/api/music/playlists', { method: 'POST', body: { name: 'private mix' } })
  assert.equal(created.status, 201)
  const id = idOf(created.json)
  assert.equal((await intruder.request(`/api/music/playlists/${id}`, { method: 'PATCH', body: { name: 'stolen' } })).status, 404)
  assert.equal(
    (await intruder.request(`/api/music/playlists/${id}/tracks`, { method: 'PUT', body: { trackIds: [] } })).status,
    404,
  )
  assert.equal((await intruder.request(`/api/music/playlists/${id}`, { method: 'DELETE' })).status, 404)
  const library = await intruder.request('/api/music/library')
  assert.ok(!library.text.includes('private mix'), "the library never lists another account's playlist")
  assert.equal((await owner.request(`/api/music/playlists/${id}`, { method: 'DELETE' })).status, 200)
})

test('ids from the URL are looked up, never used as paths', async () => {
  const { client } = await server.signUp('walker')
  for (const attack of [
    '..%2F..%2Foutside-secret.txt',
    '%2e%2e%2f%2e%2e%2foutside-secret.txt',
    '..\\outside-secret.txt',
    'C%3A%5CWindows%5Cwin.ini',
    '%00',
    'a'.repeat(5000),
  ]) {
    for (const route of [
      `/api/music/stream/${attack}`,
      `/api/music/cover/${attack}`,
      `/api/watch/stream/${attack}`,
      `/api/watch/artwork/${attack}/poster`,
      `/api/watch/thumb/${attack}`,
    ]) {
      const response = await client.request(route)
      assert.ok(response.status >= 400 && response.status < 500, `${route} answered ${response.status}`)
      assert.ok(!response.text.includes('TOP-SECRET-OUTSIDE-ROOT'))
    }
  }
})

test('errors reveal nothing: no stack, SQL, path or framework name', async () => {
  const { client } = await server.signUp('errors')
  const broken = await fetch(`${server.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:4040' },
    body: '{"identifier":',
  })
  const missing = await client.request('/api/does-not-exist')
  for (const text of [await broken.text(), missing.text]) {
    assert.ok(
      !/\bat \w+.*\(.*:\d+:\d+\)|node_modules|SQLITE|SELECT |INSERT |Error:|Express|stack/i.test(text),
      `leaky body: ${text.slice(0, 120)}`,
    )
  }
  assert.equal(missing.status, 404)
  assert.equal(missing.json?.code, 'NOT_FOUND')
})

test('sign-in does not reveal whether an account exists, and failures are rate limited', async () => {
  const { username } = await server.signUp('victim')
  const attacker = await server.anonymous()
  const wrongPassword = await attacker.request('/api/auth/login', {
    method: 'POST',
    body: { identifier: username, password: `${STRONG_PASSWORD} wrong` },
  })
  const unknownUser = await attacker.request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'no-such-user-xyz', password: `${STRONG_PASSWORD} wrong` },
  })
  assert.equal(wrongPassword.status, 401)
  assert.equal(unknownUser.status, 401)
  assert.equal(wrongPassword.json?.message, unknownUser.json?.message, 'same message for both')
  let limited = false
  for (let attempt = 0; attempt < 40 && !limited; attempt += 1) {
    limited =
      (
        await attacker.request('/api/auth/login', {
          method: 'POST',
          body: { identifier: username, password: `guess ${attempt}` },
        })
      ).status === 429
  }
  assert.ok(limited, 'repeated failures end in HTTP 429')
})

test('weak passwords and mismatched confirmations are refused at sign-up', async () => {
  const attacker = await server.anonymous()
  const base = { email: 'weak@example.test', username: 'weakuser', firstName: 'W', lastName: 'U' }
  assert.equal(
    (
      await attacker.request('/api/auth/signup', {
        method: 'POST',
        body: { ...base, password: 'short', confirmPassword: 'short' },
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await attacker.request('/api/auth/signup', {
        method: 'POST',
        body: { ...base, password: STRONG_PASSWORD, confirmPassword: 'different one entirely' },
      })
    ).status,
    400,
  )
})

test('responses carry the hardening headers and no framework banner', async () => {
  const anonymous = await server.anonymous()
  const response = await anonymous.request('/api/auth/session')
  for (const header of [
    'content-security-policy',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    'x-request-id',
    'ratelimit-limit',
  ]) {
    assert.ok(response.headers.get(header), `${header} is set`)
  }
  assert.equal(response.headers.get('x-powered-by'), null)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.ok(
    !/googleapis|gstatic/.test(response.headers.get('content-security-policy') ?? ''),
    'no third-party font origin is allowed',
  )
})

test('CORS is closed: a foreign origin gets no permissive headers', async () => {
  const response = await fetch(`${server.url}/api/auth/session`, { headers: { origin: 'https://evil.example' } })
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  const preflight = await fetch(`${server.url}/api/music/library`, {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
  })
  assert.equal(preflight.headers.get('access-control-allow-origin'), null)
})

test('the web root serves only the build: dotfiles, source and maps are unreachable', async () => {
  for (const route of [
    '/.env',
    '/.git/config',
    '/package.json',
    '/server/index.ts',
    '/node_modules/express/package.json',
    '/data/cine-music-wave.sqlite',
    '/%2e%2e/package.json',
  ]) {
    const response = await fetch(`${server.url}${route}`)
    const body = await response.text()
    assert.ok(!/"name":\s*"cine-music-wave"|SQLite format|\[core\]|import express/.test(body), `${route} leaked file content`)
  }
})
