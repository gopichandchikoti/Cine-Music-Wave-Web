export type WatchKind = 'movie' | 'series' | 'album'
export type Resolution = 'SD' | 'HD' | '4K'

export type AudioTrack = { ordinal: number; label: string; language: string | null; default: boolean }
export type SubtitleOption = { ordinal: number; label: string; language: string | null; default: boolean }

export type WatchFile = {
  id: string
  season: number | null
  episode: number | null
  title: string | null
  duration: number | null
  quality: Resolution | null
  height: number | null
  hdr: boolean
  audio: AudioTrack[]
  subtitles: SubtitleOption[]
  probed: boolean
  /** Version of the episode still, or null while it is still being generated. */
  thumb: number | null
}

export type WatchTitle = {
  id: string
  kind: WatchKind
  title: string
  year: number | null
  overview: string
  genres: string[]
  languages: string[]
  rating: string | null
  addedAt: string
  art: { card: number | null; backdrop: number | null }
  files: WatchFile[]
}

export type ProgressEntry = {
  fileId: string
  titleId: string
  position: number
  duration: number
  completed: boolean
  updatedAt: string
}

export type LibraryStatus = { scanning: boolean; probing: number; artwork: number; streams: number }

export type CatalogResponse = {
  generatedAt: string
  media: { available: boolean; version: string | null }
  status: LibraryStatus
  titles: WatchTitle[]
  progress: ProgressEntry[]
  list: string[]
}

export type PlaybackMode = 'direct' | 'remux' | 'transcode'

export type PlanResponse = {
  mode: PlaybackMode
  reason: string
  container: string
  videoCodec: string
  audioCodec: string
  start: number
  duration: number
  url: string
}

export type RescanResult = { added: number; removed: number; titles: number; skipped: { path: string; reason: string }[] }

export type Diagnostics = {
  media: { available: boolean; version?: string; hardwareEncoder?: boolean }
  status: LibraryStatus
  titles: number
  files: number
  unreadable: { title: string; name: string; reason: string }[]
  skipped: { path: string; reason: string }[]
}

/** A title together with the one file the viewer would play next. */
export type PlayTarget = { title: WatchTitle; file: WatchFile; startAt: number }
