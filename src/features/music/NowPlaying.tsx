import { ChevronDown, Ellipsis, ListMusic, Mic2, Radio, SlidersHorizontal, Layers } from '../../components/icons'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { Cover } from './Cover'
import { coverUrl } from './musicApi'
import { useMusic, type Sheet } from './musicContext'
import { keyOf } from './musicModel'
import { useMusicNav } from './musicNav'
import { LikeButton, PlaybackMenu, SeekBar, Transport, Volume } from './PlayerParts'
import { LyricsSheet, QueueSheet, RelatedSheet } from './Sheets'
import { useDominantColor } from './useDominantColor'

const t = copy.musicView

const TABS: readonly { id: Exclude<Sheet, null>; label: string }[] = [
  { id: 'queue', label: t.upNext },
  { id: 'lyrics', label: t.lyrics },
  { id: 'related', label: t.related },
]
const SWIPE_TO_CLOSE = 90

/**
 * The full-screen player. The cover is centred with the song, singers and film under it; Up next, Lyrics and Related sit along the
 * bottom. Opening one lifts the player to the top and slides the list up from the bottom, the way YouTube Music does. The backdrop takes
 * its colour from the cover, and the glass panels float over it.
 */
export function NowPlaying() {
  const music = useMusic()
  const nav = useMusicNav()
  const track = music.track
  const color = useDominantColor(track?.cover ? coverUrl(track.albumId) : null)
  const [settings, setSettings] = useState(false)
  const close = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ startY: number } | null>(null)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    close.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      opener?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (music.sheet) music.setSheet(null)
      else music.setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [music])

  if (!track) return null
  const rgb = color ?? { r: 52, g: 120, b: 90 }
  const style = { '--tint': `${rgb.r}, ${rgb.g}, ${rgb.b}` } as CSSProperties
  const sheetOpen = music.sheet !== null

  // A press that lands on a button inside the grabbed area (Minimise, More) must stay a plain click: capturing the pointer on the
  // header would send that click to the header and the button would never fire.
  const onGrab = (event: PointerEvent<HTMLElement>): void => {
    const control = event.target instanceof Element ? event.target.closest('button, a, input') : null
    if (control && control !== event.currentTarget) return
    drag.current = { startY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onRelease = (event: PointerEvent<HTMLElement>): void => {
    const started = drag.current
    drag.current = null
    if (started && event.clientY - started.startY > SWIPE_TO_CLOSE) {
      if (music.sheet) music.setSheet(null)
      else music.setExpanded(false)
    }
  }

  return (
    <div
      className={`music-now ${sheetOpen ? 'has-sheet' : ''}`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={t.nowPlaying}
    >
      <div className="music-now-bg" aria-hidden="true">
        {track.cover && <img src={coverUrl(track.albumId)} alt="" />}
      </div>
      <header
        className="music-now-top"
        onPointerDown={onGrab}
        onPointerUp={onRelease}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        <button
          className="music-icon-button glass-button"
          type="button"
          ref={close}
          onClick={() => music.setExpanded(false)}
          aria-label={t.minimize}
          title={t.minimize}
        >
          <ChevronDown size={26} />
        </button>
        <div className="music-now-context">
          <small>{music.context?.kind === 'radio' ? t.radioPlaying : t.playingFromLabel}</small>
          <strong>{music.context?.label ?? t.yourQueue}</strong>
        </div>
        <button
          className="music-icon-button glass-button"
          type="button"
          onClick={(event) => nav.openMenu([track.id], event.currentTarget)}
          aria-haspopup="menu"
          aria-label={t.more}
          title={t.more}
        >
          <Ellipsis size={24} />
        </button>
      </header>

      <div className="music-now-stage">
        <div className="music-now-art">
          <Cover albumId={track.albumId} cover={track.cover} label={track.album} />
        </div>
        <div className="music-now-meta">
          <div className="music-now-titles">
            <h1>{track.title}</h1>
            <p className="music-now-artists">
              {track.artists.length === 0 ? (
                <span>{t.unknownSinger}</span>
              ) : (
                track.artists.map((name, position) => (
                  <span key={name}>
                    {position > 0 && ', '}
                    <button
                      type="button"
                      onClick={() => {
                        music.setExpanded(false)
                        nav.go({ page: 'artist', key: keyOf(name) })
                      }}
                    >
                      {name}
                    </button>
                  </span>
                ))
              )}
            </p>
            <p className="music-now-film">
              <button
                type="button"
                onClick={() => {
                  music.setExpanded(false)
                  nav.go({ page: 'album', id: track.albumId })
                }}
              >
                {track.album}
              </button>
              {track.year ? ` · ${track.year}` : ''}
            </p>
          </div>
          <LikeButton trackId={track.id} size={26} />
        </div>
        <SeekBar />
        <Transport large />
        <div className="music-now-extras glass">
          <button
            className="music-icon-button"
            type="button"
            onClick={() => nav.pickPlaylist([track.id])}
            aria-label={t.addToPlaylist}
            title={t.addToPlaylist}
          >
            <Layers size={20} />
          </button>
          <button
            className="music-icon-button"
            type="button"
            onClick={() => music.startRadio({ kind: 'track', value: track.id })}
            aria-label={t.startRadio}
            title={t.startRadio}
          >
            <Radio size={20} />
          </button>
          <div className="music-now-volume">
            <Volume />
          </div>
          <div className="music-menu-host">
            <button
              className={`music-icon-button ${music.sleep.endsAt || music.sleep.endOfTrack || music.crossfade > 0 ? 'is-on' : ''}`}
              type="button"
              onClick={() => setSettings(!settings)}
              aria-haspopup="dialog"
              aria-expanded={settings}
              aria-label={t.playbackSettings}
              title={t.playbackSettings}
            >
              <SlidersHorizontal size={20} />
            </button>
            {settings && <PlaybackMenu onClose={() => setSettings(false)} />}
          </div>
        </div>
      </div>

      {sheetOpen && (
        <section className="music-sheet glass" aria-label={TABS.find((tab) => tab.id === music.sheet)?.label}>
          <button
            className="music-sheet-grab"
            type="button"
            onPointerDown={onGrab}
            onPointerUp={onRelease}
            onPointerCancel={() => {
              drag.current = null
            }}
            onClick={() => music.setSheet(null)}
            aria-label={t.closeSheet}
          >
            <span />
          </button>
          {music.sheet === 'queue' && <QueueSheet />}
          {music.sheet === 'lyrics' && <LyricsSheet />}
          {music.sheet === 'related' && <RelatedSheet />}
        </section>
      )}

      <nav className="music-now-tabs glass" aria-label={t.nowPlayingTabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={music.sheet === tab.id ? 'is-on' : ''}
            aria-pressed={music.sheet === tab.id}
            onClick={() => music.setSheet(music.sheet === tab.id ? null : tab.id)}
          >
            {tab.id === 'queue' ? <ListMusic size={16} /> : tab.id === 'lyrics' ? <Mic2 size={16} /> : <Layers size={16} />}
            {tab.label}
            {tab.id === 'queue' && music.queue.items.length - music.queue.index - 1 > 0 && (
              <span className="music-badge">{music.queue.items.length - music.queue.index - 1}</span>
            )}
          </button>
        ))}
      </nav>
      {sheetOpen && (
        <p className="sr-only" role="status">
          {formatContent(t.sheetOpened, { name: TABS.find((tab) => tab.id === music.sheet)?.label ?? '' })}
        </p>
      )}
    </div>
  )
}
