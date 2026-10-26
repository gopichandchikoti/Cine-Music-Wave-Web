import { useSyncExternalStore } from 'react'
import type { AppMode } from '../@types'

/** The app has four working areas (modes) and two public documents. Every one has its own address. */
export type RouteId = AppMode | 'privacy' | 'terms' | 'not-found'

const MODE_PATHS: Readonly<Record<AppMode, string>> = {
  watch: '/watch',
  music: '/music',
}

const DOCUMENT_PATHS: Readonly<Record<'privacy' | 'terms', string>> = {
  privacy: '/privacy',
  terms: '/terms',
}

const NAVIGATE_EVENT = 'app:navigate'

export const modePath = (mode: AppMode): string => MODE_PATHS[mode]

export const documentPath = (document: 'privacy' | 'terms'): string => DOCUMENT_PATHS[document]

/** The route for an address. `/` is not a page of its own: the caller redirects it to the last mode used. */
export function routeForPath(pathname: string): RouteId | 'root' {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/') return 'root'
  for (const [mode, modeAddress] of Object.entries(MODE_PATHS)) if (path === modeAddress) return mode as AppMode
  for (const [name, address] of Object.entries(DOCUMENT_PATHS)) if (path === address) return name as 'privacy' | 'terms'
  return 'not-found'
}

/** Moves to another address without reloading the page. The query string and hash are kept unless a new one is given. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === `${location.pathname}${location.search}${location.hash}`) return
  if (options.replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener('popstate', notify)
  window.addEventListener(NAVIGATE_EVENT, notify)
  return () => {
    window.removeEventListener('popstate', notify)
    window.removeEventListener(NAVIGATE_EVENT, notify)
  }
}

/** The current address path, re-read after every navigation and every Back or Forward press. */
export const usePathname = (): string =>
  useSyncExternalStore(
    subscribe,
    () => location.pathname,
    () => '/',
  )
