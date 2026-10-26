import { content as copy } from '../content.js'
import { documentPath } from '../routes'
import { Link } from './Link'

/**
 * Links to the two public documents. `inline` places them at the end of an existing line of text, so adding them
 * never changes the height of the screen they appear on.
 */
export function SiteFooter({ inline = false }: { inline?: boolean }) {
  const links = (
    <>
      <Link to={documentPath('privacy')}>{copy.common.privacy}</Link>
      <Link to={documentPath('terms')}>{copy.common.terms}</Link>
    </>
  )
  if (inline) {
    return (
      <nav className="site-footer is-inline" aria-label={copy.legal.navLabel}>
        {links}
      </nav>
    )
  }
  return (
    <footer className="site-footer">
      <nav aria-label={copy.legal.navLabel}>{links}</nav>
    </footer>
  )
}
