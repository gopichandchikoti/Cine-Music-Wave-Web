import { ChevronLeft, ChevronRight } from '../../components/icons'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { content as copy } from '../../content.js'
import { useMusic } from './musicContext'
import type { MusicTrack, PlayContext } from './musicTypes'
import { TrackRow } from './TrackRow'

const t = copy.musicView

/** A titled row that slides sideways, with arrows that appear when there is more. */
export function Shelf({
  title,
  subtitle,
  children,
  action,
  className = '',
  arrows = true,
  onTitle,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
  className?: string
  /** Show the scroll arrows (a phone swipes, so the phone pages leave them off). */
  arrows?: boolean
  /** Makes the title a button, with a chevron, that opens the whole list. */
  onTitle?: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ back: false, forward: false })
  const measure = useCallback((): void => {
    const element = scroller.current
    if (!element) return
    setMore({ back: element.scrollLeft > 4, forward: element.scrollLeft + element.clientWidth < element.scrollWidth - 4 })
  }, [])
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [measure, children])
  const slide = (direction: -1 | 1): void =>
    scroller.current?.scrollBy({
      left: direction * (scroller.current.clientWidth * 0.85),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  return (
    <section className={`music-shelf ${className}`} aria-label={title}>
      <header className="music-shelf-head">
        <div>
          {onTitle ? (
            <h2>
              <button className="music-shelf-title" type="button" onClick={onTitle}>
                {title}
                <ChevronRight size={20} strokeWidth={3} aria-hidden="true" />
              </button>
            </h2>
          ) : (
            <h2>{title}</h2>
          )}
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="music-shelf-tools">
          {action}
          {arrows && (
            <>
              <button
                className="music-icon-button"
                type="button"
                onClick={() => slide(-1)}
                disabled={!more.back}
                aria-label={t.scrollLeft}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="music-icon-button"
                type="button"
                onClick={() => slide(1)}
                disabled={!more.forward}
                aria-label={t.scrollRight}
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
        </div>
      </header>
      <div className="music-shelf-track" ref={scroller} onScroll={measure}>
        {children}
      </div>
    </section>
  )
}

/** Songs laid out in columns of four rows that slide sideways (Quick picks, Listen again, mixes). */
export function TrackColumns({
  trackIds,
  context,
  rows = 4,
  subtitle,
  divided = false,
  peek,
}: {
  trackIds: readonly string[]
  context: PlayContext
  rows?: number
  /** Replaces the singer line under each title. */
  subtitle?: (track: MusicTrack) => string
  /** A hairline between rows, and covers flush with the left edge. */
  divided?: boolean
  /** How much of the shelf the next column shows on a phone (0 to 0.5), instead of the usual 8%. */
  peek?: number
}) {
  const music = useMusic()
  const tracks = trackIds.flatMap((id) => music.index.byId.get(id) ?? [])
  return (
    <ul
      className={`music-columns ${peek === undefined ? '' : 'has-peek'}`}
      style={{ '--rows': rows, ...(peek === undefined ? {} : { '--col': `${(1 - peek) * 100}%` }) } as React.CSSProperties}
    >
      {tracks.map((track, position) => (
        <TrackRow
          key={track.id}
          track={track}
          showAlbum={false}
          subtitle={subtitle?.(track)}
          divider={divided && (position + 1) % rows !== 0 && position < tracks.length - 1}
          flush={divided}
          onPlay={() =>
            music.playTracks(
              tracks.map((entry) => entry.id),
              { start: position, context, shuffle: false },
            )
          }
        />
      ))}
    </ul>
  )
}
