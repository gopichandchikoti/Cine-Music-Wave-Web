import { House, Library, Search } from '../../components/icons'
import { useEffect, useRef, useState } from 'react'
import { Presence } from '../../components/Presence'
import { content as copy } from '../../content.js'
import { useMusic } from './musicContext'
import { useMusicNav, type MusicRoute } from './musicNav'
import { MiniPlayer } from './PlayerBar'

const t = copy.musicView

type Section = 'home' | 'library' | 'search'

/** Which of the dock's destinations a page belongs to. */
export const sectionOf = (route: MusicRoute): Section =>
  route.page === 'search' ? 'search' : route.page === 'home' || route.page === 'mood' || route.page === 'mix' ? 'home' : 'library'

/**
 * The bottom of a phone-width screen: a round button for Home and Your Library (it opens a small menu that grows out of it), the mini
 * player as a pill, and a round Search button, each on glass over the page. With nothing queued the two buttons sit at the edges.
 */
export function PhoneDock() {
  const music = useMusic()
  const nav = useMusicNav()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const section = sectionOf(nav.route)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector('button')?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && !trigger.current?.contains(event.target))
        setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', outside)
    }
  }, [open])

  const go = (route: MusicRoute): void => {
    setOpen(false)
    nav.go(route)
  }
  return (
    <div className="music-phonedock" role="toolbar" aria-label={t.music}>
      <div className="music-phonedock-section">
        <button
          ref={trigger}
          className="music-phonedock-button glass"
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${section === 'home' ? t.home : t.yourLibrary}. ${t.sections}`}
          onClick={() => setOpen(!open)}
        >
          {section === 'home' ? <House size={25} /> : <Library size={25} />}
        </button>
        <Presence show={open}>
          {open && (
            <div className="music-phonedock-menu glass" role="menu" aria-label={t.sections} ref={menu}>
              <button
                type="button"
                role="menuitem"
                className={section === 'home' ? 'is-on' : ''}
                onClick={() => go({ page: 'home' })}
              >
                <House size={18} fill={section === 'home' ? 'currentColor' : 'none'} />
                {t.home}
              </button>
              <button
                type="button"
                role="menuitem"
                className={section === 'library' ? 'is-on' : ''}
                onClick={() => go({ page: 'library' })}
              >
                <Library size={18} />
                {t.yourLibrary}
              </button>
            </div>
          )}
        </Presence>
      </div>
      {music.track ? <MiniPlayer /> : <span className="music-phonedock-gap" />}
      <button
        className="music-phonedock-button glass"
        type="button"
        aria-label={t.search}
        aria-current={section === 'search' ? 'page' : undefined}
        onClick={() => go({ page: 'search' })}
      >
        <Search size={25} />
      </button>
    </div>
  )
}
