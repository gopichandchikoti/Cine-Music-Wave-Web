import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test, { after, before } from 'node:test'
import { loadServerConfig } from '../../server/config/index.js'
import { startAccountServer, STRONG_PASSWORD, type AccountServer, type Client } from './harness.js'

let server: AccountServer

before(async () => {
  server = await startAccountServer()
})
after(async () => {
  await server.stop()
})

test('obvious passwords are refused at sign-up, including one that contains the username', async () => {
  const attacker = await server.anonymous()
  const base = { firstName: 'G', lastName: 'U' }
  for (const [username, password] of [
    ['guessone', 'aaaaaaaaaaaaaaaaaaaa'],
    ['guesstwo', 'qwertyuiopasdfgh'],
    ['guessthree', 'my guessthree password!'],
  ] as const) {
    const response = await attacker.request('/api/auth/signup', {
      method: 'POST',
      body: { ...base, email: `${username}@example.test`, username, password, confirmPassword: password },
    })
    assert.equal(response.status, 400, username)
    assert.match(String(response.json?.message), /less guessable/, username)
  }
})

test('a rescan walks the whole media folder, so it has its own small budget and answers 429 with Retry-After', async () => {
  const { client } = await server.signUp('scanner')
  let limited: Awaited<ReturnType<Client['request']>> | null = null
  let accepted = 0
  for (let attempt = 0; attempt < 12 && !limited; attempt += 1) {
    const response = await client.request('/api/watch/rescan', { method: 'POST' })
    if (response.status === 429) limited = response
    else {
      assert.equal(response.status, 200, response.text)
      accepted += 1
    }
  }
  assert.ok(limited, 'a script that rescans in a loop is cut off')
  assert.ok(accepted <= 6, `at most six rescans a minute, saw ${accepted}`)
  assert.ok(Number(limited.headers.get('retry-after')) >= 1)
  assert.equal(limited.json?.code, 'RATE_LIMITED')
})

test('saving to Watch and Music is limited per address; reading is never throttled by that budget', async () => {
  const { client } = await server.signUp('scripted')
  let limited: Awaited<ReturnType<Client['request']>> | null = null
  for (let attempt = 0; attempt < 300 && !limited; attempt += 1) {
    const response = await client.request('/api/music/likes/s_000000000000', { method: 'PUT' })
    if (response.status === 429) limited = response
    else assert.equal(response.status, 404)
  }
  assert.ok(limited, 'a runaway script is cut off')
  assert.ok(Number(limited.headers.get('retry-after')) >= 1)
  assert.equal((await client.request('/api/music/library')).status, 200)
})

test("the account export holds the account's own Watch and Music data and nobody else's", async () => {
  const first = await server.signUp('exporter')
  const second = await server.signUp('bystander')
  const idOf = async (client: Client): Promise<string> =>
    String(((await client.request('/api/auth/session')).json?.user as { id?: unknown } | undefined)?.id)
  const database = new DatabaseSync(server.config.personalDatabasePath)
  try {
    for (const [owner, tag] of [
      [await idOf(first.client), 'mine'],
      [await idOf(second.client), 'theirs'],
    ] as const) {
      const now = new Date().toISOString()
      database
        .prepare('INSERT INTO entertainment_watch_list(user_id,title_id,added_at) VALUES(?,?,?)')
        .run(owner, `t_${tag}`, now)
      database
        .prepare('INSERT INTO entertainment_music_likes(user_id,track_id,liked_at) VALUES(?,?,?)')
        .run(owner, `s_${tag}`, now)
      database
        .prepare('INSERT INTO entertainment_music_plays(user_id,track_id,played_at,seconds,completed) VALUES(?,?,?,?,?)')
        .run(owner, `s_${tag}`, now, 30, 1)
    }
  } finally {
    database.close()
  }
  const exported = await first.client.request('/api/account/export', {
    method: 'POST',
    body: { currentPassword: STRONG_PASSWORD, confirmation: first.username },
  })
  assert.equal(exported.status, 200, exported.text)
  for (const key of ['watchList', 'musicLikes', 'musicPlays']) {
    const rows = exported.json?.[key]
    assert.ok(Array.isArray(rows) && rows.length === 1, `${key} has exactly the account's row`)
  }
  assert.ok(exported.text.includes('t_mine'))
  assert.ok(!exported.text.includes('theirs'), "another account's rows never appear")
  assert.ok(!exported.text.includes('password_hash') && !exported.text.includes('scrypt$'), 'no secrets in the export')
})

test('an unreadable catalog is reported without naming where it lives on this machine', async () => {
  const { client } = await server.signUp('catalog')
  const catalog = path.join(server.config.watch.catalogDirectory, 'catalog.json')
  await writeFile(catalog, '{"version": 1, "titles": [ this is not json')
  try {
    for (const route of ['/api/watch/catalog', '/api/music/library']) {
      const response = await client.request(route)
      assert.equal(response.status, 500, route)
      assert.match(String(response.json?.code), /_CATALOG_INVALID$/, route)
      assert.ok(!response.text.includes(server.config.watch.catalogDirectory), `${route} must not name the catalog folder`)
      assert.ok(
        !/catalog\.json|ENOENT|SyntaxError|Unexpected token/i.test(response.text),
        `${route} must not pass the parser's message on`,
      )
    }
  } finally {
    await rm(catalog, { force: true })
  }
})

test('the video encoder setting is read once, in the configuration, and anything unknown means the default', () => {
  const base = { NODE_ENV: 'test', AUTH_MODE: 'accounts', AUTH_PUBLIC_ORIGIN: 'http://localhost:4040' }
  assert.equal(loadServerConfig(base).watch.encoder, 'x264')
  assert.equal(loadServerConfig({ ...base, WATCH_ENCODER: 'amf' }).watch.encoder, 'amf')
  assert.equal(loadServerConfig({ ...base, WATCH_ENCODER: 'anything-else' }).watch.encoder, 'x264')
})
