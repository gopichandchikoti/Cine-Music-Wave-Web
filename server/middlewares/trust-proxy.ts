import { isIP } from 'node:net'
import type { Express } from 'express'

const MAX_PREFIX = { 4: 32, 6: 128 } as const

const isTrustedEntry = (value: string): boolean => {
  if (value === 'loopback') return true
  const [address, prefix] = value.split('/')
  const family = isIP(address)
  if (family !== 4 && family !== 6) return false
  return prefix === undefined || (/^\d+$/.test(prefix) && Number(prefix) <= MAX_PREFIX[family])
}

/**
 * Trusts forwarded headers only from the listed proxy addresses. A bare hop count is refused: it would let a client
 * pick its own address (and dodge rate limits) whenever the proxy does not overwrite the header.
 */
export function configureTrustProxy(app: Express, setting: string | undefined): void {
  if (!setting || setting === '0') return
  const entries = setting.split(',').map((value) => value.trim())
  if (!entries.every(isTrustedEntry)) {
    throw new Error('AUTH_TRUST_PROXY must list trusted proxy IPs/CIDRs or loopback, not a hop count.')
  }
  app.set('trust proxy', entries)
}
