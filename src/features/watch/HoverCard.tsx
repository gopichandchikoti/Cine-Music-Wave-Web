import { Check, ChevronDown, Play, Plus } from '../../components/icons'
import { useEffect, useRef } from 'react'
import { content as copy } from '../../content.js'
import { PreviewVideo } from './PreviewVideo'
import { TitleArt } from './TitleArt'
import { canResume, episodeLabel, metaParts, nextToPlay, progressFraction } from './watchModel'
import type { ProgressEntry, WatchTitle } from './watchTypes'

export type Anchor = { left: number; top: number; width: number; height: number }

type HoverCardProps = {
  title: WatchTitle
  anchor: Anchor
  progress: readonly ProgressEntry[]
  inList: boolean
  isNew: boolean
  onPlay: (title: WatchTitle) => void
  onInfo: (title: WatchTitle) => void
  onToggleList: (title: WatchTitle) => void
  onClose: () => void
}

const MARGIN = 12
const INFO_HEIGHT = 150
const SLACK = 6

/** The Netflix-style pop-up: it grows out of the card the pointer rests on, plays a silent preview and offers the main actions. */
export function HoverCard({ title, anchor, progress, inList, isNew, onPlay, onInfo, onToggleList, onClose }: HoverCardProps) {
  const element = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let leaveTimer: number | null = null
    const stopTimer = (): void => {
      if (leaveTimer !== null) {
        window.clearTimeout(leaveTimer)
        leaveTimer = null
      }
    }
    const onMove = (event: PointerEvent): void => {
      const box = element.current?.getBoundingClientRect()
      const inside =
        box &&
        event.clientX >= box.left - SLACK &&
        event.clientX <= box.right + SLACK &&
        event.clientY >= box.top - SLACK &&
        event.clientY <= box.bottom + SLACK
      if (inside) {
        stopTimer()
        return
      }
      if (leaveTimer === null) leaveTimer = window.setTimeout(onClose, 90)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, { capture: true, passive: true })
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      stopTimer()
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, { capture: true })
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const width = Math.min(Math.max(anchor.width * 1.5, 320), 440, window.innerWidth - MARGIN * 2)
  const mediaHeight = (width * 9) / 16
  const left = Math.min(Math.max(MARGIN, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - MARGIN)
  const top = Math.min(
    Math.max(MARGIN, anchor.top + anchor.height / 2 - mediaHeight / 2),
    Math.max(MARGIN, window.innerHeight - mediaHeight - INFO_HEIGHT - MARGIN),
  )

  const resuming = canResume(title, progress)
  const target = nextToPlay(title, progress)
  const fraction = progressFraction(title, progress)
  const meta = metaParts(title)
  const tags = [...title.languages.slice(0, 3), ...title.genres.slice(0, 2)]

  return (
    <div
      className="watch-hover"
      ref={element}
      style={{ left, top, width }}
      role="group"
      aria-label={title.title}
      onMouseLeave={onClose}
    >
      <div className="watch-hover-media" style={{ height: mediaHeight }}>
        <TitleArt title={title} kind="backdrop" />
        {title.kind !== 'album' && <PreviewVideo titleId={title.id} title={title.title} />}
        <span className="watch-hover-shade" aria-hidden="true" />
        <strong className="watch-hover-name">{title.title}</strong>
        {fraction > 0 && (
          <span className="watch-card-progress" aria-hidden="true">
            <span style={{ width: `${Math.round(fraction * 100)}%` }} />
          </span>
        )}
      </div>
      <div className="watch-hover-info">
        <div className="watch-hover-actions" role="toolbar" aria-label={copy.watchView.titleActions}>
          <button
            className="watch-round is-primary"
            type="button"
            onClick={() => onPlay(title)}
            aria-label={`${resuming ? copy.watchView.resume : copy.watchView.play}: ${title.title}`}
            title={resuming ? copy.watchView.resume : copy.watchView.play}
          >
            <Play size={18} fill="currentColor" />
          </button>
          <button
            className="watch-round"
            type="button"
            onClick={() => onToggleList(title)}
            aria-pressed={inList}
            aria-label={inList ? copy.watchView.removeFromList : copy.watchView.addToList}
            title={inList ? copy.watchView.removeFromList : copy.watchView.addToList}
          >
            {inList ? <Check size={18} /> : <Plus size={18} />}
          </button>
          <button
            className="watch-round is-last"
            type="button"
            onClick={() => onInfo(title)}
            aria-label={copy.watchView.moreInfo}
            title={copy.watchView.moreInfo}
          >
            <ChevronDown size={20} />
          </button>
        </div>
        <p className="watch-hover-meta">
          {isNew && <span className="watch-new">{copy.watchView.newBadge}</span>}
          {meta.map((part) => (
            <span key={part}>{part}</span>
          ))}
          {title.kind === 'series' && resuming && <span className="watch-hover-next">{episodeLabel(target.file)}</span>}
        </p>
        {tags.length > 0 && (
          <p className="watch-hover-tags">
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </p>
        )}
      </div>
    </div>
  )
}
