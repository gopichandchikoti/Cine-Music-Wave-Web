import { Play, Search, Shuffle, X } from '../../components/icons'
import { useDeferredValue, useMemo, useState } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { AlbumCard, ArtistCard, PlaylistCard } from './Cards'
import { Shelf } from './Shelves'
import { FilterBar } from './FilterBar'
import { describeFilters } from './musicHelpers'
import { useMusic } from './musicContext'
import { searchLibrary, type SearchFilters, type SearchScope } from './musicModel'
import type { MusicRoute } from './musicNav'
import { TrackList } from './TrackList'

const t = copy.musicView

const SCOPES: readonly { id: SearchScope; label: string }[] = [
  { id: 'all', label: t.scopeAll },
  { id: 'songs', label: t.scopeSongs },
  { id: 'albums', label: t.scopeFilms },
  { id: 'artists', label: t.scopeSingers },
  { id: 'playlists', label: t.scopePlaylists },
]

/** Find songs by song name, singer, film or cast, and narrow them with filters. */
export function SearchPage({ route }: { route: Extract<MusicRoute, { page: 'search' }> }) {
  const music = useMusic()
  const [query, setQuery] = useState(route.query ?? '')
  const [scope, setScope] = useState<SearchScope>(route.scope ?? 'all')
  const [filters, setFilters] = useState<SearchFilters>(route.filters ?? {})
  const deferred = useDeferredValue(query)
  const filtered = Object.values(filters).some((value) => value !== undefined && value !== false && value !== '')
  const results = useMemo(
    () => searchLibrary(music.index, deferred, { filters, likes: music.likes, playlists: music.user.playlists }),
    [music.index, deferred, filters, music.likes, music.user.playlists],
  )
  const searching = deferred.trim() !== '' || filtered
  const description = describeFilters(
    filters,
    { artist: (key) => music.index.artistByKey.get(key)?.name, album: (id) => music.index.albumById.get(id)?.name },
    t.filterLiked,
  )
  const ids = results.tracks.map((track) => track.id)
  const context = {
    kind: 'search' as const,
    id: null,
    label: deferred.trim() ? formatContent(t.searchFor, { query: deferred.trim() }) : description || t.search,
  }
  const show = (name: SearchScope): boolean => scope === 'all' || scope === name

  return (
    <div className="music-page">
      <div className="music-search-field">
        <Search size={20} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.search}
          autoFocus
          enterKeyHint="search"
        />
        {query && (
          <button className="music-icon-button" type="button" onClick={() => setQuery('')} aria-label={t.clearSearch}>
            <X size={18} />
          </button>
        )}
      </div>
      <div className="music-chips" role="tablist" aria-label={t.searchScopes}>
        {SCOPES.map((entry) => (
          <button
            key={entry.id}
            className={`music-chip ${scope === entry.id ? 'is-on' : ''}`}
            type="button"
            role="tab"
            aria-selected={scope === entry.id}
            onClick={() => setScope(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <FilterBar filters={filters} onChange={setFilters} />

      {!searching && (
        <section className="music-browse" aria-label={t.browse}>
          <h2>{t.browse}</h2>
          <div className="music-browse-grid">
            {music.index.languages.map((language, position) => (
              <button
                key={language}
                className="music-browse-tile"
                type="button"
                style={{ '--tile': position } as React.CSSProperties}
                onClick={() => setFilters({ language })}
              >
                {language}
              </button>
            ))}
            {music.index.genres.slice(0, 8).map((genre, position) => (
              <button
                key={genre}
                className="music-browse-tile"
                type="button"
                style={{ '--tile': position + 3 } as React.CSSProperties}
                onClick={() => setFilters({ genre })}
              >
                {genre}
              </button>
            ))}
            <button className="music-browse-tile is-liked" type="button" onClick={() => setFilters({ liked: true })}>
              {t.likedSongs}
            </button>
          </div>
          {music.index.artists.length > 0 && (
            <Shelf title={t.topSingers}>
              {music.index.artists.slice(0, 16).map((artist) => (
                <ArtistCard key={artist.key} artist={artist} />
              ))}
            </Shelf>
          )}
        </section>
      )}

      {searching &&
        results.tracks.length === 0 &&
        results.albums.length === 0 &&
        results.artists.length === 0 &&
        results.playlists.length === 0 && (
          <p className="music-empty-note">{formatContent(t.nothingMatches, { query: query.trim() || description })}</p>
        )}

      {searching && show('artists') && results.artists.length > 0 && (
        <Shelf title={t.scopeSingers}>
          {results.artists.map((artist) => (
            <ArtistCard key={artist.key} artist={artist} />
          ))}
        </Shelf>
      )}
      {searching && show('albums') && results.albums.length > 0 && (
        <Shelf title={t.scopeFilms}>
          {results.albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </Shelf>
      )}
      {searching && show('playlists') && results.playlists.length > 0 && (
        <Shelf title={t.scopePlaylists}>
          {results.playlists.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </Shelf>
      )}
      {searching && show('songs') && results.tracks.length > 0 && (
        <section className="music-section" aria-label={t.scopeSongs}>
          <header className="music-section-head">
            <h2>
              {t.scopeSongs}
              <small>
                {formatContent(results.tracks.length === 1 ? t.oneSong : t.manySongs, { count: results.tracks.length })}
                {description ? ` · ${description}` : ''}
              </small>
            </h2>
            <div className="music-actions">
              <button
                className="music-pill is-primary"
                type="button"
                onClick={() => music.playTracks(ids, { context, shuffle: false })}
              >
                <Play size={16} fill="currentColor" />
                {t.play}
              </button>
              <button className="music-pill" type="button" onClick={() => music.playTracks(ids, { context, shuffle: true })}>
                <Shuffle size={16} />
                {t.shuffle}
              </button>
            </div>
          </header>
          <TrackList tracks={results.tracks} context={context} />
        </section>
      )}
    </div>
  )
}
