import { ChevronUp, ListMusic, Mic2, Pause, Play, SkipForward, SlidersHorizontal } from '../../components/icons'
import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { content as copy } from '../../content.js'
import { Cover } from './Cover'
import { useMusic, usePlaybackClock } from './musicContext'
import { artistLine, keyOf } from './musicModel'
import { useMusicNav } from './musicNav'
import { LikeButton, PlaybackMenu, SeekBar, Transport, Volume } from './PlayerParts'

const t = copy.musicView

/** The thin progress line along the top of the phone-style mini player. */
function MiniProgress() {
  const { position, duration } = usePlaybackClock()
  return (
    <span className="music-mini-progress" aria-hidden="true">
      <span style={{ width: `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%` }} />
    </span>
  )
}

/** Anything on the player that does its own job; pressing one of these must not also open the full-screen player. */
const OWN_JOB = 'button, a, input, select, textarea, label, [role="dialog"], [role="menu"]'

/**
 * Lets the whole player surface open the full-screen player while its buttons, sliders and menus keep doing their own jobs. A press
 * only counts when it started and ended off a control, so dragging a slider and letting go over the bar does nothing.
 */
function useSurfaceOpen(open: () => void) {
  const armed = useRef(false)
  const onControl = (target: EventTarget): boolean => !(target instanceof Element) || target.closest(OWN_JOB) !== null
  return {
    onPointerDownCapture: (event: PointerEvent<HTMLElement>): void => {
      armed.current = !onControl(event.target)
    },
    onClick: (event: MouseEvent<HTMLElement>): void => {
      const pressedOffControl = armed.current
      armed.current = false
      if (pressedOffControl && !onControl(event.target)) open()
    },
  }
}

/**
 * The phone's mini player: a rounded pill in the dock with the song, play or pause, and next. Pressing the song (or anywhere on the
 * pill that is not a button) opens the full-screen player.
 */
export function MiniPlayer() {
  const music = useMusic()
  const surface = useSurfaceOpen(() => music.setExpanded(true))
  const track = music.track
  if (!track) return null
  return (
    <div className="music-mini glass" role="region" aria-label={t.nowPlaying} {...surface}>
      <MiniProgress />
      <button className="music-mini-main" type="button" onClick={() => music.setExpanded(true)} aria-label={t.expandPlayer}>
        <Cover albumId={track.albumId} cover={track.cover} label={track.album} className="music-mini-cover" />
        <span className="music-mini-text">
          <strong>{track.title}</strong>
          <small>{artistLine(track) || track.album}</small>
        </span>
      </button>
      <button
        className="music-icon-button music-mini-play"
        type="button"
        onClick={music.toggle}
        aria-label={music.playing ? t.pause : t.play}
      >
        {music.buffering && music.playing ? (
          <span className="music-spinner is-small" />
        ) : music.playing ? (
          <Pause size={24} fill="currentColor" />
        ) : (
          <Play size={24} fill="currentColor" />
        )}
      </button>
      <button className="music-icon-button" type="button" onClick={music.next} aria-label={t.next}>
        <SkipForward size={22} fill="currentColor" />
      </button>
    </div>
  )
}

/**
 * The player that stays at the bottom while you browse. Wide screens get the full Spotify-style bar; phones get the mini player in
 * the dock (see PhoneDock). Pressing anywhere on the bar (or the song, or the arrow) opens the full-screen player.
 */
export function PlayerBar() {
  const music = useMusic()
  const nav = useMusicNav()
  const [settings, setSettings] = useState(false)
  const surface = useSurfaceOpen(() => music.setExpanded(true))
  const track = music.track
  if (!track) return null
  const open = (): void => music.setExpanded(true)

  if (nav.compact) return null

  return (
    <div className="music-bar glass" role="region" aria-label={t.nowPlaying} {...surface}>
      <div className="music-bar-song">
        <button className="music-bar-cover" type="button" onClick={open} aria-label={t.expandPlayer} title={t.expandPlayer}>
          <Cover albumId={track.albumId} cover={track.cover} label={track.album} />
        </button>
        <div className="music-bar-text">
          <button type="button" className="music-bar-title" onClick={() => nav.go({ page: 'album', id: track.albumId })}>
            {track.title}
          </button>
          <span className="music-bar-artists">
            {track.artists.length === 0
              ? track.album
              : track.artists.map((name, position) => (
                  <span key={name}>
                    {position > 0 && ', '}
                    <button type="button" onClick={() => nav.go({ page: 'artist', key: keyOf(name) })}>
                      {name}
                    </button>
                  </span>
                ))}
          </span>
        </div>
        <LikeButton trackId={track.id} size={20} />
      </div>
      <div className="music-bar-center">
        <Transport />
        <SeekBar />
      </div>
      <div className="music-bar-tools">
        <button
          className={`music-icon-button ${music.sheet === 'lyrics' && music.expanded ? 'is-on' : ''}`}
          type="button"
          onClick={() => {
            music.setSheet('lyrics')
            music.setExpanded(true)
          }}
          aria-label={t.lyrics}
          title={t.lyrics}
        >
          <Mic2 size={20} />
        </button>
        <button
          className="music-icon-button"
          type="button"
          onClick={() => {
            music.setSheet('queue')
            music.setExpanded(true)
          }}
          aria-label={t.upNext}
          title={t.upNext}
        >
          <ListMusic size={20} />
        </button>
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
        <Volume />
        <button className="music-icon-button" type="button" onClick={open} aria-label={t.expandPlayer} title={t.expandPlayer}>
          <ChevronUp size={22} />
        </button>
      </div>
    </div>
  )
}
