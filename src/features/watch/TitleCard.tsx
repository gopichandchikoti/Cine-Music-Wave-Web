import { memo, useEffect, useRef, type PointerEvent } from 'react'
import { content as copy } from '../../content.js'
import { TitleArt } from './TitleArt'
import type { WatchTitle } from './watchTypes'

/** How long the pointer must rest on a card before its preview opens, so sweeping across a row stays quiet. */
const HOVER_DELAY_MS = 380

export type TitleCardProps = {
  title: WatchTitle
  /** 0 to 1: how far into the next thing to watch the viewer already is. */
  progress: number
  isNew: boolean
  onOpen: (title: WatchTitle) => void
  onHover: (title: WatchTitle, element: HTMLElement) => void
}

function TitleCardView({ title, progress, isNew, onOpen, onHover }: TitleCardProps) {
  const elementRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | null>(null)

  const cancel = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }
  useEffect(() => cancel, [])

  const handleEnter = (event: PointerEvent<HTMLButtonElement>): void => {
    // Touch has no hover: a tap opens the details instead.
    if (event.pointerType === 'touch') return
    cancel()
    timer.current = window.setTimeout(() => {
      timer.current = null
      if (elementRef.current) onHover(title, elementRef.current)
    }, HOVER_DELAY_MS)
  }

  return (
    <button
      ref={elementRef}
      className="watch-card"
      type="button"
      onClick={() => {
        cancel()
        onOpen(title)
      }}
      onPointerEnter={handleEnter}
      onPointerLeave={cancel}
    >
      <TitleArt title={title} kind="card" />
      <span className="watch-card-shade" aria-hidden="true" />
      {isNew && <span className="watch-card-badge">{copy.watchView.newBadge}</span>}
      <span className="watch-card-name">{title.title}</span>
      {progress > 0 && (
        <span className="watch-card-progress" aria-hidden="true">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
    </button>
  )
}

export const TitleCard = memo(TitleCardView)
