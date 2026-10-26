import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIndex,
  buildShelves,
  dailyMixes,
  energeticIds,
  facetCounts,
  filterTracks,
  formatLength,
  formatTime,
  keyOf,
  moodTracks,
  radioTracks,
  searchLibrary,
  seededRandom,
} from '../../src/features/music/musicModel.js'
import type { MusicState, MusicTrack } from '../../src/features/music/musicTypes.js'

let counter = 0
const song = (overrides: Partial<MusicTrack>): MusicTrack => {
  counter += 1
  return {
    id: `f_${String(counter).padStart(12, '0')}`,
    title: `Song ${counter}`,
    artists: [],
    album: 'Album',
    albumId: 'a_000000000001',
    year: 2016,
    track: counter,
    disc: null,
    genre: null,
    language: 'Telugu',
    cast: [],
    bpm: null,
    duration: 220,
    format: 'mp3',
    size: 1,
    cover: true,
    lyrics: false,
    addedAt: '2026-01-01T00:00:00.000Z',
    loudness: null,
    ...overrides,
  }
}

const empty: MusicState = { likes: [], plays: [], recent: [], playlists: [], radios: [], community: [] }
const now = new Date('2026-10-23T12:00:00.000Z')

const library = (): MusicTrack[] => {
  counter = 0
  return [
    song({
      title: 'Aakupachhani',
      artists: ['Karthik', 'Ramya Behara'],
      album: 'Jyo Achyutananda',
      albumId: 'a_000000000001',
      year: 2016,
      track: 2,
      cast: ['Nara Rohith'],
    }),
    song({
      title: 'Oka Lalana',
      artists: ['Shankar Mahadevan'],
      album: 'Jyo Achyutananda',
      albumId: 'a_000000000001',
      year: 2016,
      track: 1,
    }),
    song({
      title: 'Le Le Le Le',
      artists: ['KK'],
      album: 'Gudumba Shankar',
      albumId: 'a_000000000002',
      year: 2005,
      genre: 'Soundtrack',
    }),
    song({
      title: 'Prema Ane',
      artists: ['S.P.Balasubrahmanyam', 'Swarnalatha'],
      album: 'Premikula Roju',
      albumId: 'a_000000000003',
      year: 1999,
      language: 'Telugu',
    }),
    song({
      title: 'Kabira',
      artists: ['Arijit Singh'],
      album: 'Yeh Jawaani',
      albumId: 'a_000000000004',
      year: 2013,
      language: 'Hindi',
    }),
    song({
      title: 'Chinnadani Choopulona',
      artists: ['Karthik'],
      album: 'Sardaar Gabbar Singh',
      albumId: 'a_000000000005',
      year: 2016,
    }),
  ]
}

test('the index groups songs into films (albums) and singers, in track order', () => {
  const index = buildIndex(library())
  assert.equal(index.albums.length, 5)
  const jyo = index.albumById.get('a_000000000001')!
  assert.deepEqual(
    jyo.trackIds.map((id) => index.byId.get(id)!.title),
    ['Oka Lalana', 'Aakupachhani'],
    'ordered by track number',
  )
  assert.deepEqual(jyo.artists, ['Karthik', 'Ramya Behara', 'Shankar Mahadevan'])
  assert.equal(index.artistByKey.get(keyOf('Karthik'))!.trackIds.length, 2)
  assert.deepEqual(index.languages, ['Telugu', 'Hindi'])
  assert.equal(index.albumById.get('a_000000000003')!.language, 'Telugu')
})

test('search finds songs by song name, singer, film and cast, and ranks direct title hits first', () => {
  const index = buildIndex(library())
  const titles = (query: string): string[] => searchLibrary(index, query).tracks.map((track) => track.title)
  assert.deepEqual(titles('kabira'), ['Kabira'])
  assert.deepEqual(titles('KARTHIK'), ['Aakupachhani', 'Chinnadani Choopulona'])
  assert.deepEqual(titles('gudumba'), ['Le Le Le Le'], 'by film name')
  assert.deepEqual(titles('nara rohith'), ['Aakupachhani'], 'by cast')
  assert.deepEqual(titles('spb'), [])
  assert.deepEqual(titles('s p balasubrahmanyam'), ['Prema Ane'], 'punctuation does not matter')
  assert.equal(searchLibrary(index, 'jyo').albums[0].name, 'Jyo Achyutananda')
  assert.deepEqual(
    searchLibrary(index, 'swarna').artists.map((artist) => artist.name),
    ['Swarnalatha'],
  )
})

test('filters narrow by singer, film, language, genre and year, with or without a query', () => {
  const index = buildIndex(library())
  const likes = new Set<string>()
  assert.deepEqual(
    filterTracks(index, { artist: keyOf('Karthik') }, likes).map((track) => track.title),
    ['Aakupachhani', 'Chinnadani Choopulona'],
  )
  assert.equal(filterTracks(index, { language: 'Hindi' }, likes).length, 1)
  assert.equal(filterTracks(index, { year: 2016 }, likes).length, 3)
  assert.equal(filterTracks(index, { genre: 'Soundtrack' }, likes).length, 1)
  assert.equal(filterTracks(index, { albumId: 'a_000000000001', year: 2005 }, likes).length, 0)
  const first = index.tracks[0].id
  assert.deepEqual(
    filterTracks(index, { liked: true }, new Set([first])).map((track) => track.id),
    [first],
  )
  assert.deepEqual(searchLibrary(index, 'karthik', { filters: { year: 2016 } }).tracks.length, 2)
})

test('filter chips count what each choice would leave, ignoring that filter itself', () => {
  const index = buildIndex(library())
  const counts = facetCounts(index, { language: 'Hindi' }, new Set())
  assert.deepEqual(
    counts.languages,
    [
      ['Telugu', 5],
      ['Hindi', 1],
    ],
    'every language stays pickable',
  )
  assert.deepEqual(counts.years, [[2013, 1]], 'years left under the language filter')
  assert.deepEqual(
    facetCounts(index, {}, new Set()).years.map(([year]) => year),
    [2016, 2013, 2005, 1999],
    'newest year first',
  )
})

test('a radio from a song starts with it, stays close to it, and never repeats what was excluded', () => {
  const index = buildIndex(library())
  const seed = index.tracks[0]
  const picked = radioTracks(index, { kind: 'track', value: seed.id }, { count: 5, random: seededRandom('r') })
  assert.equal(picked[0].id, seed.id)
  assert.equal(new Set(picked.map((track) => track.id)).size, picked.length)
  assert.ok(
    picked.slice(1, 3).some((track) => track.title === 'Oka Lalana'),
    'a song from the same film is among the first few',
  )
  const withoutSeed = radioTracks(
    index,
    { kind: 'track', value: seed.id },
    { count: 5, random: seededRandom('r'), exclude: new Set([seed.id]) },
  )
  assert.ok(!withoutSeed.some((track) => track.id === seed.id))
  assert.deepEqual(radioTracks(index, { kind: 'track', value: 'f_missing' }, { count: 5, random: seededRandom('r') }), [])
})

test('radios from a singer, a film, a genre and a language use those songs', () => {
  const index = buildIndex(library())
  const random = seededRandom('k')
  assert.ok(
    radioTracks(index, { kind: 'artist', value: 'Karthik' }, { count: 2, random }).every((track) =>
      track.artists.includes('Karthik'),
    ),
  )
  assert.equal(
    radioTracks(index, { kind: 'album', value: 'a_000000000001' }, { count: 2, random }).every(
      (track) => track.albumId === 'a_000000000001',
    ),
    true,
  )
  assert.equal(radioTracks(index, { kind: 'language', value: 'Hindi' }, { count: 3, random })[0].title, 'Kabira')
})

test('the same day gives the same shelves, and a new day gives different quick picks', () => {
  const index = buildIndex(
    Array.from({ length: 40 }, (_, i) =>
      song({
        title: `T${i}`,
        artists: [`Singer ${i % 5}`],
        album: `Film ${i % 7}`,
        albumId: `a_${String(i % 7).padStart(12, '0')}`,
      }),
    ),
  )
  const input = { index, state: empty, films: [], now }
  const ids = (date: Date): string[] => {
    const shelf = buildShelves({ ...input, now: date }).find((entry) => entry.id === 'quick-picks')
    return shelf?.type === 'tracks' ? shelf.trackIds : []
  }
  assert.deepEqual(ids(now), ids(new Date(now.getTime() + 3600_000)))
  assert.notDeepEqual(ids(now), ids(new Date(now.getTime() + 2 * 86400_000)))
})

test('Home shelves react to listening history: speed dial, listen again and forgotten favourites', () => {
  const index = buildIndex(library())
  const a = index.tracks[0].id
  const b = index.tracks[2].id
  const state: MusicState = {
    ...empty,
    likes: [b],
    recent: [{ trackId: a, at: '2026-10-22T10:00:00.000Z' }],
    plays: [
      { trackId: a, count: 3, lastAt: '2026-10-22T10:00:00.000Z' },
      { trackId: b, count: 4, lastAt: '2026-08-01T10:00:00.000Z' },
      { trackId: index.tracks[1].id, count: 2, lastAt: '2026-07-01T10:00:00.000Z' },
      { trackId: index.tracks[3].id, count: 2, lastAt: '2026-07-01T10:00:00.000Z' },
    ],
  }
  const shelves = buildShelves({ index, state, films: [], now })
  const tiles = shelves.find((shelf) => shelf.id === 'speed-dial')
  assert.ok(tiles?.type === 'tiles' && tiles.tiles[0].kind === 'liked', 'Liked Songs leads once something is liked')
  assert.ok(tiles?.type === 'tiles' && tiles.tiles.some((tile) => tile.kind === 'album' && tile.id === 'a_000000000001'))
  assert.ok(tiles?.type === 'tiles' && tiles.tiles.length <= 9)
  const again = shelves.find((shelf) => shelf.id === 'recent')
  assert.ok(again?.type === 'tracks' && again.trackIds[0] === a)
  const forgotten = shelves.find((shelf) => shelf.id === 'forgotten')
  assert.ok(
    forgotten?.type === 'tracks' && forgotten.trackIds.includes(b) && !forgotten.trackIds.includes(a),
    'a song played yesterday is not forgotten',
  )
})

test('"Music from videos" appears only for albums that match a film in the library', () => {
  const index = buildIndex(library())
  const none = buildShelves({ index, state: empty, films: [{ title: 'Some Other Film', year: 2020 }], now })
  assert.equal(
    none.some((shelf) => shelf.id === 'from-films'),
    false,
  )
  const some = buildShelves({
    index,
    state: empty,
    films: [
      { title: 'Jyo Achyutananda', year: 2016 },
      { title: 'Gudumba Shankar', year: 2005 },
    ],
    now,
  }).find((shelf) => shelf.id === 'from-films')
  assert.ok(some?.type === 'albums' && some.albumIds.length === 2)
})

test('"From the community" needs at least two listeners, and "Commute" only short songs', () => {
  const tracks = Array.from({ length: 30 }, (_, i) => song({ title: `T${i}`, artists: ['A'], duration: i < 15 ? 200 : 400 }))
  const index = buildIndex(tracks)
  const solo = buildShelves({
    index,
    state: { ...empty, community: tracks.slice(0, 5).map((track) => ({ trackId: track.id, plays: 9, listeners: 1 })) },
    films: [],
    now,
  })
  assert.equal(
    solo.some((shelf) => shelf.id === 'community'),
    false,
  )
  const shared = buildShelves({
    index,
    state: { ...empty, community: tracks.slice(0, 5).map((track) => ({ trackId: track.id, plays: 9, listeners: 2 })) },
    films: [],
    now,
  })
  assert.equal(
    shared.some((shelf) => shelf.id === 'community'),
    true,
  )
  const commute = shared.find((shelf) => shelf.id === 'commute')
  assert.ok(commute?.type === 'tracks' && commute.trackIds.every((id) => index.byId.get(id)!.duration <= 280))
})

test('workout picks the loudest songs once enough have been measured', () => {
  const tracks = Array.from({ length: 30 }, (_, i) => song({ title: `T${i}`, loudness: -30 + i }))
  const index = buildIndex(tracks)
  const loud = new Set(energeticIds(index))
  assert.ok(loud.has(tracks[29].id) && !loud.has(tracks[0].id))
  assert.equal(energeticIds(buildIndex(tracks.slice(0, 5))), null, 'too few measured')
})

test('daily mixes are built around the singers you play most', () => {
  const tracks = Array.from({ length: 24 }, (_, i) =>
    song({
      title: `T${i}`,
      artists: [i < 12 ? 'Karthik' : 'Anirudh'],
      album: `Film ${i % 4}`,
      albumId: `a_${String(i % 4).padStart(12, '0')}`,
    }),
  )
  const index = buildIndex(tracks)
  const played = tracks
    .filter((track) => track.artists[0] === 'Anirudh')
    .map((track) => ({ trackId: track.id, count: 5, lastAt: '2026-10-20T00:00:00.000Z' }))
  const mixes = dailyMixes(index, { ...empty, plays: played }, now)
  assert.equal(mixes[0].title, 'Daily Mix 1')
  assert.match(mixes[0].description, /^Anirudh/)
})

test('times are shown the way players show them', () => {
  assert.equal(formatTime(0), '0:00')
  assert.equal(formatTime(65.9), '1:05')
  assert.equal(formatTime(3725), '1:02:05')
  assert.equal(formatTime(Number.NaN), '0:00')
  assert.equal(formatLength(40), '1 min')
  assert.equal(formatLength(4000), '1 hr 7 min')
})

test('moods pick songs by loudness, length and name, and are steady within a day', () => {
  const tracks = Array.from({ length: 30 }, (_, i) =>
    song({ title: i === 3 ? 'Flute Theme' : `T${i}`, loudness: -30 + i, duration: 150 + i * 12 }),
  )
  const index = buildIndex(tracks)
  const energise = moodTracks(index, 'energise', now).map((track) => track.id)
  const relax = new Set(moodTracks(index, 'relax', now).map((track) => track.id))
  assert.ok(energise.includes(tracks[29].id) && !energise.includes(tracks[0].id), 'the loudest are energetic')
  assert.ok(relax.has(tracks[0].id) && !relax.has(tracks[29].id), 'the quietest are relaxing')
  assert.ok(moodTracks(index, 'commute', now).every((track) => track.duration >= 120 && track.duration <= 280))
  assert.ok(moodTracks(index, 'focus', now).some((track) => track.title === 'Flute Theme'))
  assert.deepEqual(
    moodTracks(index, 'energise', now).map((track) => track.id),
    energise,
  )
})
