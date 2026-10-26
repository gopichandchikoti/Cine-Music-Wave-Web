import { Brain, Car, Dumbbell, Music2, Waves, Zap } from '../../components/icons'
import { useMemo, useState, type ReactNode } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { AlbumCard, ArtistCard, MixCard, RadioCard, SpeedDialTile } from './Cards'
import { Shelf, TrackColumns } from './Shelves'
import { useMusic } from './musicContext'
import { MOOD_LABEL } from './moodLabels'
import { buildShelves, MOODS, type MoodId, type Shelf as ShelfData } from './musicModel'
import { useMusicNav } from './musicNav'

const t = copy.musicView

const MOOD_ICON: Record<MoodId, ReactNode> = {
  energise: <Zap size={16} />,
  relax: <Waves size={16} />,
  workout: <Dumbbell size={16} />,
  commute: <Car size={16} />,
  focus: <Brain size={16} />,
}

const greeting = (hour: number): string =>
  hour < 5 ? t.greetingNight : hour < 12 ? t.greetingMorning : hour < 18 ? t.greetingAfternoon : t.greetingEvening

function ShelfView({ shelf }: { shelf: ShelfData }) {
  const music = useMusic()
  if (shelf.type === 'tiles' && shelf.id === 'speed-dial') {
    return (
      <section className="music-speed-dial" aria-label={shelf.title}>
        <header className="music-shelf-head">
          <div>
            <h2>{shelf.title}</h2>
            {shelf.subtitle && <p>{shelf.subtitle}</p>}
          </div>
        </header>
        <div className="music-speed-grid">
          {shelf.tiles.map((tile, position) => (
            <SpeedDialTile key={`${tile.kind}:${position}`} tile={tile} />
          ))}
        </div>
      </section>
    )
  }
  if (shelf.type === 'tiles') {
    return (
      <Shelf title={shelf.title} subtitle={shelf.subtitle}>
        {shelf.tiles.flatMap((tile, position) =>
          tile.kind === 'radio'
            ? [
                <RadioCard
                  key={`${tile.radio.id}:${position}`}
                  id={tile.radio.id}
                  label={tile.radio.label}
                  seedKind={tile.radio.seedKind}
                  seedValue={tile.radio.seedValue}
                  onRemove={
                    tile.radio.id.startsWith('suggested:')
                      ? undefined
                      : () => {
                          void music.deleteRadio(tile.radio.id)
                        }
                  }
                />,
              ]
            : [],
        )}
      </Shelf>
    )
  }
  if (shelf.type === 'tracks')
    return (
      <Shelf title={shelf.title} subtitle={shelf.subtitle} className="is-columns">
        <TrackColumns trackIds={shelf.trackIds} context={{ kind: 'mix', id: shelf.id, label: shelf.title }} />
      </Shelf>
    )
  if (shelf.type === 'albums')
    return (
      <Shelf title={shelf.title} subtitle={shelf.subtitle}>
        {shelf.albumIds.flatMap((id) => {
          const album = music.index.albumById.get(id)
          return album ? [<AlbumCard key={id} album={album} />] : []
        })}
      </Shelf>
    )
  if (shelf.type === 'artists')
    return (
      <Shelf title={shelf.title} subtitle={shelf.subtitle}>
        {shelf.keys.flatMap((key) => {
          const artist = music.index.artistByKey.get(key)
          return artist ? [<ArtistCard key={key} artist={artist} />] : []
        })}
      </Shelf>
    )
  return (
    <Shelf title={shelf.title} subtitle={shelf.subtitle}>
      {shelf.mixes.map((mix) => (
        <MixCard key={mix.id} mix={mix} />
      ))}
    </Shelf>
  )
}

export function HomePage() {
  const music = useMusic()
  const nav = useMusicNav()
  const [now] = useState(() => new Date())
  const shelves = useMemo(
    () => buildShelves({ index: music.index, state: music.user, films: music.films, now }),
    [music.index, music.user, music.films, now],
  )

  if (music.status === 'loading' || music.status === 'idle')
    return (
      <div className="music-state" role="status">
        <span className="music-spinner" />
        {t.loading}
      </div>
    )
  if (music.status === 'error' && music.index.tracks.length === 0)
    return (
      <div className="music-state" role="alert">
        <p>{music.error ?? t.loadFailed}</p>
        <button
          className="music-pill is-primary"
          type="button"
          onClick={() => {
            void music.refresh()
          }}
        >
          {t.tryAgain}
        </button>
      </div>
    )
  if (music.index.tracks.length === 0)
    return (
      <div className="music-state">
        <Music2 size={40} />
        <h2>{music.pending > 0 ? formatContent(t.readingSongs, { count: music.pending }) : t.emptyTitle}</h2>
        <p>{t.emptyBody}</p>
      </div>
    )

  return (
    <div className="music-page">
      <header className="music-home-head">
        <h1>{greeting(now.getHours())}</h1>
        <div className="music-chips" role="group" aria-label={t.moods}>
          {MOODS.map((mood) => (
            <button key={mood} className="music-chip" type="button" onClick={() => nav.go({ page: 'mood', id: mood })}>
              {MOOD_ICON[mood]}
              {MOOD_LABEL[mood]}
            </button>
          ))}
        </div>
        {music.pending > 0 && (
          <p className="music-note" role="status">
            <span className="music-spinner is-small" />
            {formatContent(t.readingSongs, { count: music.pending })}
          </p>
        )}
      </header>
      {shelves.map((shelf) => (
        <ShelfView key={shelf.id} shelf={shelf} />
      ))}
    </div>
  )
}
