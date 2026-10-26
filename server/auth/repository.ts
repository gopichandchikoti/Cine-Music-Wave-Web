import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { chmodSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PublicUser, SessionRow, UserRow } from './types.js'
const PRIVATE_FILE_MODE = 0o600
const PRIVATE_DIRECTORY_MODE = 0o700
export class AuthRepository {
  readonly db: DatabaseSync
  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: PRIVATE_DIRECTORY_MODE })
    this.db = new DatabaseSync(filename)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;')
    this.db.exec(readFileSync(new URL('./migrations.sql', import.meta.url), 'utf8'))
    // The file holds password hashes and session hashes: on a shared host only its owner may read it. (No effect on Windows.)
    if (filename !== ':memory:' && process.platform !== 'win32') chmodSync(filename, PRIVATE_FILE_MODE)
  }
  run(sql: string, ...values: SQLInputValue[]) {
    return this.db.prepare(sql).run(...values)
  }
  one<T>(sql: string, ...values: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...values) as T | undefined
  }
  all<T>(sql: string, ...values: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...values) as T[]
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = action()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  user(id: string) {
    return this.one<UserRow>('SELECT * FROM entertainment_users WHERE id=?', id)
  }
  byLogin(login: string) {
    return this.one<UserRow>(
      'SELECT * FROM entertainment_users WHERE email=? COLLATE NOCASE OR username=? COLLATE NOCASE',
      login,
      login,
    )
  }
  publicUser(user: UserRow): PublicUser {
    return {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      displayName: [user.first_name, user.last_name].filter(Boolean).join(' '),
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      phoneNumber: user.phone_number,
      avatarUrl: user.avatar_blob ? '/api/profile/avatar?updated=' + encodeURIComponent(user.updated_at) : null,
      providers: [
        ...(user.password_hash ? ['password'] : []),
        ...this.all<{ provider: string }>(
          'SELECT provider FROM entertainment_auth_identities WHERE user_id=? ORDER BY provider',
          user.id,
        ).map((row) => row.provider),
      ],
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
    }
  }
  createUser(
    input: {
      email: string
      username: string
      firstName: string
      lastName: string
      passwordHash: string | null
      verified: boolean
    },
    now = Date.now(),
  ): UserRow {
    const id = randomUUID(),
      date = new Date(now).toISOString()
    this.run(
      'INSERT INTO entertainment_users(id,email,username,first_name,last_name,password_hash,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      id,
      input.email,
      input.username,
      input.firstName,
      input.lastName,
      input.passwordHash,
      input.verified ? date : null,
      date,
      date,
    )
    this.run('INSERT INTO entertainment_auth_settings(user_id) VALUES(?)', id)
    this.audit(id, 'account_created', now)
    return this.user(id)!
  }
  audit(id: string | null, event: string, now = Date.now()) {
    this.run('INSERT INTO entertainment_auth_audit VALUES(?,?,?,?)', randomUUID(), id, event, now)
  }
  revokeAll(id: string, now = Date.now()) {
    this.run('UPDATE entertainment_auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now, id)
  }
  sessions(id: string, now = Date.now()) {
    return this.all<Pick<SessionRow, 'id' | 'created_at' | 'last_seen_at' | 'expires_at'>>(
      'SELECT id,created_at,last_seen_at,expires_at FROM entertainment_auth_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? AND last_seen_at>?',
      id,
      now,
      now - 12 * 3600000,
    )
  }
  cleanup(now = Date.now()) {
    this.run(
      'DELETE FROM entertainment_auth_sessions WHERE expires_at<? OR last_seen_at<? OR revoked_at IS NOT NULL',
      now,
      now - 12 * 3600000,
    )
    this.run('DELETE FROM entertainment_auth_tokens WHERE expires_at<? OR consumed_at IS NOT NULL', now)
    this.run('DELETE FROM entertainment_auth_audit WHERE created_at<?', now - 90 * 86400000)
  }
  close() {
    this.db.close()
  }
}
