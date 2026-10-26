import { domainToASCII } from 'node:url'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { AuthError } from './types.js'
export const invalid = (message = 'Check the supplied fields.') => new AuthError(400, 'AUTH_INVALID_INPUT', message)
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}
export function text(value: unknown, min: number, max: number): string {
  if (
    typeof value !== 'string' ||
    value.length < min ||
    value.length > max ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw invalid()
  return value
}
export function email(value: unknown): string {
  const input = text(value, 3, 254).trim().normalize('NFC').toLowerCase()
  const parts = input.split('@')
  if (
    parts.length !== 2 ||
    !/^[a-z0-9.!#$%&'*+/=?^_{|}~-]{1,64}$/.test(parts[0]) ||
    parts[0].startsWith('.') ||
    parts[0].endsWith('.') ||
    parts[0].includes('..')
  )
    throw invalid('Enter a valid email address.')
  const domain = domainToASCII(parts[1])
  if (
    !domain ||
    domain.length > 253 ||
    !domain.includes('.') ||
    !domain.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))
  )
    throw invalid('Enter a valid email address.')
  return parts[0] + '@' + domain
}
const reserved = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'system',
  'api',
  'auth',
  'settings',
  'profile',
  'moderator',
  'undefined',
  'null',
])
export function username(value: unknown): string {
  const name = text(value, 3, 24).trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(name) || reserved.has(name))
    throw invalid('Use 3–24 lowercase letters, numbers, or underscores, starting with a letter.')
  return name
}
export function name(value: unknown): string {
  const result = text(value, 1, 50).trim().normalize('NFC')
  if (!result || !/^[\p{L}\p{M}\p{N} .'-]+$/u.test(result))
    throw invalid('Enter a name using letters, spaces, or name punctuation.')
  return result
}
// Well-known long passwords, written the way `simplified` reduces a password: lower case letters and digits only.
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'passwordpassword',
  'password12345678',
  'password123456789',
  'passwordpassword1',
  'iloveyouiloveyou',
  'letmeinletmein123',
  'welcomewelcome123',
  'administrator1234',
  'qwertyuiop123456',
  'qwertyuiopasdfgh',
  'correcthorsebatterystaple',
  'thequickbrownfoxjumpsoverthelazydog',
  'trustno1trustno1trustno1',
])
// A password that is only a stretch of one of these is a keyboard or counting pattern, not a secret.
const PATTERN_RUNS = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890123456789',
  'qwertyuiopasdfghjklzxcvbnm',
  'zyxwvutsrqponmlkjihgfedcba',
]
const MIN_DISTINCT_CHARACTERS = 6
const MIN_AVOIDED_TERM = 4
const simplified = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')
function isGuessable(value: string, avoid: readonly string[]): boolean {
  const reduced = simplified(value)
  if (new Set(reduced).size < MIN_DISTINCT_CHARACTERS || COMMON_PASSWORDS.has(reduced)) return true
  if (PATTERN_RUNS.some((run) => run.includes(reduced))) return true
  return avoid.map(simplified).some((term) => term.length >= MIN_AVOIDED_TERM && reduced.includes(term))
}
/**
 * A password of 15–128 characters that is not an obvious one. `avoid` is the person's own username and email name,
 * which a password must not contain. This is a local sanity check, not a breached-password lookup.
 */
export function password(value: unknown, avoid: readonly string[] = []): string {
  if (
    typeof value !== 'string' ||
    value.length < 15 ||
    value.length > 128 ||
    Buffer.byteLength(value, 'utf8') > 512 ||
    value.includes('\0')
  )
    throw invalid('Use a password of 15–128 characters.')
  if (isGuessable(value, avoid))
    throw invalid('Choose a less guessable password: avoid repeated characters, common phrases and your own name or email.')
  return value
}
export function phone(value: unknown): string | null {
  if (value === null || value === '') return null
  const input = text(value, 8, 25)
  if (!input.startsWith('+')) throw invalid('Include the phone country code, such as +44.')
  const parsed = parsePhoneNumberFromString(input)
  if (!parsed?.isValid()) throw invalid('Enter a valid phone number with country code.')
  return parsed.number
}
export function loginIdentifier(value: unknown): string {
  const input = text(value, 3, 254).trim().normalize('NFC').toLowerCase()
  return input.includes('@') ? email(input) : username(input)
}
export function token(value: unknown): string {
  const result = text(value, 43, 43)
  if (!/^[A-Za-z0-9_-]{43}$/.test(result)) throw invalid()
  return result
}
