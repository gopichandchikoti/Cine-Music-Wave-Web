import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import configure from '../../webpack.config.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const loadConfig = async () => JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'))

// Exercise the ordered deployment routes against the real build output. This does not replace a live Vercel check.
async function resolveRequest(config, pathname) {
  const headers = {}
  for (const route of config.routes) {
    if (route.handle === 'filesystem') {
      const filename = path.join(root, config.outputDirectory, pathname === '/' ? 'index.html' : pathname)
      try {
        if ((await stat(filename)).isFile()) return { status: 200, destination: pathname, headers }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      continue
    }
    if (!new RegExp('^(?:' + route.src + ')$', 'i').test(pathname)) continue
    Object.assign(headers, route.headers)
    if (!route.continue) return { status: route.status ?? 200, destination: route.dest, headers }
  }
  return { status: 404, headers }
}

test('Vercel publishes Webpack output containing the generated homepage', async () => {
  const config = await loadConfig()
  assert.equal(config.framework, null)
  assert.equal(config.buildCommand, 'pnpm build')
  assert.equal(path.resolve(root, config.outputDirectory), configure({}, { mode: 'production' }).output.path)
  const html = await readFile(path.join(root, config.outputDirectory, 'index.html'), 'utf8')
  assert.match(html, /<script defer src=/)
})

test('direct browser navigation resolves to the built app without swallowing API and asset failures', async () => {
  const config = await loadConfig()
  for (const pathname of ['/watch', '/music', '/privacy', '/terms', '/unknown-page']) {
    const result = await resolveRequest(config, pathname)
    assert.equal(result.status, 200, pathname)
    assert.equal(result.destination, '/index.html', pathname)
    assert.equal(result.headers['Cache-Control'], 'no-cache')
  }
  for (const pathname of ['/api', '/api/health', '/api/auth/session', '/assets/missing.js']) {
    assert.equal((await resolveRequest(config, pathname)).status, 404, pathname)
  }
  const assets = await readdir(path.join(root, config.outputDirectory, 'assets'))
  const script = assets.find((name) => name.endsWith('.js'))
  assert.ok(script, 'a real script must exist as the static-file positive control')
  assert.equal((await resolveRequest(config, '/assets/' + script)).status, 200)
  assert.equal((await resolveRequest(config, '/favicon.svg')).status, 200)
})

test('generated source maps are blocked before the filesystem serves them', async () => {
  const config = await loadConfig()
  const assets = await readdir(path.join(root, config.outputDirectory, 'assets'))
  const sourceMap = assets.find((name) => name.endsWith('.js.map'))
  assert.ok(sourceMap, 'use a real emitted source map as the positive control')
  assert.equal((await resolveRequest(config, '/assets/' + sourceMap)).status, 404)
  assert.equal((await resolveRequest(config, '/assets/' + sourceMap + '.gz')).status, 404)
})

test('the static deployment carries the production browser protections', async () => {
  const config = await loadConfig()
  for (const pathname of ['/watch', '/api/health', '/favicon.svg']) {
    const { headers } = await resolveRequest(config, pathname)
    assert.equal(headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(headers['Referrer-Policy'], 'same-origin')
    assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN')
    assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin')
    assert.equal(headers['Cross-Origin-Resource-Policy'], 'same-origin')
    assert.match(headers['Permissions-Policy'], /camera=\(\)/)
    assert.match(headers['Strict-Transport-Security'], /max-age=31536000/)
    assert.match(headers['Content-Security-Policy'], /default-src 'self'/)
    assert.ok(!headers['Content-Security-Policy'].includes('unsafe-eval'))
    assert.ok(!headers['Content-Security-Policy'].includes('*'))
  }
})
