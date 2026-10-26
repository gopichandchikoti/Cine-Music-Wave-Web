import { ChevronLeft, Ellipsis } from '../../components/icons'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { content as copy } from '../../content.js'
import { Cover } from './Cover'
import { coverUrl } from './musicApi'
import { useMusicNav, type MenuSource } from './musicNav'
import { useDominantColor } from './useDominantColor'

const t = copy.musicView

type IconComponent = ComponentType<{ size?: number; fill?: string; strokeWidth?: number }>

/**
 * What a hero page needs from its picture: the colour the page takes (CSS reads `--tint`; with no picture the page keeps its plain
 * colour) and, for the style attribute, nothing else. The page tint itself is worked out in CSS from the theme's strength.
 */
export function useHeroStyle(albumId: string, hasCover: boolean, extra = 0): CSSProperties {
  const color = useDominantColor(hasCover ? coverUrl(albumId) : null)
  const custom: Record<string, string> = { '--hero-extra': `${extra}px` }
  if (color) custom['--tint'] = `${color.r}, ${color.g}, ${color.b}`
  else custom['--tint-strength'] = '0%'
  return custom as CSSProperties
}

/**
 * A full-bleed page head: the picture edge to edge, darkened at the top for the buttons and faded into the page at the foot, with the
 * name and the round buttons over the fade. The rest of the page goes in `children` and sits on the tinted page.
 */
export function HeroPage({
  albumId,
  cover,
  label,
  style,
  head,
  children,
}: {
  albumId: string
  cover: boolean
  label: string
  style: CSSProperties
  head: ReactNode
  children: ReactNode
}) {
  return (
    <div className="music-hero-page" style={style}>
      <header className="music-hero">
        <div className="music-hero-art" aria-hidden="true">
          {cover ? (
            <img src={coverUrl(albumId)} alt="" decoding="async" draggable={false} />
          ) : (
            <Cover albumId="" cover={false} label={label} />
          )}
        </div>
        <div className="music-hero-fade" aria-hidden="true" />
        <div className="music-hero-copy">{head}</div>
      </header>
      <div className="music-hero-body">{children}</div>
    </div>
  )
}

/** A round glass button on the page: favourite, play, shuffle. The glass takes the theme (it sits on the tinted page, not the picture). */
export function ActionCircle({
  icon: Icon,
  label,
  onClick,
  on = false,
  filled = false,
  disabled = false,
  small = false,
}: {
  icon: IconComponent
  label: string
  onClick: () => void
  on?: boolean
  filled?: boolean
  disabled?: boolean
  small?: boolean
}) {
  return (
    <button
      className={`music-action-circle glass ${on ? 'is-on' : ''} ${small ? 'is-small' : ''}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={on || undefined}
    >
      <Icon size={small ? 22 : 26} fill={on || filled ? 'currentColor' : 'none'} />
    </button>
  )
}

/** Back and "…", pinned over a hero page so they stay put while it scrolls. They are dark glass with white icons in both themes. */
export function ImmersiveBar({ trackIds, source }: { trackIds: readonly string[]; source?: MenuSource }) {
  const nav = useMusicNav()
  return (
    <div className="music-hero-bar">
      {nav.canGoBack ? (
        <button className="music-hero-button" type="button" onClick={nav.back} aria-label={t.back} title={t.back}>
          <ChevronLeft size={24} strokeWidth={2.4} />
        </button>
      ) : (
        <span />
      )}
      <button
        className="music-hero-button"
        type="button"
        disabled={trackIds.length === 0}
        onClick={(event) => nav.openMenu(trackIds, event.currentTarget, source)}
        aria-haspopup="menu"
        aria-label={t.more}
        title={t.more}
      >
        <Ellipsis size={24} strokeWidth={2.4} />
      </button>
    </div>
  )
}
