import { formatLength } from './musicModel'
import type { MusicTrack } from './musicTypes'

/** The covers (up to four, one per album) of some songs, for a mosaic. */
export function coversOf(tracks: readonly MusicTrack[]): { albumId: string; cover: boolean; label: string }[] {
  const seen = new Set<string>()
  const covers: { albumId: string; cover: boolean; label: string }[] = []
  for (const track of tracks) {
    if (seen.has(track.albumId)) continue
    seen.add(track.albumId)
    covers.push({ albumId: track.albumId, cover: track.cover, label: track.album })
    if (covers.length === 4) break
  }
  return covers
}

/** "42 min" or "1 hr 7 min" for the songs together. */
export const lengthOf = (tracks: readonly MusicTrack[]): string =>
  formatLength(tracks.reduce((sum, track) => sum + track.duration, 0))

/** A short sentence describing the filters in force ("Karthik · Jyo Achyutananda · 2016"). */
export function describeFilters(
  filters: { artist?: string; albumId?: string; language?: string; genre?: string; year?: number; liked?: boolean },
  nameOf: { artist: (key: string) => string | undefined; album: (id: string) => string | undefined },
  likedLabel: string,
): string {
  const parts: string[] = []
  if (filters.artist) parts.push(nameOf.artist(filters.artist) ?? filters.artist)
  if (filters.albumId) parts.push(nameOf.album(filters.albumId) ?? '')
  if (filters.language) parts.push(filters.language)
  if (filters.genre) parts.push(filters.genre)
  if (filters.year !== undefined) parts.push(String(filters.year))
  if (filters.liked) parts.push(likedLabel)
  return parts.filter(Boolean).join(' · ')
}
