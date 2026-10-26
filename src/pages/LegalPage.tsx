import { content as copy, formatContent } from '../content.js'
import { Link } from '../components/Link'
import { documentPath, modePath } from '../routes'

type LegalDocument = {
  title: string
  intro: string
  sections: { heading: string; paragraphs: string[] }[]
}

type LegalPageProps = { document: 'privacy' | 'terms' }

/** The privacy policy and terms of use. Both are public: no account is needed to read them. */
export function LegalPage({ document }: LegalPageProps) {
  const text: LegalDocument = copy.legal[document]
  const other = document === 'privacy' ? 'terms' : 'privacy'
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <Link to={modePath('watch')} className="legal-back">
          {copy.legal.back}
        </Link>
        <nav aria-label={copy.legal.navLabel} className="legal-switch">
          <Link to={documentPath(other)}>{other === 'privacy' ? copy.common.privacy : copy.common.terms}</Link>
        </nav>
      </header>
      <main className="legal-body" id="main">
        <h1>{text.title}</h1>
        <p className="legal-updated">{formatContent(copy.legal.updated, { date: copy.legal.updatedOn })}</p>
        <p>{text.intro}</p>
        {text.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </main>
    </div>
  )
}
