import { useState } from 'react'
import { artworkUrl } from './watchApi'
import type { WatchTitle } from './watchTypes'

type TitleArtProps = {
  title: WatchTitle
  /** `backdrop` is the wide 1280px frame; either size stands in for the other when only one exists. */
  kind: 'card' | 'backdrop'
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

/** The title's picture, or a green placeholder while the server is still making one. */
export function TitleArt({ title, kind }: TitleArtProps) {
  const other = kind === 'card' ? 'backdrop' : 'card'
  const available = title.art[kind] !== null ? kind : title.art[other] !== null ? other : null
  const version = available === null ? null : title.art[available]
  return available === null || version === null ? (
    <div className="watch-art-fallback" aria-hidden="true">
      <span>{initialsOf(title.title)}</span>
    </div>
  ) : (
    <ArtImage key={`${available}-${version}`} src={artworkUrl(title.id, available, version)} />
  )
}

// Keyed by version so a picture that failed once is tried again when the server finishes a new one.
function ArtImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <div className="watch-art-fallback" aria-hidden="true" />
  ) : (
    <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
  )
}
