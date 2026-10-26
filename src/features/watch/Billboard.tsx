import { Check, Info, Play, Plus } from '../../components/icons'
import { useEffect, useRef, useState } from 'react'
import { content as copy } from '../../content.js'
import { PreviewVideo } from './PreviewVideo'
import { TitleArt } from './TitleArt'
import { canResume, episodeLabel, metaParts, nextToPlay } from './watchModel'
import type { ProgressEntry, WatchTitle } from './watchTypes'

type BillboardProps = {
  title: WatchTitle
  progress: readonly ProgressEntry[]
  inList: boolean
  /** True while a dialog or the player covers the page, so the preview is not decoded behind it. */
  covered: boolean
  onPlay: (title: WatchTitle) => void
  onInfo: (title: WatchTitle) => void
  onToggleList: (title: WatchTitle) => void
}

const PREVIEW_DELAY_MS = 1400

/** The large featured title at the top of Home. Its picture turns into the preview clip after a moment, like a trailer. */
export function Billboard({ title, progress, inList, covered, onPlay, onInfo, onToggleList }: BillboardProps) {
  const element = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(true)
  const [readyFor, setReadyFor] = useState<string | null>(null)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const id = title.id
    const timer = window.setTimeout(() => setReadyFor(id), PREVIEW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [title.id])

  useEffect(() => {
    const node = element.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const resuming = canResume(title, progress)
  const target = nextToPlay(title, progress)
  const meta = metaParts(title)

  return (
    <section className="watch-billboard" ref={element} aria-label={title.title}>
      <div className="watch-billboard-media">
        <TitleArt title={title} kind="backdrop" />
        {title.kind !== 'album' && readyFor === title.id && visible && !covered && !reduceMotion && (
          <PreviewVideo titleId={title.id} title={title.title} showStatus={false} />
        )}
      </div>
      <div className="watch-billboard-shade" aria-hidden="true" />
      <div className="watch-billboard-copy">
        <h1>{title.title}</h1>
        <p className="watch-billboard-meta">
          {meta.map((part) => (
            <span key={part}>{part}</span>
          ))}
          {title.languages.slice(0, 3).map((language) => (
            <span key={language}>{language}</span>
          ))}
        </p>
        {title.overview && <p className="watch-billboard-overview">{title.overview}</p>}
        <div className="watch-billboard-actions">
          <button className="watch-button is-primary" type="button" onClick={() => onPlay(title)}>
            <Play size={20} fill="currentColor" />
            {resuming ? copy.watchView.resume : copy.watchView.play}
            {resuming && title.kind === 'series' && target.file.season !== null ? ` ${episodeLabel(target.file)}` : ''}
          </button>
          <button className="watch-button" type="button" onClick={() => onInfo(title)}>
            <Info size={20} />
            {copy.watchView.moreInfo}
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
    </section>
  )
}
