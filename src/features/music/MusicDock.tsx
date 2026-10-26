import { Music2, Pause, Play, SkipForward } from '../../components/icons'
import { content as copy } from '../../content.js'
import { Cover } from './Cover'
import { useMusic } from './musicContext'
import { artistLine } from './musicModel'

const t = copy.musicView

/**
 * A small glass pill shown on the other screens (Study, Watch, Markdown) while music is queued, so music you started keeps playing and
 * can be paused or skipped without going back. Pressing it opens the Music screen.
 */
export function MusicDock({ onOpen }: { onOpen: () => void }) {
  const music = useMusic()
  const track = music.track
  if (!track) return null
  return (
    <div className="music-dock glass" role="region" aria-label={t.nowPlaying}>
      <button className="music-dock-main" type="button" onClick={onOpen} aria-label={t.openMusic}>
        <Cover albumId={track.albumId} cover={track.cover} label={track.album} className="music-dock-cover" />
        <span>
          <strong>{track.title}</strong>
          <small>{artistLine(track) || track.album}</small>
        </span>
      </button>
      <button className="music-icon-button" type="button" onClick={music.toggle} aria-label={music.playing ? t.pause : t.play}>
        {music.playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
      </button>
      <button className="music-icon-button" type="button" onClick={music.next} aria-label={t.next}>
        <SkipForward size={20} fill="currentColor" />
      </button>
      <Music2 className="music-dock-note" size={14} aria-hidden="true" />
    </div>
  )
}
