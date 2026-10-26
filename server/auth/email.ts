import type { AuthConfig } from './config.js'
import { AuthError } from './types.js'
export type EmailDelivery = (to: string, purpose: 'email_verify' | 'password_reset', rawToken: string) => Promise<void>
export function emailDelivery(config: AuthConfig): EmailDelivery | undefined {
  if (!config.emailKey || !config.emailFrom) return undefined
  return async (to, purpose, rawToken) => {
    const link =
      config.origin + '/#' + (purpose === 'email_verify' ? 'verify-email' : 'reset-password') + '=' + encodeURIComponent(rawToken)
    let response: globalThis.Response
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + config.emailKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: config.emailFrom,
          to: [to],
          subject: purpose === 'email_verify' ? 'Verify your Cine Music Wave email' : 'Reset your Cine Music Wave password',
          text: 'Use this single-use link to continue: ' + link + '\nIf you did not request this, ignore this email.',
        }),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      })
    } catch {
      throw new AuthError(503, 'AUTH_EMAIL_UNAVAILABLE', 'Email delivery is unavailable. Try again later.')
    }
    if (!response.ok) throw new AuthError(503, 'AUTH_EMAIL_UNAVAILABLE', 'Email delivery is unavailable. Try again later.')
  }
}
