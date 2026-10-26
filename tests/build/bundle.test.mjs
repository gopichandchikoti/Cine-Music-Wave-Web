import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import configure from '../../webpack.config.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('HTML metadata and the loading message use the content model', async () => {
  const model = JSON.parse(await readFile(path.join(root, 'src/content.model.json'), 'utf8'))
  const config = configure({}, { mode: 'production' })
  const html = config.plugins.find((plugin) => plugin.constructor.name === 'HtmlWebpackPlugin')
  assert.deepEqual(html.userOptions.templateParameters.content, model)
  const defines = config.plugins.find((plugin) => plugin.constructor.name === 'DefinePlugin')
  assert.equal(JSON.parse(defines.definitions.__LIBRARY_LOADING_TEXT__), model.appLoader.openingYourLibrary)
  const output = await readFile(path.join(root, 'dist/index.html'), 'utf8')
  // The production minifier drops attribute quotes, so lang=en and lang="en" are both correct.
  assert.match(output, new RegExp('lang="?' + model.locale + '"?[ >]'))
  assert.ok(output.includes(model.document.title))
})

test('explicit production mode uses hidden, non-eval source maps and hashed assets', () => {
  const production = configure({}, { mode: 'production' })
  assert.equal(production.mode, 'production')
  assert.equal(production.devtool, 'hidden-source-map')
  assert.match(production.output.filename, /contenthash/)
  assert.equal(production.performance.hints, 'warning')
  const jsxOptions = (config) =>
    config.module.rules.flatMap((rule) => rule.use?.options?.presets ?? []).find(([name]) => name === '@babel/preset-react')[1]
  assert.equal(
    jsxOptions(production).development,
    false,
    'production bundles must use the production JSX runtime whatever NODE_ENV is',
  )
  const development = configure({}, { mode: 'development' })
  assert.equal(jsxOptions(development).development, true)
  assert.equal(development.mode, 'development')
  assert.equal(development.devtool, 'eval-cheap-module-source-map')
})

test('production assets and initial scripts meet the existing 250 KB warning budget', async () => {
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8')
  const scripts = [...html.matchAll(/<script[^>]+src=(?:"([^"]+)"|\x27([^\x27]+)\x27|([^\s>]+))/g)].map((match) =>
    (match[1] ?? match[2] ?? match[3]).replace(/^\//, ''),
  )
  assert.ok(scripts.length > 0)
  let initialBytes = 0
  for (const script of scripts) initialBytes += (await stat(path.join(root, 'dist', script))).size
  assert.ok(initialBytes <= 250000, 'Initial scripts exceed the Webpack entrypoint budget: ' + initialBytes)
  for (const file of await readdir(path.join(root, 'dist/assets'))) {
    if (!file.endsWith('.js')) continue
    assert.match(file, /\.[a-f0-9]{8}(?:\.chunk)?\.js$/, 'Production assets must have content hashes')
    const filename = path.join(root, 'dist/assets', file)
    assert.ok((await stat(filename)).size <= 250000, file + ' exceeds the Webpack asset budget')
    const source = await readFile(filename, 'utf8')
    assert.ok(!source.includes('webpack-internal://'), 'Development eval source map found in ' + file)
    // Calls like (0,x.jsxDEV)(...) come from Babel's development JSX. Mentions inside libraries (hast-util-to-jsx-runtime) are fine.
    assert.ok(
      !/\(0,\s*[\w$]+\.jsxDEV\)\(/.test(source),
      'Development JSX runtime calls found in ' + file + '; the page would crash with "jsxDEV is not a function"',
    )
  }
})

test('fonts are self-hosted: no third-party font or style origin in the built page or styles', async () => {
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8')
  assert.ok(!/googleapis|gstatic/.test(html), 'index.html must not reference a font CDN')
  for (const file of await readdir(path.join(root, 'dist/assets'))) {
    if (!file.endsWith('.css')) continue
    const css = await readFile(path.join(root, 'dist/assets', file), 'utf8')
    assert.ok(!/googleapis|gstatic/.test(css), file + ' must not import fonts from a CDN')
  }
})

test('the first screen preloads its body and heading fonts and links an extracted stylesheet', async () => {
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8')
  assert.match(
    html,
    /<link rel=preload as=font type=font\/woff2 crossorigin href=\/assets\/dm-sans-latin-wght-normal\.[0-9a-f]{8}\.woff2>/,
  )
  assert.match(
    html,
    /<link rel=preload as=font type=font\/woff2 crossorigin href=\/assets\/fraunces-latin-opsz-normal\.[0-9a-f]{8}\.woff2>/,
  )
  assert.match(html, /<link href=\/assets\/main\.[0-9a-f]{8}\.css rel=stylesheet>/, 'CSS is a real file, not injected by script')
  assert.match(html, /<script defer src=/, 'scripts are deferred so they never block rendering')
  assert.match(html, /<link rel=icon href=\/favicon\.svg>/)
})

test('every compressible asset has brotli and gzip twins for the server to send', async () => {
  const assets = await readdir(path.join(root, 'dist/assets'))
  for (const file of assets.filter((name) => /\.(js|css)$/.test(name))) {
    const size = (await stat(path.join(root, 'dist/assets', file))).size
    if (size < 512) continue
    assert.ok(assets.includes(file + '.br'), file + ' needs a .br twin')
    assert.ok(assets.includes(file + '.gz'), file + ' needs a .gz twin')
  }
})
