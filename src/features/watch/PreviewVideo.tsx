import { useState } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { previewUrl } from './watchApi'

type PreviewVideoProps = {
  titleId: string
  title: string
  /** When false nothing is requested and nothing plays (for example while a film is on screen). */
  active?: boolean
  showStatus?: boolean
}

/**
 * The silent preview clip. It fades in over the title's picture once the first frame is really playing, and quietly gives up
 * (leaving the picture) when the server cannot make a clip for this title.
 */
export function PreviewVideo({ titleId, title, active = true, showStatus = true }: PreviewVideoProps) {
  const [live, setLive] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!active || failed) return null
  return (
    <>
      <video
        className={`watch-preview-video ${live ? 'is-live' : ''}`}
        src={previewUrl(titleId)}
        aria-label={formatContent(copy.watchView.previewVideoLabel, { title })}
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
        disablePictureInPicture
        onPlaying={() => setLive(true)}
        onError={() => setFailed(true)}
      />
      {showStatus && !live && (
        <span className="watch-preview-status" role="status">
          <span className="watch-spinner" />
          {copy.watchView.previewPreparing}
        </span>
      )}
    </>
  )
}
