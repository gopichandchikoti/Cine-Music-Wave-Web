import { Link } from '../components/Link'
import { content as copy } from '../content.js'
import { modePath } from '../routes'

/** Shown for any address the app does not know. */
export function NotFoundPage() {
  return (
    <div className="legal-shell">
      <main className="legal-body" id="main">
        <h1>{copy.app.notFoundTitle}</h1>
        <p>{copy.app.notFoundText}</p>
        <p>
          <Link to={modePath('watch')}>{copy.app.notFoundAction}</Link>
        </p>
      </main>
    </div>
  )
}
