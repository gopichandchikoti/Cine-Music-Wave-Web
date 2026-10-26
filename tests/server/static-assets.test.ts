import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import http, { type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test, { after, before } from 'node:test'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import express from 'express'
import { staticAssets } from '../../server/middlewares/static-assets.js'

let directory: string
let url: string
let stop: () => Promise<void>

/** fetch adds Cache-Control: no-cache to a request that carries If-None-Match, which would defeat the 304 check. */
const rawGet = (target: string, headers: Record<string, string>): Promise<{ status: number; headers: IncomingHttpHeaders }> =>
  new Promise((resolve, reject) => {
    http
      .get(target, { headers }, (response) => {
        response.resume()
        response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers }))
      })
      .on('error', reject)
  })

const script = 'console.log("hello from a hashed bundle")'

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'study-library-dist-'))
  await mkdir(path.join(directory, 'assets'))
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>shell</title>')
  await writeFile(path.join(directory, 'index.html.br'), brotliCompressSync(Buffer.from('<!doctype html><title>shell</title>')))
  await writeFile(path.join(directory, 'assets', 'main.1a2b3c4d.js'), script)
  await writeFile(path.join(directory, 'assets', 'main.1a2b3c4d.js.br'), brotliCompressSync(Buffer.from(script)))
  await writeFile(path.join(directory, 'assets', 'main.1a2b3c4d.js.gz'), gzipSync(Buffer.from(script)))
  await writeFile(path.join(directory, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await writeFile(path.join(directory, '.env'), 'SECRET=1')
  const app = express()
  app.use(staticAssets(directory))
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  stop = () =>
    new Promise((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
})
after(async () => {
  await stop()
  await rm(directory, { recursive: true, force: true })
})

test('hashed assets are immutable for a year and sent brotli-compressed when accepted', async () => {
  const response = await fetch(`${url}/assets/main.1a2b3c4d.js`, { headers: { 'accept-encoding': 'br, gzip' } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(response.headers.get('content-encoding'), 'br')
  assert.match(response.headers.get('content-type') ?? '', /javascript/)
  assert.match(response.headers.get('vary') ?? '', /Accept-Encoding/i)
  assert.equal(await response.text(), script)
})

test('gzip is the fallback and an unencoded request gets the original bytes', async () => {
  const gzip = await fetch(`${url}/assets/main.1a2b3c4d.js`, { headers: { 'accept-encoding': 'gzip' } })
  assert.equal(gzip.headers.get('content-encoding'), 'gzip')
  assert.equal(await gzip.text(), script)
  const plain = await fetch(`${url}/assets/main.1a2b3c4d.js`, { headers: { 'accept-encoding': 'identity' } })
  assert.equal(plain.headers.get('content-encoding'), null)
  assert.equal(await plain.text(), script)
})

test('the app shell is always revalidated and unknown pages fall back to it', async () => {
  const shell = await fetch(`${url}/`, { headers: { 'accept-encoding': 'br' } })
  assert.equal(shell.headers.get('cache-control'), 'no-cache')
  assert.match(shell.headers.get('content-type') ?? '', /text\/html/)
  assert.match(await shell.text(), /shell/)
  const route = await fetch(`${url}/study/python/lists`)
  assert.equal(route.status, 200)
  assert.match(await route.text(), /<title>shell<\/title>/)
})

test('a missing file with an extension is a 404, not the app shell', async () => {
  assert.equal((await fetch(`${url}/assets/gone.12345678.js`)).status, 404)
  assert.equal((await fetch(`${url}/missing.png`)).status, 404)
})

test('hidden files, traversal and encoded traversal are never served', async () => {
  for (const attack of ['/.env', '/%2e%2e/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/assets/%2e%2e/.env', '/%00']) {
    const response = await fetch(`${url}${attack}`)
    const body = await response.text()
    assert.ok(!body.includes('SECRET=1'), attack)
    assert.ok(response.status === 404 || /<title>shell<\/title>/.test(body), `${attack} answered ${response.status}`)
  }
})

test('only reads are served; a POST to a page route is not the app shell', async () => {
  const response = await fetch(`${url}/anything`, { method: 'POST' })
  assert.equal(response.status, 404)
})

test('conditional requests for the shell return 304', async () => {
  const first = await rawGet(`${url}/index.html`, { 'accept-encoding': 'identity' })
  const etag = first.headers.etag
  assert.ok(typeof etag === 'string')
  assert.equal((await rawGet(`${url}/index.html`, { 'if-none-match': etag, 'accept-encoding': 'identity' })).status, 304)
})
