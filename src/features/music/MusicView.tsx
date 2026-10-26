import {
  AudioLines,
  Disc3,
  Heart,
  House,
  Library,
  ListMusic,
  Music2,
  Plus,
  Radio,
  Search,
  LogOut,
  Film,
} from '../../components/icons'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { AlbumPage, ArtistPage, LikedPage, MixPage, MoodPage, PlaylistPage } from './DetailPages'
import { ImmersiveBar } from './Hero'
import { HomePage } from './HomePage'
import { LibraryPage } from './LibraryPage'
import { CreatePlaylistDialog, PlaylistPicker, TrackMenu, type MenuState } from './MenuLayer'
import { Mosaic } from './Cover'
import { coversOf } from './musicHelpers'
import { useMusic } from './musicContext'
import { MusicNavContext, type MenuSource, type MusicNav, type MusicRoute } from './musicNav'
import { NowPlaying } from './NowPlaying'
import { PhoneDock } from './PhoneDock'
import { PlayerBar } from './PlayerBar'
import { SearchPage } from './SearchPage'
import { Presence } from '../../components/Presence'
import { useSlidingIndicator } from '../../hooks/useSlidingIndicator'
import { useSmoothScroll } from '../../hooks/useSmoothScroll'
import './Music.css'
import './Music.light.css'
import './Music.motion.css'
import './Music.screens.css'

const t = copy.musicView

type MusicViewProps = {
  onWatch: () => void
  accountControl?: ReactNode
  onLogout: () => void
}

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

type HeroRoute = Extract<MusicRoute, { page: 'artist' | 'album' }>

/** The pinned back and "…" buttons of a singer's or film's page; its menu also offers radio for that singer or film. */
function ImmersiveBarFor({ route }: { route: HeroRoute }) {
  const { index } = useMusic()
  if (route.page === 'artist') {
    const artist = index.artistByKey.get(route.key)
    return (
      <ImmersiveBar
        trackIds={artist?.trackIds ?? []}
        source={artist ? { radio: { seed: { kind: 'artist', value: artist.name }, label: `${artist.name} Radio` } } : undefined}
      />
    )
  }
  const album = index.albumById.get(route.id)
  return (
    <ImmersiveBar
      trackIds={album?.trackIds ?? []}
      source={album ? { radio: { seed: { kind: 'album', value: album.id }, label: `${album.name} Radio` } } : undefined}
    />
  )
}

export function MusicView({ onWatch, onLogout, accountControl }: MusicViewProps) {
  const modeIndicator = useSlidingIndicator<HTMLElement>('mode-switch', 1)
  const music = useMusic()
  const compact = useMediaQuery('(max-width: 860px)')
  const [history, setHistory] = useState<MusicRoute[]>([{ page: 'home' }])
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [picker, setPicker] = useState<readonly string[] | null>(null)
  const [creating, setCreating] = useState(false)
  const main = useRef<HTMLElement>(null)
  const mainContent = useRef<HTMLDivElement>(null)
  useSmoothScroll(main, mainContent)
  const route = history[history.length - 1]
  // A singer's or film's page on a phone runs its picture up to the top edge, so it has no top bar and no panel behind it.
  const heroRoute: HeroRoute | null = route.page === 'artist' || route.page === 'album' ? route : null
  const immersive = compact && heroRoute !== null

  const { ensureLibrary } = music
  useEffect(() => {
    ensureLibrary()
  }, [ensureLibrary])

  const go = useCallback(
    (next: MusicRoute): void => {
      setHistory((current) => [...current.slice(-30), next])
      music.setExpanded(false)
      main.current?.scrollTo({ top: 0 })
    },
    [music],
  )
  const back = useCallback((): void => {
    setHistory((current) => (current.length > 1 ? current.slice(0, -1) : current))
    main.current?.scrollTo({ top: 0 })
  }, [])
  const openMenu = useCallback((trackIds: readonly string[], anchor: HTMLElement, source?: MenuSource): void => {
    setMenu({ trackIds, anchor: anchor.getBoundingClientRect(), source })
  }, [])
  const pickPlaylist = useCallback((trackIds: readonly string[]): void => setPicker(trackIds), [])

  const nav = useMemo<MusicNav>(
    () => ({ route, go, back, canGoBack: history.length > 1, openMenu, pickPlaylist, compact }),
    [route, go, back, history.length, openMenu, pickPlaylist, compact],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isEditable(event.target) || event.metaKey || event.ctrlKey) return
      const onButton = event.target instanceof HTMLButtonElement
      if (event.key === ' ' && !onButton) {
        event.preventDefault()
        music.toggle()
      } else if (event.key === 'ArrowRight' && event.shiftKey) {
        event.preventDefault()
        music.next()
      } else if (event.key === 'ArrowLeft' && event.shiftKey) {
        event.preventDefault()
        music.previous()
      } else if ((event.key === 'm' || event.key === 'M') && !event.shiftKey) music.toggleMute()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [music])

  const active =
    route.page === 'search'
      ? 'search'
      : route.page === 'home' || route.page === 'mood' || route.page === 'mix'
        ? 'home'
        : 'library'
  const homeButton = (
    <button
      type="button"
      className={active === 'home' ? 'is-on' : ''}
      onClick={() => go({ page: 'home' })}
      aria-current={active === 'home' ? 'page' : undefined}
    >
      <House size={compact ? 24 : 22} />
      <span>{t.home}</span>
    </button>
  )
  const searchButton = (
    <button
      type="button"
      className={active === 'search' ? 'is-on' : ''}
      onClick={() => go({ page: 'search' })}
      aria-current={active === 'search' ? 'page' : undefined}
    >
      <Search size={compact ? 24 : 22} />
      <span>{t.search}</span>
    </button>
  )
  const libraryButton = (
    <button
      type="button"
      className={active === 'library' ? 'is-on' : ''}
      onClick={() => go({ page: 'library' })}
      aria-current={active === 'library' ? 'page' : undefined}
    >
      <Library size={compact ? 24 : 22} />
      <span>{t.yourLibrary}</span>
    </button>
  )

  const page = ((): ReactNode => {
    switch (route.page) {
      case 'home':
        return <HomePage />
      case 'search':
        return <SearchPage key={`${route.query ?? ''}|${JSON.stringify(route.filters ?? {})}`} route={route} />
      case 'library':
        return <LibraryPage route={route} />
      case 'album':
        return <AlbumPage route={route} />
      case 'artist':
        return <ArtistPage route={route} />
      case 'playlist':
        return <PlaylistPage route={route} />
      case 'liked':
        return <LikedPage />
      case 'mix':
        return <MixPage route={route} />
      case 'mood':
        return <MoodPage route={route} />
    }
  })()

  return (
    <MusicNavContext.Provider value={nav}>
      <div
        className={`music-shell ${compact ? 'is-compact' : ''} ${music.track ? 'has-player' : ''} ${immersive ? 'is-immersive' : ''}`}
      >
        <div className="music-backdrop" aria-hidden="true" />
        <header className="music-topbar">
          <div className="music-brand">
            <span className="music-brand-mark" aria-hidden="true">
              <Music2 size={19} />
            </span>
            <span>
              <small>{copy.watchView.secondBrain}</small>
              <strong>{t.music}</strong>
            </span>
          </div>
          <nav className="music-mode-switch glass" ref={modeIndicator} aria-label={copy.modeSwitch.appModes}>
            <button type="button" onClick={onWatch} aria-label={copy.modeSwitch.watch}>
              <Film size={15} />
              <span>{copy.modeSwitch.watch}</span>
            </button>
            <button className="is-active" type="button" aria-current="page">
              <AudioLines size={15} />
              <span>{copy.modeSwitch.music}</span>
            </button>
          </nav>
          <div className="music-account">
            {accountControl ?? (
              <button
                className="music-icon-button"
                type="button"
                onClick={onLogout}
                aria-label={copy.watchView.lockLibrary}
                title={copy.watchView.lockLibrary}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>

        {!compact && (
          <aside className="music-sidebar glass" aria-label={t.yourLibrary}>
            <nav className="music-side-nav">
              {homeButton}
              {searchButton}
              {libraryButton}
            </nav>
            <div className="music-side-library">
              <header>
                <h2>
                  <ListMusic size={16} />
                  {t.scopePlaylists}
                </h2>
                <button
                  className="music-icon-button"
                  type="button"
                  onClick={() => setCreating(true)}
                  aria-label={t.createPlaylist}
                  title={t.createPlaylist}
                >
                  <Plus size={18} />
                </button>
              </header>
              <ul>
                <li>
                  <button type="button" className={route.page === 'liked' ? 'is-on' : ''} onClick={() => go({ page: 'liked' })}>
                    <span className="music-side-art music-liked-cover">
                      <Heart size={16} fill="currentColor" />
                    </span>
                    <span>
                      <strong>{t.likedSongs}</strong>
                      <small>
                        {formatContent(music.user.likes.length === 1 ? t.oneSong : t.manySongs, {
                          count: music.user.likes.length,
                        })}
                      </small>
                    </span>
                  </button>
                </li>
                {music.user.playlists.map((playlist) => (
                  <li key={playlist.id}>
                    <button
                      type="button"
                      className={route.page === 'playlist' && route.id === playlist.id ? 'is-on' : ''}
                      onClick={() => go({ page: 'playlist', id: playlist.id })}
                    >
                      <Mosaic
                        covers={coversOf(playlist.trackIds.flatMap((id) => music.index.byId.get(id) ?? []))}
                        label={playlist.name}
                        className="music-side-art"
                      />
                      <span>
                        <strong>{playlist.name}</strong>
                        <small>
                          {formatContent(playlist.trackCount === 1 ? t.oneSong : t.manySongs, { count: playlist.trackCount })}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {music.user.radios.length > 0 && (
                <>
                  <header>
                    <h2>
                      <Radio size={16} />
                      {t.radios}
                    </h2>
                  </header>
                  <ul>
                    {music.user.radios.map((radio) => (
                      <li key={radio.id}>
                        <button
                          type="button"
                          onClick={() => music.startRadio({ kind: radio.seedKind, value: radio.seedValue }, radio.label)}
                        >
                          <span className="music-side-art music-radio-tile">
                            <Radio size={16} />
                          </span>
                          <span>
                            <strong>{radio.label}</strong>
                            <small>{t.radioSaved}</small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button className="music-side-more" type="button" onClick={() => go({ page: 'library', tab: 'albums' })}>
                <Disc3 size={16} />
                {t.browseFilms}
              </button>
            </div>
          </aside>
        )}

        <main className="music-main" ref={main} aria-label={t.music}>
          <div ref={mainContent}>{page}</div>
        </main>

        <PlayerBar />
        {immersive && heroRoute && <ImmersiveBarFor route={heroRoute} />}
        {compact && <PhoneDock />}
        <Presence show={Boolean(music.expanded && music.track)}>{music.expanded && music.track && <NowPlaying />}</Presence>
        <Presence show={menu !== null}>{menu && <TrackMenu menu={menu} onClose={() => setMenu(null)} />}</Presence>
        <Presence show={picker !== null}>
          {picker && <PlaylistPicker trackIds={picker} onClose={() => setPicker(null)} />}
        </Presence>
        <Presence show={creating}>
          {creating && (
            <CreatePlaylistDialog
              onClose={() => setCreating(false)}
              onCreated={(playlist) => go({ page: 'playlist', id: playlist.id })}
            />
          )}
        </Presence>
      </div>
    </MusicNavContext.Provider>
  )
}
