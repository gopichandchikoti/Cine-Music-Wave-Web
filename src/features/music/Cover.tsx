import { useState, type CSSProperties } from 'react'
import { coverUrl } from './musicApi'
import { hueFor } from './musicModel'

const initialsOf = (label: string): string =>
  label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

type CoverProps = {
  albumId: string
  /** Whether the album has a picture; when it does not (or the picture fails to load) a coloured tile with initials is shown. */
  cover: boolean
  label: string
  className?: string
}

/** An album cover: the picture from the song files, or a tile whose colour comes from the name, so every album still looks like itself. */
export function Cover({ albumId, cover, label, className = '' }: CoverProps) {
  return (
    <div className={`music-cover ${className}`} style={{ '--hue': hueFor(label) } as CSSProperties}>
      {cover ? (
        <CoverImage key={albumId} albumId={albumId} label={label} />
      ) : (
        <span className="music-cover-initials" aria-hidden="true">
          {initialsOf(label)}
        </span>
      )}
    </div>
  )
}

function CoverImage({ albumId, label }: { albumId: string; label: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <span className="music-cover-initials" aria-hidden="true">
      {initialsOf(label)}
    </span>
  ) : (
    <img src={coverUrl(albumId)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
  )
}

type MosaicProps = { covers: readonly { albumId: string; cover: boolean; label: string }[]; label: string; className?: string }

/** Up to four covers in a square, for playlists and mixes. Two or three covers repeat so the square is always full. */
export function Mosaic({ covers, label, className = '' }: MosaicProps) {
  if (covers.length < 2)
    return covers[0] ? (
      <Cover {...covers[0]} className={className} />
    ) : (
      <Cover albumId="" cover={false} label={label} className={className} />
    )
  const cells =
    covers.length >= 4
      ? covers.slice(0, 4)
      : covers.length === 3
        ? [...covers, covers[0]]
        : [covers[0], covers[1], covers[1], covers[0]]
  return (
    <div className={`music-mosaic ${className}`}>
      {cells.map((item, position) => (
        <Cover key={`${item.albumId}:${position}`} {...item} />
      ))}
    </div>
  )
}
