import { AuthError } from './types.js'
export class AuthRateLimit {
  private rows = new Map<string, { count: number; until: number }>()
  constructor(
    readonly now = () => Date.now(),
    readonly limit = 15,
    readonly windowMs = 60000,
    readonly capacity = 5000,
  ) {}
  check(key: string) {
    const now = this.now()
    for (const [id, row] of this.rows) if (row.until <= now) this.rows.delete(id)
    let row = this.rows.get(key)
    if (!row) {
      if (this.rows.size >= this.capacity) throw new AuthError(503, 'AUTH_BUSY', 'Sign-in is busy. Try again shortly.')
      row = { count: 0, until: now + this.windowMs }
      this.rows.set(key, row)
    }
    if (++row.count > this.limit) throw new AuthError(429, 'AUTH_RATE_LIMIT', 'Too many attempts. Try again later.')
  }
}
