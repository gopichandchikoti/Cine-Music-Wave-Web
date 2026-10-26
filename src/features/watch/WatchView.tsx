import { AudioLines, CircleAlert, LogOut, RefreshCw, Search, X } from '../../components/icons'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { Presence } from '../../components/Presence'
import { useSlidingIndicator } from '../../hooks/useSlidingIndicator'
import { useMusic } from '../music/musicContext'
import { Billboard } from './Billboard'
import { HoverCard, type Anchor } from './HoverCard'
import { Player } from './Player'
import { Rail } from './Rail'
import { TitleCard } from './TitleCard'
import { TitleDialog } from './TitleDialog'
import { addToMyList, fetchCatalog, removeFromMyList, rescanLibrary } from './watchApi'
import { buildRows, newTitleIds, nextToPlay, pickFeatured, progressFraction, searchTitles, similarTo } from './watchModel'
import type { CatalogResponse, PlayTarget, ProgressEntry, WatchFile, WatchTitle } from './watchTypes'
import './Watch.css'
import './Watch.light.css'
import './Watch.motion.css'

type WatchViewProps = {
  onMusic: () => void
  accountControl?: ReactNode
  onLogout: () => void
}

type Section = 'home' | 'movies' | 'series' | 'list'

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'home', label: copy.watchView.navHome },
  { id: 'movies', label: copy.watchView.navMovies },
  { id: 'series', label: copy.watchView.navSeries },
  { id: 'list', label: copy.watchView.navMyList },
]

const POLL_MS = 5000
const NOTICE_MS = 4500

const newestYearFirst = (left: WatchTitle, right: WatchTitle): number =>
  (right.year ?? 0) - (left.year ?? 0) || left.title.localeCompare(right.title)

export function WatchView({ onMusic, onLogout, accountControl }: WatchViewProps) {
  const { pause: pauseMusic } = useMusic()
  const shell = useRef<HTMLDivElement>(null)
  const modeIndicator = useSlidingIndicator<HTMLElement>('mode-switch', 0)
  const [openedAt] = useState(() => Date.now())
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [list, setList] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [section, setSection] = useState<Section>('home')
  const [query, setQuery] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [hover, setHover] = useState<{ title: WatchTitle; anchor: Anchor } | null>(null)
  const [dialogId, setDialogId] = useState<string | null>(null)
  const [playing, setPlaying] = useState<PlayTarget | null>(null)

  const accept = useCallback((response: CatalogResponse): void => {
    setCatalog(response)
    setProgress(response.progress)
    setList(response.list)
    setError(null)
  }, [])
  const load = useCallback((signal?: AbortSignal): Promise<void> => fetchCatalog(signal).then(accept), [accept])

  useEffect(() => {
    const controller = new AbortController()
    fetchCatalog(controller.signal)
      .then(accept, (reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : copy.watchView.watchCouldNotBeLoaded)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [accept])

  // While the server is still looking at new files or making pictures, check back so they appear as they are ready.
  const busyCount = catalog ? catalog.status.probing + catalog.status.artwork : 0
  const scanning = catalog?.status.scanning ?? false
  useEffect(() => {
    if (!scanning && busyCount === 0) return
    const timer = window.setTimeout(() => {
      void load().catch(() => undefined)
    }, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [scanning, busyCount, catalog, load])

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  // Songs live in the Music tab; Watch is for films and series.
  const titles = useMemo(() => (catalog?.titles ?? []).filter((title) => title.kind !== 'album'), [catalog])
  const rows = useMemo(() => buildRows(titles, progress, list), [titles, progress, list])
  const newIds = useMemo(() => newTitleIds(titles, openedAt), [titles, openedAt])
  const featured = useMemo(() => pickFeatured(titles, progress), [titles, progress])
  const fractions = useMemo(
    () => new Map(titles.map((title) => [title.id, progressFraction(title, progress)])),
    [titles, progress],
  )
  const listed = useMemo(() => new Set(list), [list])
  const results = useMemo(() => (query.trim() ? searchTitles(titles, query) : null), [titles, query])
  const dialogTitle = dialogId ? (titles.find((title) => title.id === dialogId) ?? null) : null
  const covered = dialogTitle !== null || playing !== null

  const closeHover = useCallback(() => setHover(null), [])
  const openHover = useCallback((title: WatchTitle, element: HTMLElement) => {
    const box = element.getBoundingClientRect()
    setHover({ title, anchor: { left: box.left, top: box.top, width: box.width, height: box.height } })
  }, [])
  const openTitle = useCallback((title: WatchTitle) => {
    setHover(null)
    setDialogId(title.id)
  }, [])

  // A film and a song should not play over each other.
  const play = useCallback(
    (target: PlayTarget) => {
      pauseMusic()
      setHover(null)
      setDialogId(null)
      setPlaying(target)
    },
    [pauseMusic],
  )
  const playTitle = useCallback((title: WatchTitle) => play(nextToPlay(title, progress)), [play, progress])

  const toggleList = useCallback(
    async (title: WatchTitle): Promise<void> => {
      const wasListed = list.includes(title.id)
      setList((current) => (wasListed ? current.filter((id) => id !== title.id) : [title.id, ...current]))
      try {
        await (wasListed ? removeFromMyList(title.id) : addToMyList(title.id))
      } catch (reason) {
        setList((current) => (wasListed ? [title.id, ...current] : current.filter((id) => id !== title.id)))
        setNotice(reason instanceof Error ? reason.message : copy.watchView.watchCouldNotBeLoaded)
      }
    },
    [list],
  )

  const recordProgress = useCallback((entry: ProgressEntry) => {
    setProgress((current) => [entry, ...current.filter((item) => item.fileId !== entry.fileId)])
  }, [])

  const playFile = useCallback((file: WatchFile) => {
    setPlaying((current) => (current ? { title: current.title, file, startAt: 0 } : current))
  }, [])

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await rescanLibrary()
      await load()
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : copy.watchView.watchCouldNotBeLoaded)
    } finally {
      setRefreshing(false)
    }
  }

  const card = (title: WatchTitle): ReactNode => (
    <TitleCard
      key={title.id}
      title={title}
      progress={fractions.get(title.id) ?? 0}
      isNew={newIds.has(title.id)}
      onOpen={openTitle}
      onHover={openHover}
    />
  )

  const grid = (items: readonly WatchTitle[], empty: string): ReactNode =>
    items.length === 0 ? <p className="watch-empty-note">{empty}</p> : <div className="watch-grid">{items.map(card)}</div>

  const body = (): ReactNode => {
    if (loading)
      return (
        <div className="watch-state" role="status">
          <span className="watch-spinner is-large" />
          {copy.watchView.loadingLibrary}
        </div>
      )
    if (error && !catalog)
      return (
        <div className="watch-state" role="alert">
          <CircleAlert size={30} />
          <p>{error}</p>
          <button
            className="watch-button is-primary"
            type="button"
            onClick={() => {
              setLoading(true)
              void load()
                .catch((reason: unknown) =>
                  setError(reason instanceof Error ? reason.message : copy.watchView.watchCouldNotBeLoaded),
                )
                .finally(() => setLoading(false))
            }}
          >
            {copy.watchView.tryAgain}
          </button>
        </div>
      )
    if (titles.length === 0)
      return (
        <div className="watch-state">
          <AudioLines size={34} />
          <h2>{copy.watchView.emptyTitle}</h2>
          <p>{copy.watchView.emptyBody}</p>
        </div>
      )
    if (results)
      return (
        <div className="watch-page">
          <h2 className="watch-page-title">
            {results.length === 0
              ? formatContent(copy.watchView.nothingMatches, { query: query.trim() })
              : copy.watchView.searchWatchMedia}
          </h2>
          {results.length > 0 && <div className="watch-grid">{results.map(card)}</div>}
        </div>
      )
    if (section === 'movies')
      return (
        <div className="watch-page">
          <h2 className="watch-page-title">{copy.watchView.allMovies}</h2>
          {grid(titles.filter((title) => title.kind === 'movie').sort(newestYearFirst), copy.watchView.emptySection)}
        </div>
      )
    if (section === 'series')
      return (
        <div className="watch-page">
          <h2 className="watch-page-title">{copy.watchView.tvSeries}</h2>
          {grid(titles.filter((title) => title.kind === 'series').sort(newestYearFirst), copy.watchView.emptySection)}
        </div>
      )
    if (section === 'list')
      return (
        <div className="watch-page">
          <h2 className="watch-page-title">{copy.watchView.myList}</h2>
          {grid(
            list.map((id) => titles.find((title) => title.id === id)).filter((title): title is WatchTitle => title !== undefined),
            copy.watchView.emptyList,
          )}
        </div>
      )
    return (
      <>
        {featured && (
          <Billboard
            title={featured}
            progress={progress}
            inList={listed.has(featured.id)}
            covered={covered}
            onPlay={playTitle}
            onInfo={openTitle}
            onToggleList={(title) => {
              void toggleList(title)
            }}
          />
        )}
        <div className="watch-rows">
          {rows.map((row) => (
            <Rail key={row.id} title={row.title} onScroll={closeHover}>
              {row.items.map(card)}
            </Rail>
          ))}
        </div>
      </>
    )
  }

  const sectionLabel = (id: Section): string => SECTIONS.find((item) => item.id === id)?.label ?? ''

  return (
    <div className="watch-shell" ref={shell}>
      <header className={`watch-topbar ${scrolled || section !== 'home' || results ? 'is-solid' : ''}`}>
        <div className="watch-brand">
          <span className="watch-brand-mark" aria-hidden="true">
            <AudioLines size={19} />
          </span>
          <span>
            <small>{copy.watchView.secondBrain}</small>
            <strong>{copy.watchView.watch}</strong>
          </span>
        </div>
        <nav className="watch-sections" aria-label={copy.watchView.watchSections}>
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id && !results ? 'is-active' : ''}
              aria-current={section === item.id && !results ? 'page' : undefined}
              onClick={() => {
                setSection(item.id)
                setQuery('')
                closeHover()
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="watch-tools">
          <label className="watch-search">
            <Search size={17} />
            <span className="sr-only">{copy.watchView.searchWatchMedia}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                closeHover()
              }}
              placeholder={copy.watchView.searchPlaceholder}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={copy.watchView.clearSearch}>
                <X size={15} />
              </button>
            )}
          </label>
          <button
            className="watch-icon-button"
            type="button"
            onClick={() => {
              void refresh()
            }}
            disabled={refreshing}
            aria-label={copy.watchView.refreshLibrary}
            title={copy.watchView.refreshLibrary}
          >
            <RefreshCw size={18} className={refreshing ? 'is-spinning' : ''} />
          </button>
          <nav className="watch-mode-switch" ref={modeIndicator} aria-label={copy.watchView.appModes}>
            <button className="is-active" type="button" aria-current="page">
              {copy.watchView.watch}
            </button>
            <button type="button" onClick={onMusic} aria-label={copy.modeSwitch.music}>
              <AudioLines size={15} />
              <span className="watch-mode-label">{copy.modeSwitch.music}</span>
            </button>
          </nav>
          {accountControl ?? (
            <button
              className="watch-icon-button"
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

      <main className={`watch-main ${section === 'home' && !results ? 'is-home' : ''}`} aria-label={sectionLabel(section)}>
        {body()}
      </main>

      <div className="watch-banners">
        {catalog && !catalog.media.available && (
          <p className="watch-banner is-warning" role="status">
            <CircleAlert size={16} />
            {copy.watchView.converterMissing}
          </p>
        )}
        {busyCount > 0 && (
          <p className="watch-banner" role="status">
            <span className="watch-spinner" />
            {formatContent(copy.watchView.preparingLibrary, { count: busyCount })}
          </p>
        )}
      </div>

      {hover && !covered && (
        <HoverCard
          key={hover.title.id}
          title={hover.title}
          anchor={hover.anchor}
          progress={progress}
          inList={listed.has(hover.title.id)}
          isNew={newIds.has(hover.title.id)}
          onPlay={playTitle}
          onInfo={openTitle}
          onToggleList={(title) => {
            void toggleList(title)
          }}
          onClose={closeHover}
        />
      )}

      <Presence show={dialogTitle !== null}>
        {dialogTitle && (
          <TitleDialog
            title={dialogTitle}
            progress={progress}
            inList={listed.has(dialogTitle.id)}
            similar={similarTo(dialogTitle, titles)}
            onClose={() => setDialogId(null)}
            onPlay={play}
            onToggleList={(title) => {
              void toggleList(title)
            }}
            onOpenTitle={openTitle}
          />
        )}
      </Presence>

      {playing && (
        <Player
          key={playing.file.id}
          title={playing.title}
          file={playing.file}
          startAt={playing.startAt}
          fullscreenHost={shell}
          onClose={() => setPlaying(null)}
          onPlayFile={playFile}
          onProgress={recordProgress}
        />
      )}

      {notice && (
        <p className="watch-toast" role="status">
          {notice}
        </p>
      )}
    </div>
  )
}
