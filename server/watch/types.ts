export type StreamKind = 'video' | 'audio'

export type ProbedVideo = {
  index: number
  codec: string
  profile: string | null
  width: number
  height: number
  pixFmt: string | null
  bitDepth: number
  fps: number | null
  hdr: boolean
}

export type ProbedAudio = {
  ordinal: number
  index: number
  codec: string
  channels: number
  language: string | null
  label: string
  default: boolean
}

export type ProbedSubtitle = {
  ordinal: number
  index: number
  codec: string
  language: string | null
  label: string
  default: boolean
  text: boolean
}

/** What a song file says about itself. Values are exactly as tagged, junk included; the music library cleans them. */
export type ProbedTags = {
  title: string | null
  artist: string | null
  albumArtist: string | null
  album: string | null
  genre: string | null
  date: string | null
  track: string | null
  disc: string | null
  composer: string | null
  language: string | null
  bpm: number | null
  hasLyrics: boolean
}

/** Bumped whenever the probe learns something new, so older catalog entries are read again once. */
export const PROBE_VERSION = 2

export type ProbeSummary = {
  duration: number
  container: string
  video: ProbedVideo | null
  audio: ProbedAudio[]
  subtitles: ProbedSubtitle[]
  /** Which version of the probe produced this entry (absent in catalogs written before versions existed). */
  version?: number
  /** Song tags; null when the file has none. */
  tags?: ProbedTags | null
  /** The embedded cover picture, when there is one. */
  cover?: { index: number } | null
}

/** The picture inside any black bars, as fractions (0 to 1) of the full frame. */
export type ContentRect = { x: number; y: number; w: number; h: number }

export type CatalogFile = {
  id: string
  /** POSIX path relative to the media root. Never sent to the browser. */
  path: string
  size: number
  modifiedAt: string
  season: number | null
  episode: number | null
  episodeTitle: string | null
  /** Set when ffprobe could not read the file (for example an interrupted download). */
  unreadable?: string
  probe: ProbeSummary | null
  /** Sidecar .vtt files next to the video. */
  sidecarSubtitles: { language: string; label: string; path: string }[]
  /** Where the real picture sits inside baked-in black bars. Undefined until measured; null when the frame has no bars. */
  contentRect?: ContentRect | null
  missing?: boolean
}

export type CatalogTitle = {
  id: string
  /** Grouping key (kind + normalised title + year) that lets a rescan attach new files to a title the user renamed. */
  key: string
  kind: 'movie' | 'series' | 'album'
  title: string
  year: number | null
  overview: string
  genres: string[]
  languages: string[]
  rating: string | null
  /** Optional images placed under the catalog folder, for example "custom/do-patti.jpg". Overrides generated art. */
  poster: string | null
  backdrop: string | null
  addedAt: string
  files: CatalogFile[]
}

export type Catalog = {
  version: 1
  updatedAt: string
  titles: CatalogTitle[]
}

export type ClientCapabilities = {
  containers: ReadonlySet<string>
  video: ReadonlySet<string>
  audio: ReadonlySet<string>
}

export type PlaybackMode = 'direct' | 'remux' | 'transcode'
export type OutputContainer = 'mp4' | 'webm'

export type PlaybackPlan = {
  mode: PlaybackMode
  videoCodec: 'copy' | 'h264' | 'vp9'
  audioCodec: 'copy' | 'aac' | 'opus'
  container: OutputContainer | 'original'
  reason: string
}

export type PlaybackProfile = 'auto' | 'direct' | 'remux' | 'h264' | 'webm'
