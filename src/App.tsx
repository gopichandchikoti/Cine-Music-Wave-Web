import { Suspense, lazy, useEffect, useLayoutEffect, useState } from 'react'
import type { AppMode, AuthSessionResponse, ReadingScale, Theme } from './@types'
import { fetchSession, logout } from './api'
import { AuthGate } from './features/auth/AuthGate'
import { ProfileMenu } from './features/auth/ProfileMenu'
import { MusicDock } from './features/music/MusicDock'
import { useMusic } from './features/music/musicContext'
import { useSmoothScroll } from './hooks/useSmoothScroll'
import { LegalPage } from './pages/LegalPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { modePath, navigate, routeForPath, usePathname } from './routes'
import { readStorage, writeStorage } from './utils/storage'
import './App.css'
import './features/auth/Auth.css'
import './Entertainment.css'
import './components/SiteFooter.css'
import './pages/LegalPage.css'
import './features/auth/Auth.motion.css'

const WatchView = lazy(() => import('./features/watch/WatchView').then((module) => ({ default: module.WatchView })))
const MusicView = lazy(() => import('./features/music/MusicView').then((module) => ({ default: module.MusicView })))

const MODE_KEY = 'cine-music-wave:mode'
const THEME_KEY = 'cine-music-wave:theme'

const lastMode = (): AppMode => (readStorage(MODE_KEY) === 'music' ? 'music' : 'watch')
/** Dark is the default and the approved look; light is kept in this browser once chosen. */
const storedTheme = (): Theme => (readStorage(THEME_KEY) === 'light' ? 'light' : 'dark')

/** Owns what both areas share: who is signed in, the theme and the address. Watch and Music are separate pages. */
export default function App() {
  useSmoothScroll()
  const pathname = usePathname()
  const route = routeForPath(pathname)
  const [session, setSession] = useState<AuthSessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const [scale, setScale] = useState<ReadingScale>('standard')
  const { setAccount } = useMusic()

  useEffect(() => {
    const controller = new AbortController()
    fetchSession()
      .then((value) => {
        if (!controller.signal.aborted) setSession(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('The account service could not be reached. Please retry.')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    setAccount(session?.authenticated ? (session.user?.id ?? null) : null)
  }, [session, setAccount])

  // Before paint, so a light page never flashes dark. `data-theme` is what the Music, Watch and account styles read.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    writeStorage(THEME_KEY, theme)
  }, [theme])

  // `/` is not a page: send people to the area they used last.
  useEffect(() => {
    if (route === 'root') navigate(`${modePath(lastMode())}${location.search}${location.hash}`, { replace: true })
    else if (route === 'watch' || route === 'music') writeStorage(MODE_KEY, route)
  }, [route])

  const signOut = (): void => {
    setError(null)
    logout().then(setSession, () => setError('Sign out failed. Please try again.'))
  }

  if (route === 'privacy' || route === 'terms') return <LegalPage document={route} />
  if (route === 'not-found') return <NotFoundPage />

  if (!session) {
    return (
      <main className="account-shell">
        <p role="status">{error ?? 'Opening Cine Music Wave…'}</p>
        {error && <button onClick={() => location.reload()}>Retry</button>}
      </main>
    )
  }
  if (!session.authenticated) return <AuthGate onSession={setSession} />

  const account = session.user ? (
    <ProfileMenu
      user={session.user}
      onUser={(user) => setSession((current) => (current?.authenticated ? { ...current, user } : current))}
      onLogout={signOut}
      theme={theme}
      readingScale={scale}
      onPreferences={(nextTheme, nextScale) => {
        setTheme(nextTheme)
        setScale(nextScale)
      }}
    />
  ) : null
  const mode: AppMode = route === 'music' ? 'music' : 'watch'

  return (
    <>
      {error && (
        <p role="alert" className="account-notice is-error">
          {error}
        </p>
      )}
      <Suspense
        fallback={
          <main className="account-shell">
            <p role="status">Opening {mode}…</p>
          </main>
        }
      >
        {mode === 'music' ? (
          <MusicView onWatch={() => navigate(modePath('watch'))} onLogout={signOut} accountControl={account} />
        ) : (
          <>
            <WatchView onMusic={() => navigate(modePath('music'))} onLogout={signOut} accountControl={account} />
            <MusicDock onOpen={() => navigate(modePath('music'))} />
          </>
        )}
      </Suspense>
    </>
  )
}
