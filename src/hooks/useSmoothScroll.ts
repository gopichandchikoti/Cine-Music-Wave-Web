import Lenis, { type LenisOptions } from 'lenis'
import { useEffect, type RefObject } from 'react'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Wheel scrolling eases to a stop instead of jumping. Touch and keyboard scrolling stay native, and scrollable areas inside
 * the page (editors, lists, dialogs) keep their own native scrolling until they reach their end.
 */
const BASE_OPTIONS: LenisOptions = { autoRaf: true, lerp: 0.12, smoothWheel: true, syncTouch: false, allowNestedScroll: true }

/** The player, dialogs and the full-screen music player lock page scrolling by hiding the body's overflow; smoothing must respect that. */
const pageIsLocked = (): boolean => document.body.style.overflow === 'hidden'

/**
 * Smooth wheel scrolling for the page, or for one scrollable region when `scroller` and its inner `content` element are given.
 * It does nothing for people who ask for reduced motion and follows that setting if it changes while the app is open.
 */
export function useSmoothScroll(scroller?: RefObject<HTMLElement | null>, content?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const region = scroller?.current ?? null
    if (scroller && !region) return undefined
    const contentElement = content?.current ?? region
    const query = window.matchMedia(REDUCED_MOTION)
    let lenis: Lenis | null = null

    const sync = (): void => {
      if (query.matches) {
        lenis?.destroy()
        lenis = null
        return
      }
      if (!lenis)
        lenis = new Lenis(region && contentElement ? { ...BASE_OPTIONS, wrapper: region, content: contentElement } : BASE_OPTIONS)
      if (pageIsLocked()) lenis.stop()
      else lenis.start()
    }

    const lockWatcher = new MutationObserver(sync)
    lockWatcher.observe(document.body, { attributes: true, attributeFilter: ['style'] })
    query.addEventListener('change', sync)
    sync()
    return () => {
      lockWatcher.disconnect()
      query.removeEventListener('change', sync)
      lenis?.destroy()
      lenis = null
    }
  }, [scroller, content])
}
