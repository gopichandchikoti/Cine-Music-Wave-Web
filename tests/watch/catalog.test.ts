import test from 'node:test'
import assert from 'node:assert/strict'
import { fileIdFor, mergeScan, sanitizeCatalog, titleIdFor, CatalogError } from '../../server/watch/catalog.js'

const file = (path: string, extra: Record<string, unknown> = {}) => ({
  id: fileIdFor(path),
  path,
  size: 10,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  season: null,
  episode: null,
  episodeTitle: null,
  probe: null,
  sidecarSubtitles: [],
  ...extra,
})
const catalogWith = (files: unknown[]) => ({
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  titles: [{ id: titleIdFor('movie:x'), key: 'movie:x', kind: 'movie', title: 'X', year: 2020, files }],
})

test('a hand-edited catalog keeps valid picture rectangles and drops impossible ones', () => {
  const valid = file('a.mkv', { contentRect: { x: 0, y: 0.128, w: 1, h: 0.744 } })
  const none = file('b.mkv', { contentRect: null })
  const outside = file('c.mkv', { contentRect: { x: 0.5, y: 0, w: 0.9, h: 1 } })
  const nonsense = file('d.mkv', { contentRect: { x: 'left', y: 0, w: 1, h: 1 } })
  const files = sanitizeCatalog(catalogWith([valid, none, outside, nonsense])).titles[0].files
  assert.deepEqual(files[0].contentRect, { x: 0, y: 0.128, w: 1, h: 0.744 })
  assert.equal(files[1].contentRect, null)
  assert.equal(files[2].contentRect, undefined)
  assert.equal(files[3].contentRect, undefined)
})

test('a catalog that is not the expected shape is refused rather than guessed at', () => {
  assert.throws(() => sanitizeCatalog({ version: 2, titles: [] }), CatalogError)
  assert.throws(() => sanitizeCatalog(null), CatalogError)
})

test('a file that changed on disk has its measurements forgotten, so they are taken again', () => {
  const catalog = sanitizeCatalog(catalogWith([file('a.mkv', { contentRect: { x: 0, y: 0.1, w: 1, h: 0.8 } })]))
  const entry = { path: 'a.mkv', size: 999, modifiedAt: '2026-02-02T00:00:00.000Z', kind: 'video' as const, sidecarSubtitles: [] }
  mergeScan(catalog, [entry], '2026-02-03T00:00:00.000Z')
  assert.equal(catalog.titles[0].files[0].contentRect, undefined)
  assert.equal(catalog.titles[0].files[0].probe, null)
})

test('a file that has not changed keeps what was measured, and one that vanished is only flagged', () => {
  const catalog = sanitizeCatalog(catalogWith([file('a.mkv', { contentRect: null }), file('gone.mkv')]))
  const summary = mergeScan(
    catalog,
    [{ path: 'a.mkv', size: 10, modifiedAt: '2026-01-01T00:00:00.000Z', kind: 'video', sidecarSubtitles: [] }],
    '2026-02-03T00:00:00.000Z',
  )
  assert.equal(catalog.titles[0].files[0].contentRect, null)
  assert.equal(catalog.titles[0].files[1].missing, true)
  assert.equal(summary.removed, 1)
})
