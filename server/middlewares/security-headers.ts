import type { RequestHandler } from 'express'
import { contentSecurityPolicy } from '../auth/security-headers.js'
import type { ServerConfig } from '../config/index.js'

const HSTS_MAX_AGE_SECONDS = 31_536_000

/** Browser hardening headers for every response: CSP, no sniffing, no framing, strict referrers, locked-down features. */
export function securityHeaders(config: ServerConfig): RequestHandler {
  const policy = contentSecurityPolicy(config.accounts.production)
  return (_request, response, next) => {
    response.setHeader('Content-Security-Policy', policy)
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'SAMEORIGIN')
    response.setHeader('Referrer-Policy', 'same-origin')
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
    next()
  }
}

/** In production, every request except the health probe must arrive over HTTPS, and browsers are told to insist on it. */
export function requireHttps(config: ServerConfig): RequestHandler {
  return (request, response, next) => {
    if (!config.accounts.production) {
      next()
      return
    }
    response.setHeader('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE_SECONDS}`)
    if (!request.secure && request.path !== '/api/health') {
      response.status(426).json({ code: 'AUTH_HTTPS_REQUIRED', message: 'Use the configured HTTPS library address.' })
      return
    }
    next()
  }
}
