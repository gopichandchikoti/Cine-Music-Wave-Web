import type {
  CommunityEntry,
  MusicState,
  MusicTrack,
  PlaylistSummary,
  PlayCount,
  RadioSeedKind,
  RecentPlay,
  SavedRadio,
} from './musicTypes'

// Everything the music screens compute from the song list and the listener's history. It is all plain functions, so each rule
// (what counts as a "forgotten favourite", how a radio picks songs) can be tested without a browser.

export type Album = {
  id: string
  name: string
  year: number | null
  trackIds: string[]
  /** The singers on this album, most featured first. */
  artists: string[]
  cast: string[]
  language: string | null
  cover: boolean
  addedAt: string
  duration: number
}

export type Artist = { key: string; name: string; trackIds: string[]; albumIds: string[]; coverAlbumId: string | null }

export type LibraryIndex = {
  tracks: MusicTrack[]
  byId: Map<string, MusicTrack>
  albums: Album[]
  albumById: Map<string, Album>
  artists: Artist[]
  artistByKey: Map<string, Artist>
  languages: string[]
  genres: string[]
}

const DAY = 24 * 3600 * 1000

export const keyOf = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '')

const byDiscThenTrack = (left: MusicTrack, right: MusicTrack): number =>
  (left.disc ?? 1) - (right.disc ?? 1) || (left.track ?? 999) - (right.track ?? 999) || left.title.localeCompare(right.title)

const mostCommon = (values: string[]): string[] => {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value]) => value)
}

export function buildIndex(tracks: readonly MusicTrack[]): LibraryIndex {
  const byId = new Map(tracks.map((track) => [track.id, track]))
  const albumTracks = new Map<string, MusicTrack[]>()
  const artistTracks = new Map<string, { name: string; tracks: MusicTrack[] }>()
  for (const track of tracks) {
    albumTracks.set(track.albumId, [...(albumTracks.get(track.albumId) ?? []), track])
    for (const name of track.artists) {
      const entry = artistTracks.get(keyOf(name)) ?? { name, tracks: [] }
      entry.tracks.push(track)
      artistTracks.set(keyOf(name), entry)
    }
  }
  const albums: Album[] = [...albumTracks.entries()]
    .map(([id, list]) => {
      const ordered = [...list].sort(byDiscThenTrack)
      return {
        id,
        name: ordered[0].album,
        year: ordered.find((track) => track.year !== null)?.year ?? null,
        trackIds: ordered.map((track) => track.id),
        artists: mostCommon(ordered.flatMap((track) => track.artists)).slice(0, 6),
        cast: mostCommon(ordered.flatMap((track) => track.cast)).slice(0, 6),
        language: mostCommon(ordered.flatMap((track) => (track.language ? [track.language] : [])))[0] ?? null,
        cover: ordered.some((track) => track.cover),
        addedAt:
          ordered
            .map((track) => track.addedAt)
            .sort()
            .at(-1) ?? '',
        duration: ordered.reduce((sum, track) => sum + track.duration, 0),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
  const artists: Artist[] = [...artistTracks.entries()]
    .map(([key, entry]) => {
      const albumIds = [...new Set(entry.tracks.map((track) => track.albumId))]
      return {
        key,
        name: entry.name,
        trackIds: entry.tracks.map((track) => track.id),
        albumIds,
        coverAlbumId: entry.tracks.find((track) => track.cover)?.albumId ?? null,
      }
    })
    .sort((left, right) => right.trackIds.length - left.trackIds.length || left.name.localeCompare(right.name))
  return {
    tracks: [...tracks],
    byId,
    albums,
    albumById: new Map(albums.map((album) => [album.id, album])),
    artists,
    artistByKey: new Map(artists.map((artist) => [artist.key, artist])),
    languages: mostCommon(tracks.flatMap((track) => (track.language ? [track.language] : []))),
    genres: mostCommon(tracks.flatMap((track) => (track.genre ? [track.genre] : []))),
  }
}

// --- formatting --------------------------------------------------------------------------------------------------------------------

export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

export function formatLength(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`
}

/** "Karthik, Ramya Behara" for the line under a song title. */
export const artistLine = (track: MusicTrack): string => track.artists.join(', ')

/** A steady colour for things with no cover picture, so each album and artist still looks like itself. */
export function hueFor(text: string): number {
  let hash = 0
  for (const character of text) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return hash % 360
}

// --- randomness that repeats for the same day -----------------------------------------------------------------------------------

export function seededRandom(seed: string): () => number {
  let state = 0
  for (const character of seed) state = (state * 31 + character.codePointAt(0)!) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

export const dayKey = (now: Date): string => now.toISOString().slice(0, 10)

// --- search and filters ---------------------------------------------------------------------------------------------------------------

export type SearchFilters = {
  /** An artist's key (see keyOf). */
  artist?: string
  albumId?: string
  language?: string
  genre?: string
  year?: number
  liked?: boolean
}

export type SearchScope = 'all' | 'songs' | 'albums' | 'artists' | 'playlists'

export type SearchResults = { tracks: MusicTrack[]; albums: Album[]; artists: Artist[]; playlists: PlaylistSummary[] }

const normalise = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const matchesFilters = (track: MusicTrack, filters: SearchFilters, likes: ReadonlySet<string>): boolean =>
  (!filters.artist || track.artists.some((name) => keyOf(name) === filters.artist)) &&
  (!filters.albumId || track.albumId === filters.albumId) &&
  (!filters.language || track.language === filters.language) &&
  (!filters.genre || track.genre === filters.genre) &&
  (filters.year === undefined || track.year === filters.year) &&
  (!filters.liked || likes.has(track.id))

/** Songs, films (albums), singers and playlists that match every word typed, ranked by how directly they match. */
export function searchLibrary(
  index: LibraryIndex,
  query: string,
  options: { filters?: SearchFilters; likes?: ReadonlySet<string>; playlists?: readonly PlaylistSummary[]; limit?: number } = {},
): SearchResults {
  const filters = options.filters ?? {}
  const likes = options.likes ?? new Set<string>()
  const needle = normalise(query)
  const words = needle ? needle.split(' ') : []
  const limit = options.limit ?? 200
  const scored: { track: MusicTrack; score: number }[] = []
  for (const track of index.tracks) {
    if (!matchesFilters(track, filters, likes)) continue
    if (words.length === 0) {
      scored.push({ track, score: 0 })
      continue
    }
    const title = normalise(track.title)
    const singers = normalise(track.artists.join(' '))
    const album = normalise(track.album)
    const rest = normalise(`${track.cast.join(' ')} ${track.genre ?? ''} ${track.language ?? ''} ${track.year ?? ''}`)
    const haystack = `${title} ${singers} ${album} ${rest}`
    if (!words.every((word) => haystack.includes(word))) continue
    const score =
      title === needle
        ? 0
        : title.startsWith(needle)
          ? 1
          : title.includes(needle)
            ? 2
            : singers.includes(needle)
              ? 3
              : album.includes(needle)
                ? 4
                : 5
    scored.push({ track, score })
  }
  scored.sort((left, right) => left.score - right.score || left.track.title.localeCompare(right.track.title))
  const tracks = scored.slice(0, limit).map((entry) => entry.track)
  const filtered = Object.values(filters).some((value) => value !== undefined && value !== false && value !== '')
  const albums =
    words.length === 0 && !filtered
      ? []
      : index.albums.filter(
          (album) =>
            tracks.some((track) => track.albumId === album.id) &&
            words.every((word) =>
              normalise(`${album.name} ${album.cast.join(' ')} ${album.artists.join(' ')} ${album.year ?? ''}`).includes(word),
            ),
        )
  const artists =
    words.length === 0
      ? []
      : index.artists.filter((artist) => words.every((word) => normalise(artist.name).includes(word))).slice(0, 20)
  const playlists =
    words.length === 0
      ? []
      : (options.playlists ?? []).filter((playlist) => words.every((word) => normalise(playlist.name).includes(word)))
  return { tracks, albums: albums.slice(0, 40), artists, playlists }
}

/** How many songs each option would leave, so filter chips can show counts (and hide dead ends). */
export function facetCounts(
  index: LibraryIndex,
  filters: SearchFilters,
  likes: ReadonlySet<string>,
): { languages: [string, number][]; genres: [string, number][]; years: [number, number][] } {
  const withoutKey = (key: keyof SearchFilters): SearchFilters => ({ ...filters, [key]: undefined })
  const tally = <T>(key: keyof SearchFilters, pick: (track: MusicTrack) => T | null): [T, number][] => {
    const counts = new Map<T, number>()
    for (const track of index.tracks) {
      if (!matchesFilters(track, withoutKey(key), likes)) continue
      const value = pick(track)
      if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1])
  }
  return {
    languages: tally('language', (track) => track.language),
    genres: tally('genre', (track) => track.genre),
    years: tally('year', (track) => track.year).sort((left, right) => right[0] - left[0]),
  }
}

export const filterTracks = (index: LibraryIndex, filters: SearchFilters, likes: ReadonlySet<string>): MusicTrack[] =>
  index.tracks.filter((track) => matchesFilters(track, filters, likes))

// --- radio ---------------------------------------------------------------------------------------------------------------------------

export type RadioSeed = { kind: RadioSeedKind; value: string }

const similarity = (candidate: MusicTrack, seed: MusicTrack): number => {
  let score = 0
  if (candidate.albumId === seed.albumId) score += 4
  const seedArtists = new Set(seed.artists.map(keyOf))
  score += candidate.artists.filter((name) => seedArtists.has(keyOf(name))).length * 3
  if (candidate.language && candidate.language === seed.language) score += 1.5
  if (candidate.genre && candidate.genre === seed.genre) score += 1
  if (candidate.year !== null && seed.year !== null)
    score += Math.abs(candidate.year - seed.year) <= 2 ? 1.5 : Math.abs(candidate.year - seed.year) <= 5 ? 0.5 : 0
  const seedCast = new Set(seed.cast.map(keyOf))
  score += candidate.cast.some((name) => seedCast.has(keyOf(name))) ? 1 : 0
  return score
}

/**
 * Songs for an endless radio: the ones most like the seed, with enough chance mixed in that two radios from one song differ. The seed
 * is a song, a singer, a film (album), a genre or a language. Songs in `exclude` (already played or queued) are never repeated.
 */
export function radioTracks(
  index: LibraryIndex,
  seed: RadioSeed,
  options: { exclude?: ReadonlySet<string>; count: number; random: () => number; likes?: ReadonlySet<string> },
): MusicTrack[] {
  const exclude = options.exclude ?? new Set<string>()
  const likes = options.likes ?? new Set<string>()
  let seedTracks: MusicTrack[] = []
  if (seed.kind === 'track') {
    const track = index.byId.get(seed.value)
    seedTracks = track ? [track] : []
  } else if (seed.kind === 'artist')
    seedTracks = (index.artistByKey.get(keyOf(seed.value))?.trackIds ?? []).flatMap((id) => index.byId.get(id) ?? [])
  else if (seed.kind === 'album')
    seedTracks = (index.albumById.get(seed.value)?.trackIds ?? []).flatMap((id) => index.byId.get(id) ?? [])
  else if (seed.kind === 'genre') seedTracks = index.tracks.filter((track) => track.genre === seed.value)
  else seedTracks = index.tracks.filter((track) => track.language === seed.value)
  if (seedTracks.length === 0) return []
  const seedIds = new Set(seedTracks.map((track) => track.id))
  const wide = seed.kind === 'genre' || seed.kind === 'language'
  const scored = index.tracks
    .filter((track) => !exclude.has(track.id))
    .map((track) => {
      // The seed's own songs rank above anything merely similar (similarity tops out around 9 for a song by someone else).
      const base = wide
        ? seedIds.has(track.id)
          ? 6
          : 0
        : seedIds.has(track.id)
          ? 12
          : Math.max(...seedTracks.slice(0, 40).map((seedTrack) => similarity(track, seedTrack)))
      return { track, score: base + (likes.has(track.id) ? 0.5 : 0) + options.random() * 2.5 }
    })
    .filter((entry) => entry.score >= 1.5)
    .sort((left, right) => right.score - left.score)
  const picked = scored.slice(0, options.count).map((entry) => entry.track)
  // A radio from one song starts with that song.
  if (seed.kind === 'track' && !exclude.has(seedTracks[0].id)) {
    const first = seedTracks[0]
    return [first, ...picked.filter((track) => track.id !== first.id)].slice(0, options.count)
  }
  return picked
}

export const radioLabel = (index: LibraryIndex, seed: RadioSeed): string => {
  if (seed.kind === 'track') return `${index.byId.get(seed.value)?.title ?? 'Song'} Radio`
  if (seed.kind === 'album') return `${index.albumById.get(seed.value)?.name ?? 'Album'} Radio`
  return `${seed.value} Radio`
}

// --- the Home shelves --------------------------------------------------------------------------------------------------------------------

export type Tile =
  | { kind: 'album'; id: string }
  | { kind: 'artist'; key: string }
  | { kind: 'playlist'; id: string }
  | { kind: 'radio'; radio: SavedRadio }
  | { kind: 'liked' }
  | { kind: 'mix'; id: string }

export type Mix = { id: string; title: string; description: string; trackIds: string[]; albumIds: string[] }

export type Shelf =
  | { id: string; title: string; subtitle?: string; type: 'tiles'; tiles: Tile[] }
  | { id: string; title: string; subtitle?: string; type: 'tracks'; trackIds: string[] }
  | { id: string; title: string; subtitle?: string; type: 'albums'; albumIds: string[] }
  | { id: string; title: string; subtitle?: string; type: 'artists'; keys: string[] }
  | { id: string; title: string; subtitle?: string; type: 'mixes'; mixes: Mix[] }

export type ShelfInput = {
  index: LibraryIndex
  state: MusicState
  films: readonly { title: string; year: number | null }[]
  now: Date
}

const playsById = (plays: readonly PlayCount[]): Map<string, PlayCount> => new Map(plays.map((play) => [play.trackId, play]))

const pick = (ids: readonly string[], count: number, random: () => number): string[] => shuffled(ids, random).slice(0, count)

/** Roughly the louder third of the songs measured so far; null until enough have been measured to say. */
export function energeticIds(index: LibraryIndex): string[] | null {
  const measured = index.tracks.filter((track) => track.loudness !== null)
  if (measured.length < 12) return null
  const sorted = [...measured].sort((left, right) => right.loudness! - left.loudness!)
  return sorted.slice(0, Math.max(8, Math.ceil(sorted.length * 0.35))).map((track) => track.id)
}

const WORKOUT_WORDS = /\b(mass|dance|dj|remix|beat|party|rock|folk|item|power|fight|race|run)\b/i

export function dailyMixes(index: LibraryIndex, state: MusicState, now: Date): Mix[] {
  const random = seededRandom(`mix:${dayKey(now)}`)
  const played = playsById(state.plays)
  const likes = new Set(state.likes)
  const weight = (artistKey: string): number =>
    (index.artistByKey.get(artistKey)?.trackIds ?? []).reduce(
      (sum, id) => sum + (played.get(id)?.count ?? 0) * 2 + (likes.has(id) ? 3 : 0),
      0,
    )
  const seeds = [...index.artists]
    .sort((left, right) => weight(right.key) - weight(left.key) || right.trackIds.length - left.trackIds.length)
    .slice(0, 4)
  return seeds
    .map((artist, position) => {
      const trackIds = radioTracks(index, { kind: 'artist', value: artist.name }, { count: 30, random, likes }).map(
        (track) => track.id,
      )
      const albumIds = [
        ...new Set(trackIds.map((id) => index.byId.get(id)?.albumId).filter((id): id is string => Boolean(id))),
      ].slice(0, 4)
      const others = [
        ...new Set(trackIds.flatMap((id) => index.byId.get(id)?.artists ?? []).filter((name) => keyOf(name) !== artist.key)),
      ].slice(0, 3)
      return {
        id: `daily-${position + 1}`,
        title: `Daily Mix ${position + 1}`,
        description: [artist.name, ...others].join(', ') + ' and more',
        trackIds,
        albumIds,
      }
    })
    .filter((mix) => mix.trackIds.length >= 5)
}

/** The shelves on Home, in order. A shelf with nothing to show is left out, so the page never has empty rows. */
export function buildShelves({ index, state, films, now }: ShelfInput): Shelf[] {
  const shelves: Shelf[] = []
  if (index.tracks.length === 0) return shelves
  const random = seededRandom(`home:${dayKey(now)}`)
  const played = playsById(state.plays)
  const likes = new Set(state.likes)
  const nowMs = now.getTime()
  const ageDays = (iso: string): number => (nowMs - Date.parse(iso)) / DAY

  // Speed dial: the albums, singers, playlists and radios you reach for most.
  const tiles: Tile[] = []
  const seen = new Set<string>()
  const add = (tile: Tile, key: string): void => {
    if (!seen.has(key) && tiles.length < 9) {
      seen.add(key)
      tiles.push(tile)
    }
  }
  if (likes.size > 0) add({ kind: 'liked' }, 'liked')
  for (const recent of state.recent) {
    const track = index.byId.get(recent.trackId)
    if (track) add({ kind: 'album', id: track.albumId }, `album:${track.albumId}`)
  }
  for (const radio of state.radios.slice(0, 2)) add({ kind: 'radio', radio }, `radio:${radio.id}`)
  for (const playlist of state.playlists.slice(0, 3)) add({ kind: 'playlist', id: playlist.id }, `playlist:${playlist.id}`)
  for (const artist of index.artists.slice(0, 6)) add({ kind: 'artist', key: artist.key }, `artist:${artist.key}`)
  for (const album of index.albums) add({ kind: 'album', id: album.id }, `album:${album.id}`)
  shelves.push({ id: 'speed-dial', title: 'Speed dial', subtitle: 'Jump back in', type: 'tiles', tiles })

  const recentIds = state.recent.map((recent: RecentPlay) => recent.trackId).filter((id) => index.byId.has(id))
  if (recentIds.length > 0)
    shelves.push({ id: 'recent', title: 'Listen again', type: 'tracks', trackIds: recentIds.slice(0, 20) })

  // Quick picks: what you like and play, a few you have not heard, a different mix each day.
  const quick = [...index.tracks]
    .map((track) => {
      const count = played.get(track.id)?.count ?? 0
      return {
        id: track.id,
        score: (likes.has(track.id) ? 3 : 0) + Math.log2(count + 1) * 1.5 + (count === 0 ? 1 : 0) + random() * 2.5,
      }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 20)
    .map((entry) => entry.id)
  shelves.push({
    id: 'quick-picks',
    title: 'Quick picks',
    subtitle: 'Start a radio from any song',
    type: 'tracks',
    trackIds: quick,
  })

  // Forgotten favourites: songs you liked or played often and have not played for two weeks.
  const forgotten = index.tracks
    .filter((track) => {
      const play = played.get(track.id)
      const favourite = likes.has(track.id) || (play?.count ?? 0) >= 2
      return favourite && (!play || ageDays(play.lastAt) > 14)
    })
    .sort((left, right) => (played.get(right.id)?.count ?? 0) - (played.get(left.id)?.count ?? 0))
    .slice(0, 20)
    .map((track) => track.id)
  if (forgotten.length >= 3)
    shelves.push({
      id: 'forgotten',
      title: 'Forgotten favourites',
      subtitle: 'Songs you loved and have not played in a while',
      type: 'tracks',
      trackIds: forgotten,
    })

  const mixes = dailyMixes(index, state, now)
  if (mixes.length > 0)
    shelves.push({
      id: 'daily-mixes',
      title: 'Made for you',
      subtitle: 'Daily mixes that change every day',
      type: 'mixes',
      mixes,
    })

  const radioSuggestions = index.artists.slice(0, 3)
  if (state.radios.length > 0 || radioSuggestions.length > 0) {
    shelves.push({
      id: 'radios',
      title: 'Radio',
      subtitle: 'Endless music from a song, singer or film',
      type: 'tiles',
      tiles: [
        ...state.radios.map((radio): Tile => ({ kind: 'radio', radio })),
        ...radioSuggestions
          .filter((artist) => !state.radios.some((radio) => radio.seedKind === 'artist' && keyOf(radio.seedValue) === artist.key))
          .map(
            (artist): Tile => ({
              kind: 'radio',
              radio: {
                id: `suggested:${artist.key}`,
                seedKind: 'artist',
                seedValue: artist.name,
                label: `${artist.name} Radio`,
                createdAt: '',
              },
            }),
          ),
      ].slice(0, 8),
    })
  }

  // Commute: a mix of the shorter songs.
  const commute = pick(
    index.tracks.filter((track) => track.duration >= 120 && track.duration <= 280).map((track) => track.id),
    25,
    random,
  )
  if (commute.length >= 8)
    shelves.push({
      id: 'commute',
      title: 'Commute from your library',
      subtitle: 'Short songs for the ride',
      type: 'tracks',
      trackIds: commute,
    })

  // Workout: the louder songs, or those whose name or tempo says so.
  const loud = energeticIds(index)
  const workoutIds =
    loud ??
    index.tracks
      .filter((track) => (track.bpm ?? 0) >= 110 || WORKOUT_WORDS.test(`${track.title} ${track.genre ?? ''}`))
      .map((track) => track.id)
  const workout = pick(workoutIds, 25, random)
  if (workout.length >= 8)
    shelves.push({
      id: 'workout',
      title: 'Workout essentials',
      subtitle: loud ? 'The loudest, highest-energy songs' : 'Fast and powerful',
      type: 'tracks',
      trackIds: workout,
    })

  // Songs from films you also have to watch.
  const filmKeys = new Set(films.map((film) => keyOf(film.title)).filter((key) => key.length >= 3))
  const filmAlbums = index.albums.filter((album) => filmKeys.has(keyOf(album.name)))
  if (filmAlbums.length > 0)
    shelves.push({
      id: 'from-films',
      title: 'Music from videos for you',
      subtitle: 'Songs from films in your library',
      type: 'albums',
      albumIds: filmAlbums.map((album) => album.id),
    })

  // What the other accounts on this library play (only when more than one person listens).
  const community = state.community.filter((entry: CommunityEntry) => entry.listeners >= 2 && index.byId.has(entry.trackId))
  if (community.length >= 3)
    shelves.push({
      id: 'community',
      title: 'From the community',
      subtitle: 'Popular with everyone here',
      type: 'tracks',
      trackIds: community.slice(0, 20).map((entry) => entry.trackId),
    })

  // New releases: the newest films' albums first, then whatever arrived most recently.
  const newest = [...index.albums]
    .sort((left, right) => (right.year ?? 0) - (left.year ?? 0) || right.addedAt.localeCompare(left.addedAt))
    .slice(0, 14)
  if (newest.length > 0)
    shelves.push({
      id: 'new-releases',
      title: 'New releases',
      subtitle: 'The newest films in your library',
      type: 'albums',
      albumIds: newest.map((album) => album.id),
    })

  const topArtists = index.artists.filter((artist) => artist.trackIds.length >= 2).slice(0, 14)
  if (topArtists.length >= 3)
    shelves.push({
      id: 'artists',
      title: 'Singers you might like',
      type: 'artists',
      keys: topArtists.map((artist) => artist.key),
    })

  for (const language of index.languages.slice(0, 3)) {
    const ids = pick(
      index.tracks.filter((track) => track.language === language).map((track) => track.id),
      20,
      random,
    )
    if (ids.length >= 6) shelves.push({ id: `language:${language}`, title: `${language} songs`, type: 'tracks', trackIds: ids })
  }
  return shelves
}

// --- moods (the chips above Home, like YouTube Music's Energise / Relax / Workout / Commute / Focus) ------------------------------------

export type MoodId = 'energise' | 'relax' | 'workout' | 'commute' | 'focus'
export const MOODS: readonly MoodId[] = ['energise', 'relax', 'workout', 'commute', 'focus']

const FOCUS_WORDS = /\b(instrumental|bgm|theme|flute|violin|piano|santoor|veena|tones?|karaoke)\b/i

/** The songs for a mood, from how loud they are, how long, and what they are called. The same day always gives the same order. */
export function moodTracks(index: LibraryIndex, mood: MoodId, now: Date): MusicTrack[] {
  const random = seededRandom(`mood:${mood}:${dayKey(now)}`)
  const measured = index.tracks.filter((track) => track.loudness !== null)
  const loud = new Set(energeticIds(index) ?? [])
  const quiet = new Set(
    measured.length >= 12
      ? [...measured]
          .sort((left, right) => left.loudness! - right.loudness!)
          .slice(0, Math.max(8, Math.ceil(measured.length * 0.35)))
          .map((track) => track.id)
      : [],
  )
  let picked: MusicTrack[]
  if (mood === 'energise')
    picked = index.tracks.filter(
      (track) => loud.has(track.id) || (loud.size === 0 && ((track.bpm ?? 0) >= 110 || WORKOUT_WORDS.test(track.title))),
    )
  else if (mood === 'relax')
    picked = index.tracks.filter(
      (track) => quiet.has(track.id) || (quiet.size === 0 && track.duration >= 200 && !WORKOUT_WORDS.test(track.title)),
    )
  else if (mood === 'workout')
    picked = index.tracks.filter(
      (track) =>
        (loud.has(track.id) && track.duration < 330) ||
        (track.bpm ?? 0) >= 115 ||
        WORKOUT_WORDS.test(`${track.title} ${track.genre ?? ''}`),
    )
  else if (mood === 'commute') picked = index.tracks.filter((track) => track.duration >= 120 && track.duration <= 280)
  else
    picked = index.tracks.filter((track) => FOCUS_WORDS.test(track.title) || (quiet.has(track.id) && track.artists.length <= 1))
  return shuffled(picked, random)
}
