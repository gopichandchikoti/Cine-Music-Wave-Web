export type MusicTrack = {
  id: string
  title: string
  /** The singers, one name each. */
  artists: string[]
  /** The film or album. */
  album: string
  albumId: string
  year: number | null
  track: number | null
  disc: number | null
  genre: string | null
  language: string | null
  /** Who acted in the film. */
  cast: string[]
  bpm: number | null
  duration: number
  format: string
  size: number
  cover: boolean
  lyrics: boolean
  addedAt: string
  /** Mean loudness in dB (louder is higher); null until measured. */
  loudness: number | null
}

export type PlayCount = { trackId: string; count: number; lastAt: string }
export type RecentPlay = { trackId: string; at: string }
export type CommunityEntry = { trackId: string; plays: number; listeners: number }
export type PlaylistSummary = {
  id: string
  name: string
  description: string
  trackCount: number
  updatedAt: string
  trackIds: string[]
}
export type RadioSeedKind = 'track' | 'artist' | 'album' | 'genre' | 'language'
export type SavedRadio = { id: string; seedKind: RadioSeedKind; seedValue: string; label: string; createdAt: string }

export type MusicState = {
  likes: string[]
  plays: PlayCount[]
  recent: RecentPlay[]
  playlists: PlaylistSummary[]
  radios: SavedRadio[]
  community: CommunityEntry[]
}

export type MusicLibraryResponse = {
  generatedAt: string
  /** Songs whose tags are still being read. */
  pending: number
  tracks: MusicTrack[]
  /** The films in the Watch library, so songs from them can be recommended. */
  films: { title: string; year: number | null }[]
  state: MusicState
}

export type LyricLine = { time: number; text: string }
export type Lyrics = { synced: LyricLine[] | null; plain: string | null; source: 'file' | 'tag' | null }

export type PlanResponse = {
  mode: 'direct' | 'remux' | 'transcode'
  reason: string
  start: number
  duration: number
  url: string
}

/** Where the queue came from, shown as "Playing from …". */
export type PlayContext = {
  kind: 'album' | 'playlist' | 'artist' | 'liked' | 'radio' | 'search' | 'library' | 'mix' | 'queue'
  id: string | null
  label: string
}
