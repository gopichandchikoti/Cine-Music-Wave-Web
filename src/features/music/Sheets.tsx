import { Eraser, Infinity as InfinityIcon, ListPlus, Radio, Repeat, Repeat1, Shuffle } from '../../components/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { fetchLyrics } from './musicApi'
import { useMusic, usePlaybackClock } from './musicContext'
import { artistLine, keyOf, radioTracks, seededRandom } from './musicModel'
import { useMusicNav } from './musicNav'
import type { Lyrics, MusicTrack } from './musicTypes'
import { TrackRow } from './TrackRow'
import { useSortable } from './useSortable'

const t = copy.musicView

/** Everything in the queue, in order, with the playing song marked. Drag a handle to re-order; press × to remove. */
export function QueueSheet() {
  const music = useMusic()
  const nav = useMusicNav()
  const list = useRef<HTMLUListElement>(null)
  const sortable = useSortable({ count: music.queue.items.length, onMove: music.moveInQueue })
  const currentUid = music.queue.items[music.queue.index]?.uid

  useEffect(() => {
    list.current?.querySelector('.is-current')?.scrollIntoView({ block: 'center' })
    // Only when the sheet opens: scrolling again whenever the song changes would fight someone who is browsing the queue.
  }, [])

  const rows = music.queue.items.flatMap((item, position) => {
    const track = music.index.byId.get(item.trackId)
    return track ? [{ item, track, position }] : []
  })
  const upcomingCount = Math.max(0, music.queue.items.length - music.queue.index - 1)

  return (
    <div className="music-sheet-body">
      <header className="music-sheet-head">
        <div>
          <h2>{t.upNext}</h2>
          <p>
            {music.context ? formatContent(t.playingFrom, { name: music.context.label }) : t.yourQueue}
            {upcomingCount > 0 ? ` · ${formatContent(t.songsToCome, { count: upcomingCount })}` : ''}
          </p>
        </div>
        <div className="music-sheet-tools">
          <button
            className={`music-icon-button ${music.shuffle ? 'is-on' : ''}`}
            type="button"
            onClick={music.toggleShuffle}
            aria-pressed={music.shuffle}
            aria-label={t.shuffle}
            title={t.shuffle}
          >
            <Shuffle size={18} />
          </button>
          <button
            className={`music-icon-button ${music.repeat !== 'off' ? 'is-on' : ''}`}
            type="button"
            onClick={music.cycleRepeat}
            aria-label={music.repeat === 'off' ? t.repeatOff : music.repeat === 'all' ? t.repeatAll : t.repeatOne}
            title={music.repeat === 'off' ? t.repeatOff : music.repeat === 'all' ? t.repeatAll : t.repeatOne}
          >
            {music.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
          <button
            className={`music-icon-button ${music.autoplay ? 'is-on' : ''}`}
            type="button"
            onClick={() => music.setAutoplay(!music.autoplay)}
            aria-pressed={music.autoplay}
            aria-label={t.autoplay}
            title={`${t.autoplay}: ${t.autoplayHint}`}
          >
            <InfinityIcon size={18} />
          </button>
          <button
            className="music-icon-button"
            type="button"
            onClick={() => nav.pickPlaylist(music.queue.items.map((item) => item.trackId))}
            aria-label={t.saveQueue}
            title={t.saveQueue}
            disabled={rows.length === 0}
          >
            <ListPlus size={18} />
          </button>
          <button
            className="music-icon-button"
            type="button"
            onClick={music.clearUpcoming}
            aria-label={t.clearQueue}
            title={t.clearQueue}
            disabled={upcomingCount === 0}
          >
            <Eraser size={18} />
          </button>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="music-empty-note">{t.queueEmpty}</p>
      ) : (
        <div className="music-sheet-scroll">
          <ul className="music-list is-queue" ref={list}>
            {rows.map(({ item, track, position }) => (
              <TrackRow
                key={item.uid}
                track={track}
                showAlbum={false}
                current={item.uid === currentUid}
                past={position < music.queue.index}
                source={{ queuePosition: position }}
                onPlay={() => music.jumpTo(position)}
                onRemove={() => music.removeFromQueue(position)}
                rowRef={sortable.setRow(position)}
                style={sortable.rowStyle(position)}
                dragging={sortable.dragging === position}
                handle={sortable.handleProps(position)}
              />
            ))}
          </ul>
          {music.autoplay && (
            <p className="music-note music-autoplay-note">
              <InfinityIcon size={14} />
              {t.autoplayContinues}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const activeIndex = (lines: readonly { time: number }[], position: number): number => {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (lines[middle].time <= position + 0.25) {
      found = middle
      low = middle + 1
    } else high = middle - 1
  }
  return found
}

/** Lyrics that follow the song (when they are timed), or plain lyrics to read. */
export function LyricsSheet() {
  const music = useMusic()
  const { position } = usePlaybackClock()
  const trackId = music.track?.id ?? null
  const [loaded, setLoaded] = useState<{ trackId: string; lyrics: Lyrics | null; failed: boolean } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const lastTouch = useRef(0)

  useEffect(() => {
    if (!trackId) return
    const controller = new AbortController()
    fetchLyrics(trackId, controller.signal).then(
      (lyrics) => setLoaded({ trackId, lyrics: lyrics.synced || lyrics.plain ? lyrics : null, failed: false }),
      () => {
        if (!controller.signal.aborted) setLoaded({ trackId, lyrics: null, failed: true })
      },
    )
    return () => controller.abort()
  }, [trackId])

  const state = loaded?.trackId === trackId ? loaded : null
  const lines = state?.lyrics?.synced ?? null
  const current = lines ? activeIndex(lines, position) : -1

  useEffect(() => {
    if (current < 0 || Date.now() - lastTouch.current < 4000) return
    scroller.current?.querySelector('.is-active')?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [current])

  return (
    <div className="music-sheet-body">
      <header className="music-sheet-head">
        <div>
          <h2>{t.lyrics}</h2>
          {music.track && <p>{music.track.title}</p>}
        </div>
      </header>
      <div
        className="music-lyrics"
        ref={scroller}
        onWheel={() => {
          lastTouch.current = Date.now()
        }}
        onTouchMove={() => {
          lastTouch.current = Date.now()
        }}
      >
        {!trackId && <p className="music-empty-note">{t.nothingPlaying}</p>}
        {trackId && !state && (
          <p className="music-note" role="status">
            <span className="music-spinner is-small" />
            {t.loadingLyrics}
          </p>
        )}
        {state?.failed && <p className="music-empty-note">{t.lyricsFailed}</p>}
        {state && !state.failed && !state.lyrics && (
          <p className="music-empty-note">
            {t.noLyrics}
            <small>{t.noLyricsHint}</small>
          </p>
        )}
        {lines &&
          lines.map((line, position) => (
            <button
              key={`${line.time}:${position}`}
              type="button"
              className={`music-lyric ${position === current ? 'is-active' : position < current ? 'is-past' : ''}`}
              onClick={() => music.seek(line.time)}
            >
              {line.text || '♪'}
            </button>
          ))}
        {state?.lyrics?.plain && <p className="music-lyrics-plain">{state.lyrics.plain}</p>}
      </div>
    </div>
  )
}

/** More from the same film and singers, and songs like this one. */
export function RelatedSheet() {
  const music = useMusic()
  const track = music.track
  const sections = useMemo(() => {
    if (!track) return null
    const sameAlbum = (music.index.albumById.get(track.albumId)?.trackIds ?? [])
      .filter((id) => id !== track.id)
      .flatMap((id) => music.index.byId.get(id) ?? [])
    const bySinger = [...new Set(track.artists.flatMap((name) => music.index.artistByKey.get(keyOf(name))?.trackIds ?? []))]
      .filter((id) => id !== track.id && !sameAlbum.some((entry) => entry.id === id))
      .flatMap((id) => music.index.byId.get(id) ?? [])
      .slice(0, 12)
    const like = radioTracks(
      music.index,
      { kind: 'track', value: track.id },
      { count: 13, random: seededRandom(`related:${track.id}`), exclude: new Set([track.id]), likes: music.likes },
    )
    return { sameAlbum, bySinger, like }
  }, [track, music.index, music.likes])
  if (!track || !sections)
    return (
      <div className="music-sheet-body">
        <p className="music-empty-note">{t.nothingPlaying}</p>
      </div>
    )
  const block = (title: string, tracks: readonly MusicTrack[], label: string, action?: () => void) =>
    tracks.length === 0 ? null : (
      <section className="music-section" aria-label={title}>
        <header className="music-section-head">
          <h3>{title}</h3>
          {action && (
            <button className="music-pill" type="button" onClick={action}>
              <Radio size={14} />
              {t.startRadio}
            </button>
          )}
        </header>
        <ul className="music-list">
          {tracks.map((entry, position) => (
            <TrackRow
              key={entry.id}
              track={entry}
              showAlbum={false}
              onPlay={() =>
                music.playTracks(
                  tracks.map((other) => other.id),
                  { start: position, context: { kind: 'mix', id: null, label } },
                )
              }
            />
          ))}
        </ul>
      </section>
    )
  return (
    <div className="music-sheet-body">
      <header className="music-sheet-head">
        <div>
          <h2>{t.related}</h2>
          <p>{artistLine(track) || track.album}</p>
        </div>
      </header>
      <div className="music-sheet-scroll">
        {block(formatContent(t.moreFromFilm, { name: track.album }), sections.sameAlbum, track.album)}
        {block(t.moreFromSingers, sections.bySinger, t.moreFromSingers)}
        {block(t.songsLikeThis, sections.like, t.songsLikeThis, () => music.startRadio({ kind: 'track', value: track.id }))}
      </div>
    </div>
  )
}
