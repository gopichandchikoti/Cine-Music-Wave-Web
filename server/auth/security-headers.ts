export function contentSecurityPolicy(production: boolean): string {
  return (
    "default-src 'self'; script-src 'self'" +
    (production ? '' : " 'unsafe-eval'") +
    "; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'" +
    (production ? '' : ' ws://localhost:4444 ws://127.0.0.1:4444') +
    "; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'"
  )
}
export const activeDocumentPolicy =
  "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"
export const isActiveDocument = (value: string) => /\.(?:svg|html?|xml|xhtml)$/i.test(value)
