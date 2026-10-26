import { useSyncExternalStore } from 'react'

/** True while the browser window matches a CSS media query; re-renders when that changes (rotating a phone, resizing a window). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
