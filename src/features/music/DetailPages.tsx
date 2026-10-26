import { ArrowLeft, Check, Ellipsis, Heart, ListEnd, Pencil, Play, Radio, Shuffle, Trash2, X } from '../../components/icons'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { AlbumCard, ArtistCard } from './Cards'
import { AlbumHeroPage, ArtistHeroPage } from './HeroPages'
import { coversOf, lengthOf } from './musicHelpers'
import { Cover, Mosaic } from './Cover'
import { MOOD_LABEL } from './moodLabels'
import { useMusic } from './musicContext'
import { dailyMixes, keyOf, moodTracks, type MoodId } from './musicModel'
import { useMusicNav, type MusicRoute } from './musicNav'
import type { MusicTrack, PlayContext } from './musicTypes'
import { TrackList } from './TrackList'
import { TrackRow } from './TrackRow'
import { useSortable } from './useSortable'

const t = copy.musicView
const songCount = (count: number): string => formatContent(count === 1 ? t.oneSong : t.manySongs, { count })

function Header({
  cover,
  kind,
  title,
  meta,
  children,
  round = false,
}: {
  cover: ReactNode
  kind: string
  title: ReactNode
  meta: ReactNode
  children?: ReactNode
  round?: boolean
}) {
  const nav = useMusicNav()
  return (
    <header className={`music-detail-head ${round ? 'is-round' : ''}`}>
      {nav.canGoBack && (
        <button className="music-icon-button music-back" type="button" onClick={nav.back} aria-label={t.back}>
          <ArrowLeft size={22} />
        </button>
      )}
      <div className="music-detail-cover">{cover}</div>
      <div className="music-detail-text">
        <span className="music-kicker">{kind}</span>
        <h1>{title}</h1>
        <p>{meta}</p>
        {children}
      </div>
    </header>
  )
}

/** Play, Shuffle, Radio and "…" for a set of songs. */
function Actions({
  tracks,
  context,
  radio,
  extra,
}: {
  tracks: readonly MusicTrack[]
  context: PlayContext
  radio?: { seed: { kind: 'artist' | 'album' | 'genre' | 'language' | 'track'; value: string }; label: string }
  extra?: ReactNode
}) {
  const music = useMusic()
  const nav = useMusicNav()
  const ids = tracks.map((track) => track.id)
  const saved = radio
    ? music.user.radios.some((entry) => entry.seedKind === radio.seed.kind && entry.seedValue === radio.seed.value)
    : false
  return (
    <div className="music-actions">
      <button
        className="music-pill is-primary"
        type="button"
        disabled={ids.length === 0}
        onClick={() => music.playTracks(ids, { context, shuffle: false, start: 0 })}
      >
        <Play size={16} fill="currentColor" />
        {t.play}
      </button>
      <button
        className="music-pill"
        type="button"
        disabled={ids.length === 0}
        onClick={() => music.playTracks(ids, { context, shuffle: true })}
      >
        <Shuffle size={16} />
        {t.shuffle}
      </button>
      {radio && (
        <button className="music-pill" type="button" onClick={() => music.startRadio(radio.seed, radio.label)}>
          <Radio size={16} />
          {t.radio}
        </button>
      )}
      {radio && (
        <button
          className={`music-pill ${saved ? 'is-on' : ''}`}
          type="button"
          aria-pressed={saved}
          disabled={saved}
          onClick={() => {
            void music.saveRadio(radio.seed, radio.label).then((created) => {
              if (created) music.toast(formatContent(t.radioSavedToast, { name: radio.label }))
            })
          }}
        >
          {saved ? <Check size={16} /> : <ListEnd size={16} />}
          {saved ? t.radioSaved : t.saveRadio}
        </button>
      )}
      <button
        className="music-icon-button"
        type="button"
        disabled={ids.length === 0}
        onClick={(event) => nav.openMenu(ids, event.currentTarget)}
        aria-haspopup="menu"
        aria-label={t.more}
        title={t.more}
      >
        <Ellipsis size={22} />
      </button>
      {extra}
    </div>
  )
}

export function AlbumPage({ route }: { route: Extract<MusicRoute, { page: 'album' }> }) {
  const music = useMusic()
  const nav = useMusicNav()
  const album = music.index.albumById.get(route.id)
  const tracks = useMemo(() => (album?.trackIds ?? []).flatMap((id) => music.index.byId.get(id) ?? []), [album, music.index])
  if (!album) return <p className="music-empty-note">{t.notFound}</p>
  const context: PlayContext = { kind: 'album', id: album.id, label: album.name }
  if (nav.compact) return <AlbumHeroPage album={album} tracks={tracks} context={context} />
  return (
    <div className="music-page">
      <Header
        cover={<Cover albumId={album.id} cover={album.cover} label={album.name} />}
        kind={t.albumLabel}
        title={album.name}
        meta={[album.year, songCount(tracks.length), lengthOf(tracks)].filter(Boolean).join(' · ')}
      >
        {album.artists.length > 0 && (
          <p className="music-credits">
            {album.artists.map((name, position) => (
              <span key={name}>
                {position > 0 && ', '}
                <button type="button" onClick={() => nav.go({ page: 'artist', key: keyOf(name) })}>
                  {name}
                </button>
              </span>
            ))}
          </p>
        )}
        {album.cast.length > 0 && (
          <p className="music-credits is-cast">
            <span>{t.starring}</span> {album.cast.join(', ')}
          </p>
        )}
        <Actions
          tracks={tracks}
          context={context}
          radio={{ seed: { kind: 'album', value: album.id }, label: `${album.name} Radio` }}
        />
      </Header>
      <TrackList tracks={tracks} context={context} numbered showAlbum={false} />
    </div>
  )
}

export function ArtistPage({ route }: { route: Extract<MusicRoute, { page: 'artist' }> }) {
  const { index, user } = useMusic()
  const nav = useMusicNav()
  const artist = index.artistByKey.get(route.key)
  const tracks = useMemo(() => (artist?.trackIds ?? []).flatMap((id) => index.byId.get(id) ?? []), [artist, index])
  const popular = useMemo(() => {
    const plays = new Map(user.plays.map((play) => [play.trackId, play.count]))
    return [...tracks]
      .sort(
        (left, right) =>
          (plays.get(right.id) ?? 0) - (plays.get(left.id) ?? 0) ||
          (right.year ?? 0) - (left.year ?? 0) ||
          left.title.localeCompare(right.title),
      )
      .slice(0, 8)
  }, [tracks, user.plays])
  const albums = useMemo(
    () =>
      (artist?.albumIds ?? [])
        .flatMap((id) => index.albumById.get(id) ?? [])
        .sort((left, right) => (right.year ?? 0) - (left.year ?? 0)),
    [artist, index],
  )
  const together = useMemo(() => {
    const counts = new Map<string, number>()
    for (const track of tracks)
      for (const name of track.artists) if (keyOf(name) !== route.key) counts.set(name, (counts.get(name) ?? 0) + 1)
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .flatMap(([name]) => index.artistByKey.get(keyOf(name)) ?? [])
  }, [tracks, index, route.key])
  if (!artist) return <p className="music-empty-note">{t.notFound}</p>
  const context: PlayContext = { kind: 'artist', id: artist.key, label: artist.name }
  if (nav.compact)
    return (
      <ArtistHeroPage artist={artist} tracks={tracks} popular={popular} albums={albums} together={together} context={context} />
    )
  return (
    <div className="music-page">
      <Header
        round
        cover={<Mosaic covers={coversOf(tracks)} label={artist.name} />}
        kind={t.singerLabel}
        title={artist.name}
        meta={[songCount(tracks.length), `${albums.length} ${albums.length === 1 ? t.filmOne : t.filmMany}`].join(' · ')}
      >
        <Actions
          tracks={tracks}
          context={context}
          radio={{ seed: { kind: 'artist', value: artist.name }, label: `${artist.name} Radio` }}
        />
      </Header>
      <section className="music-section" aria-label={t.popular}>
        <h2>{t.popular}</h2>
        <TrackList tracks={popular} context={{ ...context, label: `${artist.name} · ${t.popular}` }} />
      </section>
      {albums.length > 0 && (
        <section className="music-section" aria-label={t.scopeFilms}>
          <h2>{t.scopeFilms}</h2>
          <div className="music-grid">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}
      {tracks.length > popular.length && (
        <section className="music-section" aria-label={t.allSongs}>
          <h2>{t.allSongs}</h2>
          <TrackList tracks={tracks} context={context} />
        </section>
      )}
      {together.length > 0 && (
        <section className="music-section" aria-label={t.singsWith}>
          <h2>{t.singsWith}</h2>
          <div className="music-grid">
            {together.map((other) => (
              <ArtistCard key={other.key} artist={other} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** A page for a fixed list of songs: a daily mix or a mood. */
function ListPage({
  title,
  subtitle,
  tracks,
  context,
  kind,
}: {
  title: string
  subtitle: string
  tracks: readonly MusicTrack[]
  context: PlayContext
  kind: string
}) {
  return (
    <div className="music-page">
      <Header
        cover={<Mosaic covers={coversOf(tracks)} label={title} />}
        kind={kind}
        title={title}
        meta={`${subtitle} · ${songCount(tracks.length)} · ${lengthOf(tracks)}`}
      >
        <Actions tracks={tracks} context={context} />
      </Header>
      <TrackList tracks={tracks} context={context} />
    </div>
  )
}

export function MixPage({ route }: { route: Extract<MusicRoute, { page: 'mix' }> }) {
  const music = useMusic()
  const [now] = useState(() => new Date())
  const mix = useMemo(
    () => dailyMixes(music.index, music.user, now).find((entry) => entry.id === route.id),
    [music.index, music.user, now, route.id],
  )
  if (!mix) return <p className="music-empty-note">{t.notFound}</p>
  const tracks = mix.trackIds.flatMap((id) => music.index.byId.get(id) ?? [])
  return (
    <ListPage
      title={mix.title}
      subtitle={mix.description}
      tracks={tracks}
      kind={t.mixLabel}
      context={{ kind: 'mix', id: mix.id, label: mix.title }}
    />
  )
}

export function MoodPage({ route }: { route: Extract<MusicRoute, { page: 'mood' }> }) {
  const music = useMusic()
  const [now] = useState(() => new Date())
  const mood = route.id as MoodId
  const tracks = useMemo(() => moodTracks(music.index, mood, now), [music.index, mood, now])
  const label = MOOD_LABEL[mood] ?? mood
  return (
    <ListPage
      title={label}
      subtitle={t.moodSubtitle}
      tracks={tracks}
      kind={t.moodLabel}
      context={{ kind: 'mix', id: `mood:${mood}`, label }}
    />
  )
}

export function LikedPage() {
  const music = useMusic()
  const tracks = music.user.likes.flatMap((id) => music.index.byId.get(id) ?? [])
  return (
    <div className="music-page">
      <Header
        cover={
          <span className="music-cover music-liked-cover">
            <Heart size={72} fill="currentColor" />
          </span>
        }
        kind={t.playlistLabel}
        title={t.likedSongs}
        meta={`${songCount(tracks.length)} · ${lengthOf(tracks)}`}
      >
        <Actions tracks={tracks} context={{ kind: 'liked', id: null, label: t.likedSongs }} />
      </Header>
      {tracks.length === 0 ? (
        <p className="music-empty-note">{t.noLikesYet}</p>
      ) : (
        <TrackList tracks={tracks} context={{ kind: 'liked', id: null, label: t.likedSongs }} />
      )}
    </div>
  )
}

export function PlaylistPage({ route }: { route: Extract<MusicRoute, { page: 'playlist' }> }) {
  const music = useMusic()
  const nav = useMusicNav()
  const playlist = music.user.playlists.find((entry) => entry.id === route.id)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [confirming, setConfirming] = useState(false)
  const ids = playlist?.trackIds ?? []
  const sortable = useSortable({
    count: ids.length,
    onMove: (from, to) => {
      if (!playlist) return
      const next = [...playlist.trackIds]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      void music.setPlaylistTracks(playlist.id, next)
    },
  })
  if (!playlist)
    return (
      <div className="music-page">
        <p className="music-empty-note">{t.notFound}</p>
      </div>
    )
  const tracks = ids.map((id) => music.index.byId.get(id))
  const known = tracks.filter((track): track is MusicTrack => track !== undefined)
  const context: PlayContext = { kind: 'playlist', id: playlist.id, label: playlist.name }
  const save = (event: FormEvent): void => {
    event.preventDefault()
    if (name.trim() && name.trim() !== playlist.name) void music.renamePlaylist(playlist.id, name.trim())
    setEditing(false)
  }
  return (
    <div className="music-page">
      <Header
        cover={<Mosaic covers={coversOf(known)} label={playlist.name} />}
        kind={t.playlistLabel}
        title={
          editing ? (
            <form className="music-rename" onSubmit={save}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label={t.newPlaylistName}
                maxLength={80}
                autoFocus
              />
              <button className="music-icon-button" type="submit" aria-label={t.save}>
                <Check size={20} />
              </button>
              <button className="music-icon-button" type="button" onClick={() => setEditing(false)} aria-label={t.cancel}>
                <X size={20} />
              </button>
            </form>
          ) : (
            playlist.name
          )
        }
        meta={`${songCount(known.length)} · ${lengthOf(known)}`}
      >
        <Actions
          tracks={known}
          context={context}
          extra={
            <>
              <button
                className="music-icon-button"
                type="button"
                onClick={() => {
                  setName(playlist.name)
                  setEditing(true)
                }}
                aria-label={t.renamePlaylist}
                title={t.renamePlaylist}
              >
                <Pencil size={20} />
              </button>
              {confirming ? (
                <span className="music-confirm">
                  {t.deletePlaylistQuestion}
                  <button
                    className="music-pill is-danger"
                    type="button"
                    onClick={() => {
                      void music.deletePlaylist(playlist.id).then(() => nav.go({ page: 'library', tab: 'playlists' }))
                    }}
                  >
                    {t.delete}
                  </button>
                  <button className="music-pill" type="button" onClick={() => setConfirming(false)}>
                    {t.cancel}
                  </button>
                </span>
              ) : (
                <button
                  className="music-icon-button"
                  type="button"
                  onClick={() => setConfirming(true)}
                  aria-label={t.deletePlaylist}
                  title={t.deletePlaylist}
                >
                  <Trash2 size={20} />
                </button>
              )}
            </>
          }
        />
      </Header>
      {ids.length === 0 ? (
        <p className="music-empty-note">{t.emptyPlaylist}</p>
      ) : (
        <div className="music-sort-scroll">
          <ul className="music-list">
            {ids.map((id, position) => {
              const track = music.index.byId.get(id)
              if (!track) return null
              return (
                <TrackRow
                  key={`${id}:${position}`}
                  track={track}
                  source={{ playlistId: playlist.id, playlistPosition: position }}
                  rowRef={sortable.setRow(position)}
                  style={sortable.rowStyle(position)}
                  dragging={sortable.dragging === position}
                  handle={sortable.handleProps(position)}
                  onPlay={() => music.playTracks(ids, { start: position, context })}
                />
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
