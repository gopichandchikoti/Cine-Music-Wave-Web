import {
  Heart,
  Infinity as InfinityIcon,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from '../../components/icons'
import { useEffect, useRef, useState } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { usePlaybackClock, useMusic } from './musicContext'
import { MAX_CROSSFADE_SECONDS } from './engine'
import { formatTime } from './musicModel'

const t = copy.musicView

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high)

/** The progress slider with the elapsed and remaining time. Dragging only moves the handle; the song jumps when you let go. */
export function SeekBar({ compact = false }: { compact?: boolean }) {
  const music = useMusic()
  const { position, duration } = usePlaybackClock()
  const [scrub, setScrub] = useState<number | null>(null)
  const shown = scrub ?? position
  const commit = (): void => {
    if (scrub === null) return
    music.seek(scrub)
    setScrub(null)
  }
  return (
    <div className={`music-seek ${compact ? 'is-compact' : ''}`}>
      {!compact && <span className="music-time">{formatTime(shown)}</span>}
      <input
        type="range"
        aria-label={t.seek}
        min={0}
        max={Math.max(duration, 1)}
        step={1}
        value={clamp(shown, 0, Math.max(duration, 1))}
        style={{ ['--filled' as string]: `${duration > 0 ? clamp((shown / duration) * 100, 0, 100) : 0}%` }}
        onChange={(event) => setScrub(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        disabled={!music.track}
      />
      {!compact && <span className="music-time">{formatTime(Math.max(0, duration - shown))}</span>}
    </div>
  )
}

/** Shuffle, previous, play or pause, next and repeat. */
export function Transport({ large = false }: { large?: boolean }) {
  const music = useMusic()
  const size = large ? 30 : 22
  return (
    <div className={`music-transport ${large ? 'is-large' : ''}`}>
      <button
        className={`music-icon-button ${music.shuffle ? 'is-on' : ''}`}
        type="button"
        onClick={music.toggleShuffle}
        aria-pressed={music.shuffle}
        aria-label={t.shuffle}
        title={t.shuffle}
      >
        <Shuffle size={size - 6} />
      </button>
      <button
        className="music-icon-button"
        type="button"
        onClick={music.previous}
        aria-label={t.previous}
        title={t.previous}
        disabled={!music.track}
      >
        <SkipBack size={size} fill="currentColor" />
      </button>
      <button
        className="music-play-button"
        type="button"
        onClick={music.toggle}
        aria-label={music.playing ? t.pause : t.play}
        title={music.playing ? t.pause : t.play}
        disabled={!music.track}
      >
        {music.buffering && music.playing ? (
          <span className="music-spinner" />
        ) : music.playing ? (
          <Pause size={size + 4} fill="currentColor" />
        ) : (
          <Play size={size + 4} fill="currentColor" />
        )}
      </button>
      <button
        className="music-icon-button"
        type="button"
        onClick={music.next}
        aria-label={t.next}
        title={t.next}
        disabled={!music.track}
      >
        <SkipForward size={size} fill="currentColor" />
      </button>
      <button
        className={`music-icon-button ${music.repeat !== 'off' ? 'is-on' : ''}`}
        type="button"
        onClick={music.cycleRepeat}
        aria-label={music.repeat === 'off' ? t.repeatOff : music.repeat === 'all' ? t.repeatAll : t.repeatOne}
        title={music.repeat === 'off' ? t.repeatOff : music.repeat === 'all' ? t.repeatAll : t.repeatOne}
      >
        {music.repeat === 'one' ? <Repeat1 size={size - 6} /> : <Repeat size={size - 6} />}
      </button>
    </div>
  )
}

export function LikeButton({ trackId, size = 22 }: { trackId: string; size?: number }) {
  const music = useMusic()
  const liked = music.likes.has(trackId)
  return (
    <button
      className={`music-icon-button music-like ${liked ? 'is-on' : ''}`}
      type="button"
      onClick={() => music.toggleLike(trackId)}
      aria-pressed={liked}
      aria-label={liked ? t.unlike : t.like}
      title={liked ? t.unlike : t.like}
    >
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} />
    </button>
  )
}

export function Volume() {
  const music = useMusic()
  const level = music.muted ? 0 : music.volume
  return (
    <div className="music-volume">
      <button
        className="music-icon-button"
        type="button"
        onClick={music.toggleMute}
        aria-label={music.muted || music.volume === 0 ? t.unmute : t.mute}
        title={music.muted || music.volume === 0 ? t.unmute : t.mute}
      >
        {level === 0 ? <VolumeX size={20} /> : level < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
      </button>
      <input
        type="range"
        aria-label={t.volume}
        min={0}
        max={1}
        step={0.02}
        value={level}
        style={{ ['--filled' as string]: `${level * 100}%` }}
        onChange={(event) => music.setVolume(Number(event.target.value))}
      />
    </div>
  )
}

const SLEEP_CHOICES = [5, 10, 15, 30, 45, 60]
const RATES = [0.75, 1, 1.25, 1.5, 2]

/** Sleep timer, crossfade, autoplay and speed, in one panel. */
export function PlaybackMenu({ onClose }: { onClose: () => void }) {
  const music = useMusic()
  const panel = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    const onDown = (event: PointerEvent): void => {
      if (panel.current && !panel.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose])
  const remaining = music.sleep.endsAt ? Math.max(1, Math.round((music.sleep.endsAt - now) / 60_000)) : null
  return (
    <div className="music-popover glass" ref={panel} role="dialog" aria-label={t.playbackSettings}>
      <header>
        <h3>{t.playbackSettings}</h3>
        <button className="music-icon-button" type="button" onClick={onClose} aria-label={t.close}>
          <X size={18} />
        </button>
      </header>
      <section>
        <h4>
          <Moon size={14} />
          {t.sleepTimer}
        </h4>
        <p className="music-note">
          {music.sleep.endOfTrack
            ? t.sleepAtEndOfSong
            : remaining
              ? formatContent(t.sleepIn, { minutes: remaining })
              : t.sleepOff}
        </p>
        <div className="music-chips">
          {SLEEP_CHOICES.map((minutes) => (
            <button key={minutes} className="music-chip" type="button" onClick={() => music.setSleep(minutes)}>
              {formatContent(t.minutes, { minutes })}
            </button>
          ))}
          <button className="music-chip" type="button" onClick={() => music.setSleep('track')}>
            {t.endOfSong}
          </button>
          {(music.sleep.endsAt || music.sleep.endOfTrack) && (
            <button className="music-chip is-clear" type="button" onClick={() => music.setSleep(null)}>
              {t.turnOff}
            </button>
          )}
        </div>
      </section>
      <section>
        <h4>{t.crossfade}</h4>
        <div className="music-range-row">
          <input
            type="range"
            aria-label={t.crossfade}
            min={0}
            max={MAX_CROSSFADE_SECONDS}
            step={1}
            value={music.crossfade}
            style={{ ['--filled' as string]: `${(music.crossfade / MAX_CROSSFADE_SECONDS) * 100}%` }}
            onChange={(event) => music.setCrossfade(Number(event.target.value))}
          />
          <output>{music.crossfade === 0 ? t.off : formatContent(t.seconds, { seconds: music.crossfade })}</output>
        </div>
        <p className="music-note">{t.crossfadeHint}</p>
      </section>
      <section className="music-switch-row">
        <div>
          <h4>
            <InfinityIcon size={14} />
            {t.autoplay}
          </h4>
          <p className="music-note">{t.autoplayHint}</p>
        </div>
        <button
          className={`music-switch ${music.autoplay ? 'is-on' : ''}`}
          type="button"
          role="switch"
          aria-checked={music.autoplay}
          aria-label={t.autoplay}
          onClick={() => music.setAutoplay(!music.autoplay)}
        >
          <span />
        </button>
      </section>
      <section>
        <h4>{t.speed}</h4>
        <div className="music-chips">
          {RATES.map((rate) => (
            <button
              key={rate}
              className={`music-chip ${music.rate === rate ? 'is-on' : ''}`}
              type="button"
              aria-pressed={music.rate === rate}
              onClick={() => music.setRate(rate)}
            >{`${rate}×`}</button>
          ))}
        </div>
      </section>
    </div>
  )
}
