import { Play, Radio, Shuffle, Star } from '../../components/icons'
import { useMemo } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { AlbumCard, ArtistCard } from './Cards'
import { Cover } from './Cover'
import { ActionCircle, HeroPage, useHeroStyle } from './Hero'
import { lengthOf } from './musicHelpers'
import { useMusic } from './musicContext'
import { keyOf, type Album, type Artist } from './musicModel'
import { useMusicNav } from './musicNav'
import type { MusicTrack, PlayContext } from './musicTypes'
import { Shelf, TrackColumns } from './Shelves'
import { TrackList } from './TrackList'

/*
 * The singer and album pages on a phone: a picture edge to edge, the name over its foot, round buttons, then the page on a tint taken
 * from the picture. Wide screens keep the headers in DetailPages.
 */

const t = copy.musicView
/** How many songs "Top songs" shows: three columns of four. */
const TOP_SONGS = 12
/** How much of the shelf the next column of "Top songs" shows at its edge, so it is plain there is more to swipe to. */
const TOP_SONGS_PEEK = 0.16
/** Extra room under the album's picture for its singers, details and buttons. */
const ALBUM_HERO_EXTRA = 110

const songCount = (count: number): string => formatContent(count === 1 ? t.oneSong : t.manySongs, { count })

/** The album the singer is best known by here: the one whose songs were played most, then the newest. */
function featuredOf(albums: readonly Album[], plays: ReadonlyMap<string, number>): Album | null {
  const played = (album: Album): number => album.trackIds.reduce((total, id) => total + (plays.get(id) ?? 0), 0)
  return [...albums].sort((left, right) => played(right) - played(left) || (right.year ?? 0) - (left.year ?? 0))[0] ?? null
}

function FeaturedAlbum({ album }: { album: Album }) {
  const music = useMusic()
  const nav = useMusicNav()
  return (
    <div className="music-featured glass">
      <button
        className="music-featured-main"
        type="button"
        onClick={() => nav.go({ page: 'album', id: album.id })}
        aria-label={formatContent(t.openAlbum, { name: album.name })}
      >
        <Cover albumId={album.id} cover={album.cover} label={album.name} className="music-featured-cover" />
        <span>
          <small>{t.featuredAlbum}</small>
          <strong>{album.name}</strong>
          <em>{[album.year, songCount(album.trackIds.length)].filter(Boolean).join(' · ')}</em>
        </span>
      </button>
      <button
        className="music-featured-play"
        type="button"
        onClick={() =>
          music.playTracks(album.trackIds, { context: { kind: 'album', id: album.id, label: album.name }, shuffle: false })
        }
        aria-label={formatContent(t.playAlbum, { name: album.name })}
        title={formatContent(t.playAlbum, { name: album.name })}
      >
        <Play size={20} fill="currentColor" />
      </button>
    </div>
  )
}

type ArtistHeroProps = {
  artist: Artist
  tracks: readonly MusicTrack[]
  popular: readonly MusicTrack[]
  albums: readonly Album[]
  together: readonly Artist[]
  context: PlayContext
}

export function ArtistHeroPage({ artist, tracks, popular, albums, together, context }: ArtistHeroProps) {
  const music = useMusic()
  const style = useHeroStyle(artist.coverAlbumId ?? '', artist.coverAlbumId !== null)
  const ids = tracks.map((track) => track.id)
  const radioLabel = `${artist.name} Radio`
  const saved = music.user.radios.find((radio) => radio.seedKind === 'artist' && keyOf(radio.seedValue) === artist.key)
  const plays = useMemo(() => new Map(music.user.plays.map((play) => [play.trackId, play.count])), [music.user.plays])
  const featured = useMemo(() => featuredOf(albums, plays), [albums, plays])
  const top = useMemo(() => popular.slice(0, TOP_SONGS).map((track) => track.id), [popular])
  const toggleSaved = (): void => {
    if (saved) {
      void music.deleteRadio(saved.id).then(() => music.toast(formatContent(t.radioRemovedToast, { name: radioLabel })))
      return
    }
    void music.saveRadio({ kind: 'artist', value: artist.name }, radioLabel).then((created) => {
      if (created) music.toast(formatContent(t.radioSavedToast, { name: radioLabel }))
    })
  }
  return (
    <HeroPage
      albumId={artist.coverAlbumId ?? ''}
      cover={artist.coverAlbumId !== null}
      label={artist.name}
      style={style}
      head={
        <>
          <h1>{artist.name}</h1>
          <div className="music-hero-actions">
            <ActionCircle
              icon={Star}
              on={saved !== undefined}
              label={formatContent(saved ? t.removeArtistRadio : t.saveArtistRadio, { name: radioLabel })}
              onClick={toggleSaved}
            />
            <ActionCircle
              icon={Play}
              filled
              disabled={ids.length === 0}
              label={t.play}
              onClick={() => music.playTracks(ids, { context, shuffle: false, start: 0 })}
            />
            <ActionCircle
              icon={Shuffle}
              disabled={ids.length === 0}
              label={t.shuffle}
              onClick={() => music.playTracks(ids, { context, shuffle: true })}
            />
          </div>
        </>
      }
    >
      {featured && <FeaturedAlbum album={featured} />}
      {top.length > 0 && (
        <Shelf title={t.topSongs} arrows={false}>
          <TrackColumns
            trackIds={top}
            context={{ ...context, label: `${artist.name} · ${t.topSongs}` }}
            divided
            peek={TOP_SONGS_PEEK}
            subtitle={(track) => [track.album, track.year].filter(Boolean).join(' · ')}
          />
        </Shelf>
      )}
      {albums.length > 0 && (
        <Shelf title={t.scopeFilms} arrows={false}>
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </Shelf>
      )}
      {tracks.length > popular.length && (
        <section className="music-section" aria-label={t.allSongs}>
          <h2>{t.allSongs}</h2>
          <TrackList tracks={tracks} context={context} flush />
        </section>
      )}
      {together.length > 0 && (
        <Shelf title={t.singsWith} arrows={false}>
          {together.map((other) => (
            <ArtistCard key={other.key} artist={other} />
          ))}
        </Shelf>
      )}
    </HeroPage>
  )
}

export function AlbumHeroPage({ album, tracks, context }: { album: Album; tracks: readonly MusicTrack[]; context: PlayContext }) {
  const music = useMusic()
  const nav = useMusicNav()
  const style = useHeroStyle(album.id, album.cover, ALBUM_HERO_EXTRA)
  const ids = tracks.map((track) => track.id)
  const meta = [album.year, songCount(tracks.length), lengthOf(tracks)].filter(Boolean).join(' · ')
  return (
    <HeroPage
      albumId={album.id}
      cover={album.cover}
      label={album.name}
      style={style}
      head={
        <>
          <h1>{album.name}</h1>
          {album.artists.length > 0 && (
            <p className="music-hero-credits">
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
          <p className="music-hero-meta">{meta}</p>
          {album.cast.length > 0 && (
            <p className="music-hero-meta">
              {t.starring} {album.cast.join(', ')}
            </p>
          )}
          <div className="music-hero-actions is-album">
            <ActionCircle
              icon={Shuffle}
              small
              disabled={ids.length === 0}
              label={t.shuffle}
              onClick={() => music.playTracks(ids, { context, shuffle: true })}
            />
            <button
              className="music-hero-play"
              type="button"
              disabled={ids.length === 0}
              onClick={() => music.playTracks(ids, { context, shuffle: false, start: 0 })}
            >
              <Play size={20} fill="currentColor" />
              {t.play}
            </button>
            <ActionCircle
              icon={Radio}
              small
              label={`${t.startRadio}: ${album.name}`}
              onClick={() => music.startRadio({ kind: 'album', value: album.id }, `${album.name} Radio`)}
            />
          </div>
        </>
      }
    >
      <TrackList tracks={tracks} context={context} numbered showAlbum={false} />
    </HeroPage>
  )
}
