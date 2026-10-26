import { createContext, useContext } from 'react'
import type { RadioSeed, SearchFilters, SearchScope } from './musicModel'

/** The pages of the music screen. */
export type MusicRoute =
  | { page: 'home' }
  | { page: 'search'; query?: string; scope?: SearchScope; filters?: SearchFilters }
  | { page: 'library'; tab?: 'all' | 'playlists' | 'albums' | 'artists' | 'songs' | 'radios' }
  | { page: 'album'; id: string }
  | { page: 'artist'; key: string }
  | { page: 'playlist'; id: string }
  | { page: 'liked' }
  | { page: 'mix'; id: string }
  | { page: 'mood'; id: string }

/**
 * What a "…" menu was opened from, so it can offer "Remove from this playlist" or "Remove from queue", or, on a singer's or film's
 * page, "Start radio" for that singer or film.
 */
export type MenuSource = {
  playlistId?: string
  playlistPosition?: number
  queuePosition?: number
  radio?: { seed: RadioSeed; label: string }
}

export type MusicNav = {
  route: MusicRoute
  go: (route: MusicRoute) => void
  back: () => void
  canGoBack: boolean
  /** Opens the "…" menu for one or more songs, anchored to the button that was pressed. */
  openMenu: (trackIds: readonly string[], anchor: HTMLElement, source?: MenuSource) => void
  /** Asks which playlist to add songs to (or to make a new one). */
  pickPlaylist: (trackIds: readonly string[]) => void
  /** Whether the screen is laid out like a phone app (bottom tabs, full-width sheets). */
  compact: boolean
}

export const MusicNavContext = createContext<MusicNav | null>(null)

export function useMusicNav(): MusicNav {
  const value = useContext(MusicNavContext)
  if (!value) throw new Error('useMusicNav must be used inside the music screen.')
  return value
}
