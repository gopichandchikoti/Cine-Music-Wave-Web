import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { AuthError } from './types.js'
const N = 131072,
  r = 8,
  p = 1
let active = 0
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (active >= 2) throw new AuthError(503, 'AUTH_BUSY', 'Sign-in is busy. Try again shortly.')
  active++
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(password, salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key))),
    )
  } finally {
    active--
  }
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await derive(password, salt)
  return ['scrypt', N, r, p, salt.toString('base64url'), hash.toString('base64url')].join('$')
}
const dummy = ['scrypt', N, r, p, Buffer.alloc(16, 7).toString('base64url'), Buffer.alloc(32).toString('base64url')].join('$')
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  const parts = (encoded ?? dummy).split('$')
  if (
    parts.length !== 6 ||
    parts[0] !== 'scrypt' ||
    Number(parts[1]) !== N ||
    Number(parts[2]) !== r ||
    Number(parts[3]) !== p ||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[4]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[5])
  )
    return false
  const actual = await derive(password, Buffer.from(parts[4], 'base64url')),
    expected = Buffer.from(parts[5], 'base64url')
  return timingSafeEqual(actual, expected) && encoded !== null
}
