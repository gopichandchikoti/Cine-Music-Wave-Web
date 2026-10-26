import type { AuthRepository } from '../auth/repository.js'

export type ProgressEntry = {
  fileId: string
  titleId: string
  position: number
  duration: number
  completed: boolean
  updatedAt: string
}

type ProgressRow = {
  file_id: string
  title_id: string
  position: number
  duration: number
  completed: number
  updated_at: string
}

const MAX_ENTRIES_PER_USER = 2000
const MAX_LIST_ENTRIES = 500
const MAX_DURATION_SECONDS = 7 * 24 * 3600

/** Within the last 90 seconds, or past 95 percent, counts as watched, like the credits on a streaming service. */
export const isCompleted = (position: number, duration: number): boolean =>
  duration > 0 && (position / duration >= 0.95 || duration - position <= 90)

export class WatchStore {
  constructor(
    private readonly repository: AuthRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  progress(userId: string): ProgressEntry[] {
    return this.repository
      .all<ProgressRow>(
        'SELECT file_id,title_id,position,duration,completed,updated_at FROM entertainment_watch_progress WHERE user_id=? ORDER BY updated_at DESC LIMIT 600',
        userId,
      )
      .map((row) => ({
        fileId: row.file_id,
        titleId: row.title_id,
        position: row.position,
        duration: row.duration,
        completed: row.completed === 1,
        updatedAt: row.updated_at,
      }))
  }

  /** Returns false when the numbers cannot be a real playback position. */
  saveProgress(userId: string, fileId: string, titleId: string, position: number, duration: number): boolean {
    if (
      !Number.isFinite(position) ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > MAX_DURATION_SECONDS ||
      position < 0 ||
      position > duration + 5
    )
      return false
    const clamped = Math.min(position, duration)
    const completed = isCompleted(clamped, duration) ? 1 : 0
    this.repository.run(
      `INSERT INTO entertainment_watch_progress(user_id,file_id,title_id,position,duration,completed,updated_at) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(user_id,file_id) DO UPDATE SET title_id=excluded.title_id,position=excluded.position,duration=excluded.duration,completed=excluded.completed,updated_at=excluded.updated_at`,
      userId,
      fileId,
      titleId,
      clamped,
      duration,
      completed,
      this.now().toISOString(),
    )
    this.repository.run(
      'DELETE FROM entertainment_watch_progress WHERE user_id=? AND file_id NOT IN (SELECT file_id FROM entertainment_watch_progress WHERE user_id=? ORDER BY updated_at DESC LIMIT ?)',
      userId,
      userId,
      MAX_ENTRIES_PER_USER,
    )
    return true
  }

  clearProgress(userId: string, titleId: string): void {
    this.repository.run('DELETE FROM entertainment_watch_progress WHERE user_id=? AND title_id=?', userId, titleId)
  }

  list(userId: string): string[] {
    return this.repository
      .all<{ title_id: string }>('SELECT title_id FROM entertainment_watch_list WHERE user_id=? ORDER BY added_at DESC', userId)
      .map((row) => row.title_id)
  }

  addToList(userId: string, titleId: string): boolean {
    const count =
      this.repository.one<{ count: number }>('SELECT COUNT(*) AS count FROM entertainment_watch_list WHERE user_id=?', userId)
        ?.count ?? 0
    if (count >= MAX_LIST_ENTRIES) return false
    this.repository.run(
      'INSERT INTO entertainment_watch_list(user_id,title_id,added_at) VALUES(?,?,?) ON CONFLICT(user_id,title_id) DO NOTHING',
      userId,
      titleId,
      this.now().toISOString(),
    )
    return true
  }

  removeFromList(userId: string, titleId: string): void {
    this.repository.run('DELETE FROM entertainment_watch_list WHERE user_id=? AND title_id=?', userId, titleId)
  }
}
