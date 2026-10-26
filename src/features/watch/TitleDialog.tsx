import { Check, Play, Plus, X } from '../../components/icons'
import { useEffect, useId, useRef, useState } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { PreviewVideo } from './PreviewVideo'
import { TitleArt } from './TitleArt'
import { thumbUrl } from './watchApi'
import { canResume, episodeLabel, episodesOf, formatClock, metaParts, nextToPlay, progressByFile, seasonsOf } from './watchModel'
import type { PlayTarget, ProgressEntry, WatchFile, WatchTitle } from './watchTypes'

type TitleDialogProps = {
  title: WatchTitle
  progress: readonly ProgressEntry[]
  inList: boolean
  similar: readonly WatchTitle[]
  onClose: () => void
  onPlay: (target: PlayTarget) => void
  onToggleList: (title: WatchTitle) => void
  onOpenTitle: (title: WatchTitle) => void
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function EpisodeRow({
  title,
  file,
  entry,
  onPlay,
}: {
  title: WatchTitle
  file: WatchFile
  entry: ProgressEntry | undefined
  onPlay: (target: PlayTarget) => void
}) {
  const isAlbum = title.kind === 'album'
  const number = isAlbum ? episodesOf(title).findIndex((candidate) => candidate.id === file.id) + 1 : (file.episode ?? 0)
  const name =
    file.title ??
    formatContent(
      isAlbum ? copy.watchView.trackFallback : copy.watchView.episodeFallback,
      isAlbum ? { track: number } : { episode: number },
    )
  const fraction = entry && !entry.completed && entry.duration > 0 ? Math.min(1, entry.position / entry.duration) : 0
  const startAt = entry && !entry.completed && entry.position > 10 ? entry.position : 0
  return (
    <li>
      <button className="watch-episode" type="button" onClick={() => onPlay({ title, file, startAt })}>
        <span className="watch-episode-number">{number || ''}</span>
        {!isAlbum && (
          <span className="watch-episode-thumb">
            {file.thumb !== null ? (
              <img src={thumbUrl(file.id, file.thumb)} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="watch-art-fallback" aria-hidden="true" />
            )}
            <Play size={20} fill="currentColor" />
          </span>
        )}
        <span className="watch-episode-copy">
          <strong>{name}</strong>
          <small>
            {[file.duration ? formatClock(file.duration) : null, entry?.completed ? copy.watchView.watched : null]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </span>
        {fraction > 0 && (
          <span className="watch-card-progress" aria-hidden="true">
            <span style={{ width: `${Math.round(fraction * 100)}%` }} />
          </span>
        )}
      </button>
    </li>
  )
}

/** The title page: summary, how to start it, every episode or track, and what to watch next. */
export function TitleDialog({ title, progress, inList, similar, onClose, onPlay, onToggleList, onOpenTitle }: TitleDialogProps) {
  const headingId = useId()
  const dialog = useRef<HTMLElement>(null)
  const seasons = seasonsOf(title)
  const target = nextToPlay(title, progress)
  const resuming = canResume(title, progress)
  const byFile = progressByFile(progress)
  const [season, setSeason] = useState(() => target.file.season ?? seasons[0] ?? 1)
  const meta = metaParts(title)
  const main = target.file
  const listed = title.kind === 'series' ? episodesOf(title).filter((file) => (file.season ?? 1) === season) : episodesOf(title)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLElement>('.watch-dialog-close')?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      opener?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="watch-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="watch-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <div className="watch-dialog-hero">
          <TitleArt title={title} kind="backdrop" />
          {title.kind !== 'album' && <PreviewVideo titleId={title.id} title={title.title} showStatus={false} />}
          <span className="watch-dialog-shade" aria-hidden="true" />
          <button
            className="watch-dialog-close"
            type="button"
            onClick={onClose}
            aria-label={copy.watchView.close}
            title={copy.watchView.close}
          >
            <X size={20} />
          </button>
          <div className="watch-dialog-hero-copy">
            <h2 id={headingId}>{title.title}</h2>
            <div className="watch-billboard-actions">
              <button className="watch-button is-primary" type="button" onClick={() => onPlay(target)}>
                <Play size={20} fill="currentColor" />
                {resuming ? copy.watchView.resume : copy.watchView.play}
                {resuming && title.kind === 'series' && main.season !== null ? ` ${episodeLabel(main)}` : ''}
              </button>
              <button
                className="watch-round"
                type="button"
                onClick={() => onToggleList(title)}
                aria-pressed={inList}
                aria-label={inList ? copy.watchView.removeFromList : copy.watchView.addToList}
                title={inList ? copy.watchView.removeFromList : copy.watchView.addToList}
              >
                {inList ? <Check size={20} /> : <Plus size={20} />}
              </button>
            </div>
          </div>
        </div>

        <div className="watch-dialog-body">
          <div className="watch-dialog-summary">
            <p className="watch-dialog-meta">
              {meta.map((part) => (
                <span key={part}>{part}</span>
              ))}
              {title.rating && <span className="watch-rating">{title.rating}</span>}
            </p>
            <p className="watch-dialog-overview">{title.overview || copy.watchView.noSummary}</p>
          </div>
          <dl className="watch-dialog-facts">
            {title.languages.length > 0 && (
              <div>
                <dt>{copy.watchView.languagesLabel}</dt>
                <dd>{title.languages.join(', ')}</dd>
              </div>
            )}
            {title.genres.length > 0 && (
              <div>
                <dt>{copy.watchView.genresLabel}</dt>
                <dd>{title.genres.join(', ')}</dd>
              </div>
            )}
            {main.audio.length > 0 && (
              <div>
                <dt>{copy.watchView.audioLabel}</dt>
                <dd>{main.audio.map((track) => track.label).join(' · ')}</dd>
              </div>
            )}
            {main.subtitles.length > 0 && (
              <div>
                <dt>{copy.watchView.subtitlesLabel}</dt>
                <dd>{main.subtitles.map((track) => track.label).join(' · ')}</dd>
              </div>
            )}
            {title.kind === 'movie' && (
              <div>
                <dt>{copy.watchView.qualityLabel}</dt>
                <dd>
                  {[main.quality, main.hdr ? 'HDR' : null, main.duration ? formatClock(main.duration) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {title.kind !== 'movie' && (
          <div className="watch-dialog-section">
            <div className="watch-dialog-section-head">
              <h3>{title.kind === 'album' ? copy.watchView.tracks : copy.watchView.episodes}</h3>
              {title.kind === 'series' && seasons.length > 1 && (
                <select
                  value={season}
                  onChange={(event) => setSeason(Number(event.target.value))}
                  aria-label={copy.watchView.episodes}
                >
                  {seasons.map((value) => (
                    <option key={value} value={value}>
                      {formatContent(copy.watchView.seasonLabel, { season: value })}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <ol className="watch-episodes">
              {listed.map((file) => (
                <EpisodeRow key={file.id} title={title} file={file} entry={byFile.get(file.id)} onPlay={onPlay} />
              ))}
            </ol>
          </div>
        )}

        {similar.length > 0 && (
          <div className="watch-dialog-section">
            <h3>{copy.watchView.moreLikeThis}</h3>
            <ul className="watch-similar">
              {similar.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onOpenTitle(item)}>
                    <TitleArt title={item} kind="card" />
                    <span className="watch-card-shade" aria-hidden="true" />
                    <span className="watch-card-name">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
