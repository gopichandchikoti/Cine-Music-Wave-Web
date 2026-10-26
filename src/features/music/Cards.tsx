import { Heart, Play, Radio } from '../../components/icons'
import { content as copy, formatContent } from '../../content.js'
import { Cover, Mosaic } from './Cover'
import { useMusic } from './musicContext'
import { coversOf } from './musicHelpers'
import type { Album, Artist, Mix, Tile } from './musicModel'
import { useMusicNav } from './musicNav'
import type { PlaylistSummary } from './musicTypes'

const t = copy.musicView

const songCount = (count: number): string => formatContent(count === 1 ? t.oneSong : t.manySongs, { count })

/** The play button that appears over a card's picture. */
function PlayBadge({ label, onPlay }: { label: string; onPlay: () => void }) {
  return (
    <button
      className="music-card-play"
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onPlay()
      }}
      aria-label={label}
      title={label}
    >
      <Play size={22} fill="currentColor" />
    </button>
  )
}

export function AlbumCard({ album }: { album: Album }) {
  const music = useMusic()
  const nav = useMusicNav()
  const play = (): void =>
    music.playTracks(album.trackIds, { context: { kind: 'album', id: album.id, label: album.name }, shuffle: false })
  return (
    <article className="music-card">
      <button
        className="music-card-main"
        type="button"
        onClick={() => nav.go({ page: 'album', id: album.id })}
        aria-label={formatContent(t.openAlbum, { name: album.name })}
      >
        <Cover albumId={album.id} cover={album.cover} label={album.name} className="music-card-cover" />
        <strong>{album.name}</strong>
        <small>
          {[album.year, album.artists.slice(0, 2).join(', ') || songCount(album.trackIds.length)].filter(Boolean).join(' · ')}
        </small>
      </button>
      <PlayBadge label={formatContent(t.playAlbum, { name: album.name })} onPlay={play} />
    </article>
  )
}

export function ArtistCard({ artist }: { artist: Artist }) {
  const music = useMusic()
  const nav = useMusicNav()
  const play = (): void =>
    music.playTracks(artist.trackIds, { context: { kind: 'artist', id: artist.key, label: artist.name }, shuffle: true })
  return (
    <article className="music-card is-round">
      <button
        className="music-card-main"
        type="button"
        onClick={() => nav.go({ page: 'artist', key: artist.key })}
        aria-label={formatContent(t.openArtist, { name: artist.name })}
      >
        <Cover
          albumId={artist.coverAlbumId ?? ''}
          cover={artist.coverAlbumId !== null}
          label={artist.name}
          className="music-card-cover"
        />
        <strong>{artist.name}</strong>
        <small>{songCount(artist.trackIds.length)}</small>
      </button>
      <PlayBadge label={formatContent(t.playArtist, { name: artist.name })} onPlay={play} />
    </article>
  )
}

export function MixCard({ mix }: { mix: Mix }) {
  const music = useMusic()
  const nav = useMusicNav()
  const covers = mix.albumIds.flatMap((id) => {
    const album = music.index.albumById.get(id)
    return album ? [{ albumId: album.id, cover: album.cover, label: album.name }] : []
  })
  const play = (): void =>
    music.playTracks(mix.trackIds, { context: { kind: 'mix', id: mix.id, label: mix.title }, shuffle: false })
  return (
    <article className="music-card is-wide">
      <button
        className="music-card-main"
        type="button"
        onClick={() => nav.go({ page: 'mix', id: mix.id })}
        aria-label={mix.title}
      >
        <Mosaic covers={covers} label={mix.title} className="music-card-cover" />
        <strong>{mix.title}</strong>
        <small>{mix.description}</small>
      </button>
      <PlayBadge label={formatContent(t.playNamed, { name: mix.title })} onPlay={play} />
    </article>
  )
}

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  const music = useMusic()
  const nav = useMusicNav()
  const tracks = playlist.trackIds.flatMap((id) => music.index.byId.get(id) ?? [])
  const play = (): void =>
    music.playTracks(playlist.trackIds, { context: { kind: 'playlist', id: playlist.id, label: playlist.name }, shuffle: false })
  return (
    <article className="music-card">
      <button
        className="music-card-main"
        type="button"
        onClick={() => nav.go({ page: 'playlist', id: playlist.id })}
        aria-label={formatContent(t.openPlaylist, { name: playlist.name })}
      >
        <Mosaic covers={coversOf(tracks)} label={playlist.name} className="music-card-cover" />
        <strong>{playlist.name}</strong>
        <small>
          {t.playlistLabel} · {songCount(playlist.trackCount)}
        </small>
      </button>
      {tracks.length > 0 && <PlayBadge label={formatContent(t.playNamed, { name: playlist.name })} onPlay={play} />}
    </article>
  )
}

/** A radio station: starts endless music from a song, singer, film, genre or language. */
export function RadioCard({
  id,
  label,
  seedKind,
  seedValue,
  onRemove,
}: {
  id: string
  label: string
  seedKind: 'track' | 'artist' | 'album' | 'genre' | 'language'
  seedValue: string
  onRemove?: () => void
}) {
  const music = useMusic()
  const seedTracks =
    seedKind === 'artist'
      ? (music.index.artistByKey.get(seedValue.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))?.trackIds ?? [])
      : seedKind === 'album'
        ? (music.index.albumById.get(seedValue)?.trackIds ?? [])
        : seedKind === 'track'
          ? [seedValue]
          : music.index.tracks
              .filter((track) => (seedKind === 'genre' ? track.genre : track.language) === seedValue)
              .map((track) => track.id)
  const covers = coversOf(seedTracks.flatMap((trackId) => music.index.byId.get(trackId) ?? []))
  const start = (): void => music.startRadio({ kind: seedKind, value: seedValue }, label)
  return (
    <article className="music-card">
      <button className="music-card-main" type="button" onClick={start} aria-label={formatContent(t.playNamed, { name: label })}>
        <div className="music-radio-cover">
          <Mosaic covers={covers} label={label} className="music-card-cover" />
          <span className="music-radio-badge">
            <Radio size={14} />
            {t.radioBadge}
          </span>
        </div>
        <strong>{label}</strong>
        <small>{id.startsWith('suggested:') ? t.radioSuggested : t.radioSaved}</small>
      </button>
      <PlayBadge label={formatContent(t.playNamed, { name: label })} onPlay={start} />
      {onRemove && (
        <button className="music-card-remove" type="button" onClick={onRemove} aria-label={t.removeRadio} title={t.removeRadio}>
          ×
        </button>
      )}
    </article>
  )
}

/** Liked Songs, shown like a playlist. */
export function LikedCard() {
  const music = useMusic()
  const nav = useMusicNav()
  const ids = music.user.likes.filter((id) => music.index.byId.has(id))
  return (
    <article className="music-card">
      <button className="music-card-main" type="button" onClick={() => nav.go({ page: 'liked' })} aria-label={t.likedSongs}>
        <span className="music-cover music-liked-cover">
          <Heart size={42} fill="currentColor" />
        </span>
        <strong>{t.likedSongs}</strong>
        <small>
          {t.playlistLabel} · {songCount(ids.length)}
        </small>
      </button>
      {ids.length > 0 && (
        <PlayBadge
          label={formatContent(t.playNamed, { name: t.likedSongs })}
          onPlay={() => music.playTracks(ids, { context: { kind: 'liked', id: null, label: t.likedSongs }, shuffle: false })}
        />
      )}
    </article>
  )
}

/** One of the nine tiles of "Speed dial". */
export function SpeedDialTile({ tile }: { tile: Tile }) {
  const music = useMusic()
  const nav = useMusicNav()
  let title = ''
  let subtitle = ''
  let covers: { albumId: string; cover: boolean; label: string }[] = []
  let open: () => void = () => undefined
  let play: () => void = () => undefined
  if (tile.kind === 'album') {
    const album = music.index.albumById.get(tile.id)
    if (!album) return null
    title = album.name
    subtitle = t.albumLabel
    covers = [{ albumId: album.id, cover: album.cover, label: album.name }]
    open = () => nav.go({ page: 'album', id: album.id })
    play = () => music.playTracks(album.trackIds, { context: { kind: 'album', id: album.id, label: album.name }, shuffle: false })
  } else if (tile.kind === 'artist') {
    const artist = music.index.artistByKey.get(tile.key)
    if (!artist) return null
    title = artist.name
    subtitle = t.singerLabel
    covers = artist.coverAlbumId ? [{ albumId: artist.coverAlbumId, cover: true, label: artist.name }] : []
    open = () => nav.go({ page: 'artist', key: artist.key })
    play = () =>
      music.playTracks(artist.trackIds, { context: { kind: 'artist', id: artist.key, label: artist.name }, shuffle: true })
  } else if (tile.kind === 'playlist') {
    const playlist = music.user.playlists.find((entry) => entry.id === tile.id)
    if (!playlist) return null
    title = playlist.name
    subtitle = t.playlistLabel
    covers = coversOf(playlist.trackIds.flatMap((id) => music.index.byId.get(id) ?? []))
    open = () => nav.go({ page: 'playlist', id: playlist.id })
    play = () =>
      music.playTracks(playlist.trackIds, {
        context: { kind: 'playlist', id: playlist.id, label: playlist.name },
        shuffle: false,
      })
  } else if (tile.kind === 'radio') {
    title = tile.radio.label
    subtitle = t.radioBadge
    covers = coversOf(
      music.index.tracks.filter((track) =>
        tile.radio.seedKind === 'artist' ? track.artists.includes(tile.radio.seedValue) : false,
      ),
    )
    open = () => music.startRadio({ kind: tile.radio.seedKind, value: tile.radio.seedValue }, tile.radio.label)
    play = open
  } else if (tile.kind === 'liked') {
    title = t.likedSongs
    subtitle = t.playlistLabel
    open = () => nav.go({ page: 'liked' })
    play = () => music.playTracks(music.user.likes, { context: { kind: 'liked', id: null, label: t.likedSongs }, shuffle: false })
  } else return null
  return (
    <article className="music-tile">
      <button type="button" className="music-tile-main" onClick={open} aria-label={title}>
        {tile.kind === 'liked' ? (
          <span className="music-cover music-liked-cover">
            <Heart size={22} fill="currentColor" />
          </span>
        ) : (
          <Mosaic covers={covers} label={title} className="music-tile-cover" />
        )}
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
      </button>
      <PlayBadge label={formatContent(t.playNamed, { name: title })} onPlay={play} />
    </article>
  )
}
