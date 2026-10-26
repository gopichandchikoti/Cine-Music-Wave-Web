import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

// Drag-to-reorder for a vertical list, by mouse, finger or keyboard. The row being dragged follows the pointer; the rows it passes slide
// out of the way; releasing saves the new order. It never moves the rows itself: it only reports (from, to) and the list re-renders.

type Drag = { from: number; over: number; offset: number }

type Options = {
  count: number
  onMove: (from: number, to: number) => void
}

/** The nearest ancestor that scrolls, so dragging near its edge can scroll it. */
function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

const EDGE = 56
const SCROLL_SPEED = 14

export function useSortable({ count, onMove }: Options) {
  const [drag, setDrag] = useState<Drag | null>(null)
  // The latest drag, readable without waiting for a render: dropping must act on exactly what was on screen.
  const dragRef = useRef<Drag | null>(null)
  const publish = useCallback((next: Drag | null): void => {
    dragRef.current = next
    setDrag(next)
  }, [])
  const rows = useRef<(HTMLElement | null)[]>([])
  const session = useRef<{
    from: number
    startY: number
    startScroll: number
    rects: DOMRect[]
    pointerY: number
    handle: HTMLElement
    pointerId: number
    container: HTMLElement | null
  } | null>(null)
  const frame = useRef<number | null>(null)
  const latest = useRef({ count, onMove })
  useEffect(() => {
    latest.current = { count, onMove }
  })

  const setRow = useCallback(
    (index: number) =>
      (element: HTMLElement | null): void => {
        rows.current[index] = element
      },
    [],
  )

  const measure = useCallback((): void => {
    const current = session.current
    if (!current) return
    const scrolled = (current.container?.scrollTop ?? 0) - current.startScroll
    const dragged = current.rects[current.from]
    const center = dragged.top + dragged.height / 2 + (current.pointerY - current.startY)
    const centreOf = (index: number): number => current.rects[index].top - scrolled + current.rects[index].height / 2
    let over = current.from
    for (let index = 0; index < current.from; index += 1) {
      if (center < centreOf(index)) {
        over = index
        break
      }
    }
    if (over === current.from)
      for (let index = current.rects.length - 1; index > current.from; index -= 1) {
        if (center > centreOf(index)) {
          over = index
          break
        }
      }
    publish({ from: current.from, over, offset: current.pointerY - current.startY + scrolled })
  }, [publish])

  const stop = useCallback(
    (commit: boolean): void => {
      const current = session.current
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current)
        frame.current = null
      }
      if (!current) return
      session.current = null
      try {
        current.handle.releasePointerCapture(current.pointerId)
      } catch {
        /* the pointer is already gone */
      }
      const state = dragRef.current
      publish(null)
      // Not inside a state updater: React may run those twice, and a move that happens twice is no move at all.
      if (commit && state && state.over !== state.from) latest.current.onMove(state.from, state.over)
    },
    [publish],
  )

  // While a row is held, keep checking: near the edge of the list it scrolls, and the row under the pointer is re-worked out.
  const loop = useCallback(
    function tick(): void {
      const current = session.current
      if (!current) return
      const container = current.container
      if (container) {
        const box = container.getBoundingClientRect()
        const step = current.pointerY < box.top + EDGE ? -SCROLL_SPEED : current.pointerY > box.bottom - EDGE ? SCROLL_SPEED : 0
        if (step !== 0) container.scrollBy(0, step)
      }
      measure()
      frame.current = requestAnimationFrame(tick)
    },
    [measure],
  )

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const handleProps = (index: number) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>): void => {
      if (event.button !== 0 && event.pointerType === 'mouse') return
      event.preventDefault()
      event.stopPropagation()
      const rects = Array.from(
        { length: latest.current.count },
        (_unused, position) => rows.current[position]?.getBoundingClientRect() ?? new DOMRect(),
      )
      if (!rects[index]) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const container = scrollParent(event.currentTarget)
      session.current = {
        from: index,
        startY: event.clientY,
        startScroll: container?.scrollTop ?? 0,
        rects,
        pointerY: event.clientY,
        handle: event.currentTarget,
        pointerId: event.pointerId,
        container,
      }
      publish({ from: index, over: index, offset: 0 })
      frame.current = requestAnimationFrame(loop)
    },
    onPointerMove: (event: PointerEvent<HTMLElement>): void => {
      if (session.current) {
        session.current.pointerY = event.clientY
        measure()
      }
    },
    onPointerUp: (): void => stop(true),
    onPointerCancel: (): void => stop(false),
    onKeyDown: (event: KeyboardEvent<HTMLElement>): void => {
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
      event.preventDefault()
      const target = index + (event.key === 'ArrowUp' ? -1 : 1)
      if (target >= 0 && target < latest.current.count) latest.current.onMove(index, target)
    },
    style: { touchAction: 'none', cursor: drag ? 'grabbing' : 'grab' } as CSSProperties,
  })

  /** Inline style for a row: the dragged row follows the pointer, rows in its way make room. */
  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined
    const height = session.current?.rects[drag.from]?.height ?? 0
    if (index === drag.from)
      return { transform: `translateY(${drag.offset}px)`, zIndex: 5, transition: 'none', position: 'relative' }
    if (drag.from < drag.over && index > drag.from && index <= drag.over)
      return { transform: `translateY(${-height}px)`, transition: 'transform 0.16s ease' }
    if (drag.from > drag.over && index < drag.from && index >= drag.over)
      return { transform: `translateY(${height}px)`, transition: 'transform 0.16s ease' }
    return { transition: 'transform 0.16s ease' }
  }

  return { dragging: drag?.from ?? null, setRow, handleProps, rowStyle }
}
