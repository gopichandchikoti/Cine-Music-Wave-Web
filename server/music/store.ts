import { randomUUID } from 'node:crypto'
import type { AuthRepository } from '../auth/repository.js'

// Everything a listener keeps: likes, what they played, playlists and saved radios. Each row belongs to one account, and every query
// here is scoped to the account id the server took from the signed-in session, never from the request.

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
export type SavedRadio = { id: string; seedKind: RadioSeedKind; seedValue: string; label: string; createdAt: string }
export type RadioSeedKind = 'track' | 'artist' | 'album' | 'genre' | 'language'

export const RADIO_KINDS: readonly RadioSeedKind[] = ['track', 'artist', 'album', 'genre', 'language']
export const MAX_PLAYLISTS = 200
export const MAX_PLAYLIST_TRACKS = 5000
export const MAX_RADIOS = 100
const MAX_PLAYS_KEPT = 5000
const TRACK_ID = /^f_[0-9a-f]{12}$/

type PlaylistRow = { id: string; name: string; description: string; updated_at: string }

export const isTrackId = (value: unknown): value is string => typeof value === 'string' && TRACK_ID.test(value)

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

export class MusicStore {
  constructor(
    private readonly repository: AuthRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // --- likes -------------------------------------------------------------------------------------------------------------------

  likes(userId: string): string[] {
    return this.repository
      .all<{ track_id: string }>(
        'SELECT track_id FROM entertainment_music_likes WHERE user_id=? ORDER BY liked_at DESC LIMIT 5000',
        userId,
      )
      .map((row) => row.track_id)
  }

  like(userId: string, trackId: string): void {
    this.repository.run(
      'INSERT INTO entertainment_music_likes(user_id,track_id,liked_at) VALUES(?,?,?) ON CONFLICT(user_id,track_id) DO NOTHING',
      userId,
      trackId,
      this.now().toISOString(),
    )
  }

  unlike(userId: string, trackId: string): void {
    this.repository.run('DELETE FROM entertainment_music_likes WHERE user_id=? AND track_id=?', userId, trackId)
  }

  // --- listening history -------------------------------------------------------------------------------------------------------

  /** Records that a song was listened to (the player reports it after 30 seconds, or when the song ends). */
  recordPlay(userId: string, trackId: string, seconds: number, completed: boolean): boolean {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 24 * 3600) return false
    this.repository.run(
      'INSERT INTO entertainment_music_plays(user_id,track_id,played_at,seconds,completed) VALUES(?,?,?,?,?)',
      userId,
      trackId,
      this.now().toISOString(),
      seconds,
      completed ? 1 : 0,
    )
    this.repository.run(
      'DELETE FROM entertainment_music_plays WHERE user_id=? AND id NOT IN (SELECT id FROM entertainment_music_plays WHERE user_id=? ORDER BY played_at DESC, id DESC LIMIT ?)',
      userId,
      userId,
      MAX_PLAYS_KEPT,
    )
    return true
  }

  playCounts(userId: string): PlayCount[] {
    return this.repository
      .all<{ track_id: string; count: number; last_at: string }>(
        'SELECT track_id, COUNT(*) AS count, MAX(played_at) AS last_at FROM entertainment_music_plays WHERE user_id=? GROUP BY track_id ORDER BY last_at DESC LIMIT 2000',
        userId,
      )
      .map((row) => ({ trackId: row.track_id, count: row.count, lastAt: row.last_at }))
  }

  /** The songs played most recently, each once, newest first. */
  recent(userId: string, limit = 60): RecentPlay[] {
    return this.repository
      .all<{ track_id: string; at: string }>(
        'SELECT track_id, MAX(played_at) AS at FROM entertainment_music_plays WHERE user_id=? GROUP BY track_id ORDER BY at DESC LIMIT ?',
        userId,
        limit,
      )
      .map((row) => ({ trackId: row.track_id, at: row.at }))
  }

  /** What everyone with an account on this library plays most. Only totals are shared; no listener is identified. */
  community(limit = 60): CommunityEntry[] {
    return this.repository
      .all<{ track_id: string; plays: number; listeners: number }>(
        'SELECT track_id, COUNT(*) AS plays, COUNT(DISTINCT user_id) AS listeners FROM entertainment_music_plays GROUP BY track_id ORDER BY plays DESC, listeners DESC LIMIT ?',
        limit,
      )
      .map((row) => ({ trackId: row.track_id, plays: row.plays, listeners: row.listeners }))
  }

  // --- playlists ---------------------------------------------------------------------------------------------------------------

  private owned(userId: string, playlistId: string): PlaylistRow | undefined {
    return this.repository.one<PlaylistRow>(
      'SELECT id,name,description,updated_at FROM entertainment_music_playlists WHERE id=? AND user_id=?',
      playlistId,
      userId,
    )
  }

  private tracksOf(playlistId: string): string[] {
    return this.repository
      .all<{ track_id: string }>(
        'SELECT track_id FROM entertainment_music_playlist_tracks WHERE playlist_id=? ORDER BY position',
        playlistId,
      )
      .map((row) => row.track_id)
  }

  private summarise(row: PlaylistRow): PlaylistSummary {
    const trackIds = this.tracksOf(row.id)
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      trackCount: trackIds.length,
      updatedAt: row.updated_at,
      trackIds,
    }
  }

  playlists(userId: string): PlaylistSummary[] {
    return this.repository
      .all<PlaylistRow>(
        'SELECT id,name,description,updated_at FROM entertainment_music_playlists WHERE user_id=? ORDER BY updated_at DESC',
        userId,
      )
      .map((row) => this.summarise(row))
  }

  /** Null when the name is empty or the account already has the maximum number of playlists. */
  createPlaylist(userId: string, name: unknown, trackIds: readonly string[] = []): PlaylistSummary | null {
    const title = clean(name, 80)
    const count =
      this.repository.one<{ count: number }>(
        'SELECT COUNT(*) AS count FROM entertainment_music_playlists WHERE user_id=?',
        userId,
      )?.count ?? 0
    if (!title || count >= MAX_PLAYLISTS) return null
    const id = randomUUID()
    const stamp = this.now().toISOString()
    this.repository.transaction(() => {
      this.repository.run(
        'INSERT INTO entertainment_music_playlists(id,user_id,name,description,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        id,
        userId,
        title,
        '',
        stamp,
        stamp,
      )
      this.writeTracks(id, trackIds.slice(0, MAX_PLAYLIST_TRACKS), stamp)
    })
    return this.summarise(this.owned(userId, id)!)
  }

  updatePlaylist(userId: string, playlistId: string, changes: { name?: unknown; description?: unknown }): PlaylistSummary | null {
    const row = this.owned(userId, playlistId)
    if (!row) return null
    const name = changes.name === undefined ? row.name : clean(changes.name, 80)
    if (!name) return null
    const description = changes.description === undefined ? row.description : clean(changes.description, 300)
    this.repository.run(
      'UPDATE entertainment_music_playlists SET name=?, description=?, updated_at=? WHERE id=? AND user_id=?',
      name,
      description,
      this.now().toISOString(),
      playlistId,
      userId,
    )
    return this.summarise(this.owned(userId, playlistId)!)
  }

  deletePlaylist(userId: string, playlistId: string): boolean {
    if (!this.owned(userId, playlistId)) return false
    this.repository.run('DELETE FROM entertainment_music_playlists WHERE id=? AND user_id=?', playlistId, userId)
    return true
  }

  private writeTracks(playlistId: string, trackIds: readonly string[], stamp: string): void {
    this.repository.run('DELETE FROM entertainment_music_playlist_tracks WHERE playlist_id=?', playlistId)
    trackIds.forEach((trackId, position) =>
      this.repository.run(
        'INSERT INTO entertainment_music_playlist_tracks(playlist_id,position,track_id,added_at) VALUES(?,?,?,?)',
        playlistId,
        position,
        trackId,
        stamp,
      ),
    )
  }

  /** Replaces a playlist's songs with this exact list, which is how removing and re-ordering are saved. */
  setTracks(userId: string, playlistId: string, trackIds: readonly string[]): PlaylistSummary | null {
    if (!this.owned(userId, playlistId) || trackIds.length > MAX_PLAYLIST_TRACKS) return null
    const stamp = this.now().toISOString()
    this.repository.transaction(() => {
      this.writeTracks(playlistId, trackIds, stamp)
      this.repository.run('UPDATE entertainment_music_playlists SET updated_at=? WHERE id=?', stamp, playlistId)
    })
    return this.summarise(this.owned(userId, playlistId)!)
  }

  addTracks(userId: string, playlistId: string, trackIds: readonly string[]): PlaylistSummary | null {
    const row = this.owned(userId, playlistId)
    if (!row) return null
    const existing = this.tracksOf(playlistId)
    if (existing.length + trackIds.length > MAX_PLAYLIST_TRACKS) return null
    return this.setTracks(userId, playlistId, [...existing, ...trackIds])
  }

  // --- saved radios ------------------------------------------------------------------------------------------------------------

  radios(userId: string): SavedRadio[] {
    return this.repository
      .all<{ id: string; seed_kind: RadioSeedKind; seed_value: string; label: string; created_at: string }>(
        'SELECT id,seed_kind,seed_value,label,created_at FROM entertainment_music_radios WHERE user_id=? ORDER BY created_at DESC',
        userId,
      )
      .map((row) => ({
        id: row.id,
        seedKind: row.seed_kind,
        seedValue: row.seed_value,
        label: row.label,
        createdAt: row.created_at,
      }))
  }

  addRadio(userId: string, seedKind: unknown, seedValue: unknown, label: unknown): SavedRadio | null {
    const kind = RADIO_KINDS.find((candidate) => candidate === seedKind)
    const value = clean(seedValue, 120)
    const name = clean(label, 80)
    const existing = this.radios(userId)
    if (!kind || !value || !name || existing.length >= MAX_RADIOS) return null
    const duplicate = existing.find((radio) => radio.seedKind === kind && radio.seedValue === value)
    if (duplicate) return duplicate
    const id = randomUUID()
    this.repository.run(
      'INSERT INTO entertainment_music_radios(id,user_id,seed_kind,seed_value,label,created_at) VALUES(?,?,?,?,?,?)',
      id,
      userId,
      kind,
      value,
      name,
      this.now().toISOString(),
    )
    return this.radios(userId).find((radio) => radio.id === id) ?? null
  }

  removeRadio(userId: string, radioId: string): boolean {
    const result = this.repository.run('DELETE FROM entertainment_music_radios WHERE id=? AND user_id=?', radioId, userId)
    return Number(result.changes) > 0
  }
}
