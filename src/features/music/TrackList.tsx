import { useState } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { useMusic } from './musicContext'
import type { MenuSource } from './musicNav'
import type { MusicTrack, PlayContext } from './musicTypes'
import { TrackRow } from './TrackRow'

const t = copy.musicView
const PAGE = 200

type TrackListProps = {
  tracks: readonly MusicTrack[]
  context: PlayContext
  /** Show 1, 2, 3 … instead of covers (albums). */
  numbered?: boolean
  showAlbum?: boolean
  source?: MenuSource
  /** Covers start at the left edge, with no number column. */
  flush?: boolean
}

/** A list of songs. Pressing one plays the whole list from it, so what comes next is the rest of the list. */
export function TrackList({ tracks, context, numbered = false, showAlbum = true, source, flush = false }: TrackListProps) {
  const music = useMusic()
  const [shown, setShown] = useState(PAGE)
  const visible = tracks.slice(0, shown)
  const ids = tracks.map((track) => track.id)
  return (
    <>
      <ul className="music-list">
        {visible.map((track, position) => (
          <TrackRow
            key={`${track.id}:${position}`}
            track={track}
            number={numbered ? (track.track ?? position + 1) : undefined}
            showCover={!numbered}
            showAlbum={showAlbum}
            source={source}
            flush={flush}
            onPlay={() => music.playTracks(ids, { start: position, context })}
          />
        ))}
      </ul>
      {tracks.length > shown && (
        <button className="music-pill music-show-more" type="button" onClick={() => setShown(shown + PAGE)}>
          {formatContent(t.showMore, { count: tracks.length - shown })}
        </button>
      )}
    </>
  )
}
