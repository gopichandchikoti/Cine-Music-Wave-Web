import { Heart, X } from '../../components/icons'
import { useMemo } from 'react'
import { content as copy } from '../../content.js'
import { useMusic } from './musicContext'
import { facetCounts, type SearchFilters } from './musicModel'

const t = copy.musicView

/** Narrow songs by singer, film, language, genre, year, or by what you have liked. Each list shows how many songs it would leave. */
export function FilterBar({ filters, onChange }: { filters: SearchFilters; onChange: (filters: SearchFilters) => void }) {
  const music = useMusic()
  const counts = useMemo(() => facetCounts(music.index, filters, music.likes), [music.index, filters, music.likes])
  const active = Object.values(filters).some((value) => value !== undefined && value !== false && value !== '')
  const set = (patch: Partial<SearchFilters>): void => onChange({ ...filters, ...patch })
  const select = (label: string, value: string, options: { value: string; label: string }[], apply: (value: string) => void) => (
    <label className={`music-filter ${value ? 'is-on' : ''}`}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => apply(event.target.value)} aria-label={label}>
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <div className="music-filters" role="group" aria-label={t.filters}>
      {select(
        t.filterSinger,
        filters.artist ?? '',
        music.index.artists
          .map((artist) => ({ value: artist.key, label: `${artist.name} (${artist.trackIds.length})` }))
          .sort((left, right) => left.label.localeCompare(right.label)),
        (value) => set({ artist: value || undefined }),
      )}
      {select(
        t.filterFilm,
        filters.albumId ?? '',
        music.index.albums.map((album) => ({ value: album.id, label: `${album.name}${album.year ? ` (${album.year})` : ''}` })),
        (value) => set({ albumId: value || undefined }),
      )}
      {counts.languages.length > 0 &&
        select(
          t.filterLanguage,
          filters.language ?? '',
          counts.languages.map(([name, count]) => ({ value: name, label: `${name} (${count})` })),
          (value) => set({ language: value || undefined }),
        )}
      {counts.genres.length > 0 &&
        select(
          t.filterGenre,
          filters.genre ?? '',
          counts.genres.map(([name, count]) => ({ value: name, label: `${name} (${count})` })),
          (value) => set({ genre: value || undefined }),
        )}
      {counts.years.length > 0 &&
        select(
          t.filterYear,
          filters.year === undefined ? '' : String(filters.year),
          counts.years.map(([year, count]) => ({ value: String(year), label: `${year} (${count})` })),
          (value) => set({ year: value ? Number(value) : undefined }),
        )}
      <button
        className={`music-chip ${filters.liked ? 'is-on' : ''}`}
        type="button"
        aria-pressed={filters.liked === true}
        onClick={() => set({ liked: filters.liked ? undefined : true })}
      >
        <Heart size={14} fill={filters.liked ? 'currentColor' : 'none'} />
        {t.filterLiked}
      </button>
      {active && (
        <button className="music-chip is-clear" type="button" onClick={() => onChange({})}>
          <X size={14} />
          {t.clearFilters}
        </button>
      )}
    </div>
  )
}
