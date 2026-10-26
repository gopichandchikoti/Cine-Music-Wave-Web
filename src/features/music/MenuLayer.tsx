import { Check, Disc3, Heart, ListEnd, ListPlus, ListStart, Plus, Radio, Trash2, UserRound, X } from '../../components/icons'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { Cover, Mosaic } from './Cover'
import { useMusic } from './musicContext'
import { artistLine, keyOf } from './musicModel'
import type { MenuSource } from './musicNav'
import { useMusicNav } from './musicNav'
import type { PlaylistSummary } from './musicTypes'

const t = copy.musicView

export type MenuState = { trackIds: readonly string[]; anchor: DOMRect; source: MenuSource | undefined }

const MARGIN = 10

/** The "…" menu for one or more songs. On a phone it rises from the bottom like an app sheet. */
export function TrackMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const music = useMusic()
  const nav = useMusicNav()
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const tracks = menu.trackIds.flatMap((id) => music.index.byId.get(id) ?? [])
  const single = tracks.length === 1 ? tracks[0] : null

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  useEffect(() => {
    if (nav.compact || !panel.current) return
    const box = panel.current.getBoundingClientRect()
    const left = Math.min(Math.max(MARGIN, menu.anchor.right - box.width), window.innerWidth - box.width - MARGIN)
    const below = menu.anchor.bottom + 6
    const top = below + box.height > window.innerHeight - MARGIN ? Math.max(MARGIN, menu.anchor.top - box.height - 6) : below
    setPosition({ left, top: Math.max(MARGIN, Math.min(top, window.innerHeight - box.height - MARGIN)) })
  }, [menu.anchor, nav.compact, tracks.length])

  if (tracks.length === 0) return null
  const ids = tracks.map((track) => track.id)
  const act = (action: () => void) => (): void => {
    onClose()
    action()
  }
  const albumId = single?.albumId ?? (new Set(tracks.map((track) => track.albumId)).size === 1 ? tracks[0].albumId : null)
  const artists = single?.artists ?? []
  const liked = single ? music.likes.has(single.id) : false

  return (
    <div
      className="music-scrim is-light"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`music-menu glass ${nav.compact ? 'is-sheet' : ''}`}
        ref={panel}
        role="menu"
        aria-label={t.more}
        style={nav.compact || !position ? undefined : { left: position.left, top: position.top }}
      >
        {single && (
          <div className="music-menu-head">
            <Cover albumId={single.albumId} cover={single.cover} label={single.album} className="music-menu-cover" />
            <span>
              <strong>{single.title}</strong>
              <small>{artistLine(single) || single.album}</small>
            </span>
          </div>
        )}
        <button type="button" role="menuitem" onClick={act(() => music.playNext(ids))}>
          <ListStart size={18} />
          {t.playNext}
        </button>
        <button type="button" role="menuitem" onClick={act(() => music.addToQueue(ids))}>
          <ListEnd size={18} />
          {t.addToQueue}
        </button>
        <button type="button" role="menuitem" onClick={act(() => nav.pickPlaylist(ids))}>
          <ListPlus size={18} />
          {t.addToPlaylist}
        </button>
        {menu.source?.radio && (
          <button
            type="button"
            role="menuitem"
            onClick={act(() => music.startRadio(menu.source!.radio!.seed, menu.source!.radio!.label))}
          >
            <Radio size={18} />
            {t.startRadio}
          </button>
        )}
        {single && (
          <button type="button" role="menuitem" onClick={act(() => music.toggleLike(single.id))}>
            <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
            {liked ? t.unlike : t.like}
          </button>
        )}
        {single && (
          <button type="button" role="menuitem" onClick={act(() => music.startRadio({ kind: 'track', value: single.id }))}>
            <Radio size={18} />
            {t.startRadio}
          </button>
        )}
        {albumId && (
          <button type="button" role="menuitem" onClick={act(() => nav.go({ page: 'album', id: albumId }))}>
            <Disc3 size={18} />
            {t.goToAlbum}
          </button>
        )}
        {artists.map((name) => (
          <button type="button" role="menuitem" key={name} onClick={act(() => nav.go({ page: 'artist', key: keyOf(name) }))}>
            <UserRound size={18} />
            {formatContent(t.goToArtist, { name })}
          </button>
        ))}
        {menu.source?.playlistId && menu.source.playlistPosition !== undefined && single && (
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={act(() => {
              const playlist = music.user.playlists.find((entry) => entry.id === menu.source?.playlistId)
              if (playlist)
                void music.setPlaylistTracks(
                  playlist.id,
                  playlist.trackIds.filter((_id, position) => position !== menu.source?.playlistPosition),
                )
            })}
          >
            <Trash2 size={18} />
            {t.removeFromPlaylist}
          </button>
        )}
        {menu.source?.queuePosition !== undefined && (
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={act(() => music.removeFromQueue(menu.source!.queuePosition!))}
          >
            <X size={18} />
            {t.removeFromQueue}
          </button>
        )}
        {nav.compact && (
          <button type="button" role="menuitem" className="music-menu-cancel" onClick={onClose}>
            {t.close}
          </button>
        )}
      </div>
    </div>
  )
}

function PlaylistOption({ playlist, onPick }: { playlist: PlaylistSummary; onPick: () => void }) {
  const music = useMusic()
  const covers = [
    ...new Set(playlist.trackIds.map((id) => music.index.byId.get(id)?.albumId).filter((id): id is string => Boolean(id))),
  ]
    .slice(0, 4)
    .map((albumId) => {
      const track = music.index.tracks.find((entry) => entry.albumId === albumId)!
      return { albumId, cover: track.cover, label: track.album }
    })
  return (
    <button className="music-picker-row" type="button" onClick={onPick}>
      <Mosaic covers={covers} label={playlist.name} className="music-picker-cover" />
      <span>
        <strong>{playlist.name}</strong>
        <small>{formatContent(playlist.trackCount === 1 ? t.oneSong : t.manySongs, { count: playlist.trackCount })}</small>
      </span>
    </button>
  )
}

/** Choose a playlist for some songs, or make a new one. */
export function PlaylistPicker({ trackIds, onClose }: { trackIds: readonly string[]; onClose: () => void }) {
  const music = useMusic()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    field.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    const created = await music.createPlaylist(name.trim(), trackIds)
    setBusy(false)
    if (created) {
      music.toast(formatContent(t.addedToNamedPlaylist, { name: created.name }))
      onClose()
    }
  }

  return (
    <div
      className="music-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="music-dialog glass" role="dialog" aria-modal="true" aria-label={t.addToPlaylist}>
        <header>
          <h2>{t.addToPlaylist}</h2>
          <button className="music-icon-button" type="button" onClick={onClose} aria-label={t.close}>
            <X size={20} />
          </button>
        </header>
        <form
          className="music-new-playlist"
          onSubmit={(event) => {
            void create(event)
          }}
        >
          <input
            ref={field}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.newPlaylistName}
            maxLength={80}
            aria-label={t.newPlaylistName}
          />
          <button className="music-pill is-primary" type="submit" disabled={!name.trim() || busy}>
            <Plus size={16} />
            {t.createPlaylist}
          </button>
        </form>
        {!music.canSave && <p className="music-note">{t.signInToSave}</p>}
        <div className="music-picker-list">
          {music.user.playlists.length === 0 && <p className="music-note">{t.noPlaylistsYet}</p>}
          {music.user.playlists.map((playlist) => (
            <PlaylistOption
              key={playlist.id}
              playlist={playlist}
              onPick={() => {
                void music.addToPlaylist(playlist.id, trackIds)
                onClose()
              }}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

/** A small "name your playlist" dialog, used from the library page and the sidebar. */
export function CreatePlaylistDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (playlist: PlaylistSummary) => void
}) {
  const music = useMusic()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    field.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    const created = await music.createPlaylist(name.trim())
    setBusy(false)
    if (created) {
      onCreated(created)
      onClose()
    }
  }
  return (
    <div
      className="music-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="music-dialog glass"
        role="dialog"
        aria-modal="true"
        aria-label={t.createPlaylist}
        onSubmit={(event) => {
          void submit(event)
        }}
      >
        <header>
          <h2>{t.createPlaylist}</h2>
          <button className="music-icon-button" type="button" onClick={onClose} aria-label={t.close}>
            <X size={20} />
          </button>
        </header>
        <input
          ref={field}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.newPlaylistName}
          maxLength={80}
          aria-label={t.newPlaylistName}
        />
        {!music.canSave && <p className="music-note">{t.signInToSave}</p>}
        <div className="music-dialog-actions">
          <button className="music-pill" type="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button className="music-pill is-primary" type="submit" disabled={!name.trim() || busy}>
            <Check size={16} />
            {t.create}
          </button>
        </div>
      </form>
    </div>
  )
}
