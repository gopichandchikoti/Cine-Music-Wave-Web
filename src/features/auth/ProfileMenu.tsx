import { content as copy } from '../../content.js'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from '../../components/icons'
import { Presence } from '../../components/Presence'
import type { PublicUser } from './authTypes'
import { ProfileView } from './ProfileView'
import { SettingsView } from './SettingsView'
import { accountUrl } from '../../api'
export function ProfileMenu({
  user,
  onUser,
  onLogout,
  theme,
  readingScale,
  onPreferences,
}: {
  user: PublicUser
  onUser: (user: PublicUser) => void
  onLogout: () => void
  theme: 'light' | 'dark'
  readingScale: 'standard' | 'large'
  onPreferences: (theme: 'light' | 'dark', scale: 'standard' | 'large') => void
}) {
  const [open, setOpen] = useState(false),
    [panel, setPanel] = useState<'profile' | 'settings' | null>(null),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    menu.current?.querySelector('button')?.focus()
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && open) {
      event.preventDefault()
      const items = Array.from(menu.current?.querySelectorAll('button') ?? []),
        index = items.indexOf(document.activeElement as HTMLButtonElement)
      items[
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      ]?.focus()
    }
  }
  const [hour] = useState(() => new Date().getHours()),
    greeting =
      hour < 12 ? copy.profileMenu.goodMorning : hour < 18 ? copy.profileMenu.goodAfternoon : copy.profileMenu.goodEvening
  return (
    <div
      className="profile-control"
      ref={root}
      onKeyDown={key}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !panel) setOpen(false)
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="profile-avatar">
          {user.avatarUrl ? (
            <img src={accountUrl(user.avatarUrl)} alt="" />
          ) : (
            user.firstName.slice(0, 1) + user.lastName.slice(0, 1)
          )}
        </span>
        <span className="profile-greeting">
          {greeting}
          {copy.profileMenu.text}
          {user.firstName}
        </span>
        <ChevronDown size={14} />
      </button>
      <Presence show={open}>
        {open && (
          <div className="profile-popup" role="menu" aria-label={copy.profileMenu.yourAccount} ref={menu}>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                close()
                setPanel('profile')
              }}
            >
              {copy.profileMenu.myProfile}
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                close()
                setPanel('settings')
              }}
            >
              {copy.profileMenu.settings}
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                close()
                onPreferences(theme === 'light' ? 'dark' : 'light', readingScale)
              }}
            >
              {theme === 'light' ? copy.profileMenu.switchToDark : copy.profileMenu.switchToLight}
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                close()
                onLogout()
              }}
            >
              {copy.profileMenu.signOut}
            </button>
          </div>
        )}
      </Presence>
      <Presence show={panel === 'profile'}>
        {panel === 'profile' && (
          <ProfileView
            user={user}
            onUser={onUser}
            onSignedOut={onLogout}
            onClose={() => {
              setPanel(null)
              trigger.current?.focus()
            }}
          />
        )}
      </Presence>
      <Presence show={panel === 'settings'}>
        {panel === 'settings' && (
          <SettingsView
            user={user}
            onUser={onUser}
            onSignedOut={onLogout}
            onClose={() => {
              setPanel(null)
              trigger.current?.focus()
            }}
            theme={theme}
            readingScale={readingScale}
            onPreferences={onPreferences}
          />
        )}
      </Presence>
    </div>
  )
}
