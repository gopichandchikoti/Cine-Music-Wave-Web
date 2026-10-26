import { ChevronLeft, ChevronRight } from '../../components/icons'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { content as copy } from '../../content.js'

type RailProps = {
  title: string
  children: ReactNode
  /** Called when the row scrolls, so an open hover preview can close instead of floating away from its card. */
  onScroll?: () => void
}

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A titled row that slides sideways, with arrows that appear only when there is more to see. */
export function Rail({ title, children, onScroll }: RailProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  const measure = useCallback((): void => {
    const element = scroller.current
    if (!element) return
    setCanGoBack(element.scrollLeft > 4)
    setCanGoForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [measure, children])

  const slide = (direction: -1 | 1): void => {
    const element = scroller.current
    if (!element) return
    element.scrollBy({ left: direction * element.clientWidth * 0.86, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  return (
    <section className="watch-rail" aria-label={title}>
      <h2 className="watch-rail-title">{title}</h2>
      <div className="watch-rail-frame">
        {canGoBack && (
          <button
            className="watch-rail-arrow is-back"
            type="button"
            onClick={() => slide(-1)}
            aria-label={copy.watchView.scrollLeft}
          >
            <ChevronLeft size={30} />
          </button>
        )}
        <div
          className="watch-rail-track"
          ref={scroller}
          onScroll={() => {
            measure()
            onScroll?.()
          }}
        >
          {children}
        </div>
        {canGoForward && (
          <button
            className="watch-rail-arrow is-forward"
            type="button"
            onClick={() => slide(1)}
            aria-label={copy.watchView.scrollRight}
          >
            <ChevronRight size={30} />
          </button>
        )}
      </div>
    </section>
  )
}
