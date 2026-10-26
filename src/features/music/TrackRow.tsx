import { Ellipsis, GripVertical, Heart, Play, X } from '../../components/icons'
import type { CSSProperties, HTMLAttributes, Ref } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { Cover } from './Cover'
import { useMusic } from './musicContext'
import { artistLine, formatTime } from './musicModel'
import type { MenuSource } from './musicNav'
import { useMusicNav } from './musicNav'
import type { MusicTrack } from './musicTypes'

const t = copy.musicView

/** Three bars that dance while a song plays. */
export function Equalizer({ paused }: { paused: boolean }) {
  return (
    <span className={`music-eq ${paused ? 'is-paused' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

type TrackRowProps = {
  track: MusicTrack
  /** The song's number in the list; shown instead of the cover when the list is an album. */
  number?: number
  showAlbum?: boolean
  showCover?: boolean
  source?: MenuSource
  onPlay: () => void
  /** A visible "remove" button (used in the queue). */
  onRemove?: () => void
  /** Drag handle, when the list can be re-ordered. */
  handle?: HTMLAttributes<HTMLElement>
  rowRef?: Ref<HTMLLIElement>
  style?: CSSProperties
  dragging?: boolean
  /** Marks the song that is playing even when it appears more than once in the list. */
  current?: boolean
  /** A song that has already played (dimmed in the queue). */
  past?: boolean
  /** The line under the title, when it should not be the singers. */
  subtitle?: string
  /** A hairline under the row, starting after the cover. */
  divider?: boolean
  /** No number column: the cover starts at the left edge (a playing song still shows its bars there). */
  flush?: boolean
}

/** One song in a list: play it, like it, open its menu, and (in the queue and in playlists) drag it to a new place. */
export function TrackRow({
  track,
  number,
  showAlbum = true,
  showCover = true,
  source,
  onPlay,
  onRemove,
  handle,
  rowRef,
  style,
  dragging = false,
  current,
  past = false,
  subtitle,
  divider = false,
  flush = false,
}: TrackRowProps) {
  const music = useMusic()
  const nav = useMusicNav()
  const isCurrent = current ?? music.track?.id === track.id
  const liked = music.likes.has(track.id)
  return (
    <li
      className={`music-row ${isCurrent ? 'is-current' : ''} ${dragging ? 'is-dragging' : ''} ${past ? 'is-past' : ''} ${divider ? 'has-divider' : ''} ${flush && number === undefined ? 'is-flush' : ''}`}
      ref={rowRef}
      style={style}
    >
      <button
        className="music-row-main"
        type="button"
        onClick={onPlay}
        aria-label={formatContent(t.playSong, { title: track.title })}
      >
        <span className="music-row-lead">
          {isCurrent ? (
            <Equalizer paused={!music.playing} />
          ) : number !== undefined ? (
            <span className="music-row-number">{number}</span>
          ) : (
            <Play size={16} fill="currentColor" className="music-row-play" />
          )}
          {number !== undefined && !isCurrent && <Play size={16} fill="currentColor" className="music-row-play" />}
        </span>
        {showCover && <Cover albumId={track.albumId} cover={track.cover} label={track.album} className="music-row-cover" />}
        <span className="music-row-text">
          <strong>{track.title}</strong>
          <small>{subtitle ?? (artistLine(track) || track.album)}</small>
        </span>
        {showAlbum && (
          <span className="music-row-album">
            {track.album}
            {track.year ? ` · ${track.year}` : ''}
          </span>
        )}
      </button>
      <button
        className={`music-icon-button music-row-like ${liked ? 'is-on' : ''}`}
        type="button"
        onClick={() => music.toggleLike(track.id)}
        aria-pressed={liked}
        aria-label={liked ? t.unlike : t.like}
        title={liked ? t.unlike : t.like}
      >
        <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
      </button>
      <span className="music-row-time">{formatTime(track.duration)}</span>
      {onRemove && (
        <button
          className="music-icon-button"
          type="button"
          onClick={onRemove}
          aria-label={t.removeFromQueue}
          title={t.removeFromQueue}
        >
          <X size={18} />
        </button>
      )}
      <button
        className="music-icon-button"
        type="button"
        onClick={(event) => nav.openMenu([track.id], event.currentTarget, source)}
        aria-haspopup="menu"
        aria-label={formatContent(t.moreFor, { title: track.title })}
        title={t.more}
      >
        <Ellipsis size={20} />
      </button>
      {handle && (
        <button
          className="music-icon-button music-row-handle"
          type="button"
          aria-label={t.reorder}
          title={t.reorderHint}
          {...handle}
        >
          <GripVertical size={20} />
        </button>
      )}
    </li>
  )
}
