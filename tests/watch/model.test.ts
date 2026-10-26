import test from 'node:test'
import assert from 'node:assert/strict'
import { activeCue, parseCues } from '../../src/features/watch/captions.js'
import { buildRows, canResume, nextToPlay, pickFeatured, searchTitles } from '../../src/features/watch/watchModel.js'
import type { ProgressEntry, WatchFile, WatchTitle } from '../../src/features/watch/watchTypes.js'

const episode = (id: string, season: number, number: number): WatchFile => ({
  id,
  season,
  episode: number,
  title: null,
  duration: 2400,
  quality: 'HD',
  height: 1080,
  hdr: false,
  audio: [],
  subtitles: [],
  probed: true,
  thumb: null,
})
const title = (id: string, name: string, overrides: Partial<WatchTitle> = {}): WatchTitle => ({
  id,
  kind: 'movie',
  title: name,
  year: 2020,
  overview: '',
  genres: [],
  languages: [],
  rating: null,
  addedAt: '2026-01-01T00:00:00.000Z',
  art: { card: 1, backdrop: 1 },
  files: [{ ...episode(`f_${id}`, 0, 0), season: null, episode: null }],
  ...overrides,
})
const progress = (
  fileId: string,
  titleId: string,
  position: number,
  completed = false,
  updatedAt = '2026-03-01T00:00:00.000Z',
): ProgressEntry => ({ fileId, titleId, position, duration: 2400, completed, updatedAt })

test('Play resumes a half-watched film and starts an untouched one from the beginning', () => {
  const film = title('t_a', 'A')
  assert.equal(nextToPlay(film, []).startAt, 0)
  assert.equal(nextToPlay(film, [progress('f_t_a', 't_a', 900)]).startAt, 900)
  assert.equal(nextToPlay(film, [progress('f_t_a', 't_a', 4)]).startAt, 0)
})

test('a series moves on to the next episode once one is finished', () => {
  const show = title('t_s', 'Show', { kind: 'series', files: [episode('e1', 1, 1), episode('e2', 1, 2), episode('e3', 1, 3)] })
  assert.equal(nextToPlay(show, [progress('e1', 't_s', 2399, true)]).file.id, 'e2')
  assert.deepEqual(
    [nextToPlay(show, [progress('e2', 't_s', 600)]).file.id, nextToPlay(show, [progress('e2', 't_s', 600)]).startAt],
    ['e2', 600],
  )
  assert.equal(canResume(show, []), false)
})

test('rows: continue watching first, then lists, recent, series and languages with enough titles', () => {
  const films = Array.from({ length: 6 }, (_, index) =>
    title(`t_${index}`, `Film ${index}`, { languages: ['Telugu'], addedAt: `2026-01-0${index + 1}T00:00:00.000Z` }),
  )
  const show = title('t_show', 'Show', {
    kind: 'series',
    addedAt: '2026-02-01T00:00:00.000Z',
    files: [episode('e1', 1, 1), episode('e2', 1, 2)],
  })
  const rows = buildRows([...films, show], [progress('f_t_3', 't_3', 500)], ['t_1'])
  assert.deepEqual(
    rows.map((row) => row.id),
    ['continue', 'list', 'recent', 'series', 'language:Telugu'],
  )
  assert.equal(rows[0].items[0].id, 't_3')
  assert.equal(rows[2].items[0].id, 't_show', 'newest additions come first')
})

test('the banner prefers something to continue, then the newest title that already has a wide picture', () => {
  const old = title('t_old', 'Old', { addedAt: '2026-01-01T00:00:00.000Z' })
  const fresh = title('t_new', 'New', { addedAt: '2026-02-01T00:00:00.000Z' })
  const noPicture = title('t_none', 'None', { addedAt: '2026-03-01T00:00:00.000Z', art: { card: null, backdrop: null } })
  assert.equal(pickFeatured([old, fresh, noPicture], [])?.id, 't_new')
  assert.equal(pickFeatured([old, fresh, noPicture], [progress('f_t_old', 't_old', 900)])?.id, 't_old')
  assert.equal(pickFeatured([], []), null)
})

test('search ignores case, accents and punctuation and ranks prefix matches first', () => {
  const titles = [
    title('t_1', 'The Pursuit of Happyness'),
    title('t_2', 'Pursuit', { languages: ['English'] }),
    title('t_3', 'Café Society'),
  ]
  assert.deepEqual(
    searchTitles(titles, 'pursuit').map((item) => item.id),
    ['t_2', 't_1'],
  )
  assert.deepEqual(
    searchTitles(titles, 'cafe SOCIETY').map((item) => item.id),
    ['t_3'],
  )
  assert.deepEqual(searchTitles(titles, '   '), [])
})

test('subtitles: WebVTT and SRT cues parse to plain text, and the right cue is found at any time', () => {
  const cues = parseCues(
    'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\n<i>Hello</i> &amp; welcome\n\n2\n00:00:05,000 --> 00:00:06,000\nSecond line\n',
  )
  assert.deepEqual(
    cues.map((cue) => cue.text),
    ['Hello & welcome', 'Second line'],
  )
  assert.equal(activeCue(cues, 0.5), null)
  assert.equal(activeCue(cues, 2)?.text, 'Hello & welcome')
  assert.equal(activeCue(cues, 4), null)
  assert.equal(activeCue(cues, 5.5)?.text, 'Second line')
})
