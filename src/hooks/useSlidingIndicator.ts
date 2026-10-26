import { useLayoutEffect, useRef, type RefObject } from 'react'

/** The tab that was active when each group last rendered, so a new page can start its highlight where the old one ended. */
const lastActive = new Map<string, number>()

const place = (container: HTMLElement, index: number): boolean => {
  const tab = container.children[index]
  if (!(tab instanceof HTMLElement)) return false
  container.style.setProperty('--indicator-x', `${tab.offsetLeft}px`)
  container.style.setProperty('--indicator-y', `${tab.offsetTop}px`)
  container.style.setProperty('--indicator-width', `${tab.offsetWidth}px`)
  container.style.setProperty('--indicator-height', `${tab.offsetHeight}px`)
  return true
}

/**
 * A highlight that slides to the active tab on a spring (snappy, see themes/motion.css) instead of jumping.
 *
 * Give the hook the container that holds the tabs as direct children and the index of the active one. The container
 * gets `data-indicator` and four custom properties; CSS draws the highlight on `::after`. Because each page of the app
 * mounts its own tab group, the hook remembers the last active index per `group` and starts from there, so moving from
 * Study to Music looks like one highlight travelling across.
 */
export function useSlidingIndicator<T extends HTMLElement>(group: string, activeIndex: number): RefObject<T | null> {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return undefined
    const previous = lastActive.get(group)
    lastActive.set(group, activeIndex)

    // Start without a transition at the old tab, then switch the transition on and move to the new one.
    container.dataset.indicator = 'start'
    const resting = previous !== undefined && previous !== activeIndex && place(container, previous)
    if (!resting) place(container, activeIndex)
    void container.offsetWidth
    container.dataset.indicator = 'ready'
    place(container, activeIndex)

    // A resize moves tabs without any change of state: follow it at once, without a spring. (Every current browser has
    // ResizeObserver; the guard is for server rendering and test environments.)
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      container.dataset.indicator = 'start'
      place(container, activeIndex)
      requestAnimationFrame(() => {
        container.dataset.indicator = 'ready'
      })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [group, activeIndex])

  return ref
}
