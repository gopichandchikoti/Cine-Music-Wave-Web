import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MusicEngine } from './engine'
import { MusicContext, PlaybackClock, type MusicContextValue, type Sheet, type SleepTimer } from './musicContext'
import {
  addPlaylistTracks,
  coverUrl,
  createPlaylist as apiCreatePlaylist,
  deletePlaylist as apiDeletePlaylist,
  deleteRadio as apiDeleteRadio,
  fetchMusicLibrary,
  likeTrack,
  renamePlaylist as apiRenamePlaylist,
  reportPlay,
  saveRadio as apiSaveRadio,
  setPlaylistTracks as apiSetPlaylistTracks,
  unlikeTrack,
} from './musicApi'
import { buildIndex, radioLabel, radioTracks, seededRandom, type RadioSeed } from './musicModel'
import type { MusicState, MusicTrack, PlayContext, PlaylistSummary, SavedRadio } from './musicTypes'
import {
  append,
  clearUpcoming as clearQueueUpcoming,
  currentItem,
  emptyQueue,
  insertNext,
  jump,
  makeQueue,
  move,
  nextIndex,
  previousIndex,
  removeAt,
  restoreOrder,
  shuffleUpcoming,
  type Queue,
  type RepeatMode,
} from './queue'

const emptyUser: MusicState = { likes: [], plays: [], recent: [], playlists: [], radios: [], community: [] }
const emptyIndex = buildIndex([])
const SESSION_KEY = 'cine-music-wave:music-session'
const POLL_MS = 4000
const REPORT_AFTER_SECONDS = 30
const MAX_FAILURES_IN_A_ROW = 3

type Session = {
  ids: string[]
  index: number
  position: number
  context: PlayContext | null
  volume: number
  repeat: RepeatMode
  shuffle: boolean
  autoplay: boolean
  crossfade: number
}

const readSession = (): Partial<Session> => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null')
    return parsed && typeof parsed === 'object' ? (parsed as Partial<Session>) : {}
  } catch {
    return {}
  }
}
const writeSession = (session: Session): void => {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    /* the place is simply not remembered */
  }
}

const errorText = (reason: unknown, fallback: string): string =>
  reason instanceof Error && reason.message ? reason.message : fallback

/**
 * Owns the audio engine and everything about listening: the library, the queue, likes and playlists, radio and autoplay, the sleep
 * timer, the lock-screen controls and the remembered place. It sits above the Study / Watch / Music screens, so music keeps playing
 * when you move between them. The app tells it who is signed in (setAccount); a different account starts with a clean slate.
 */
export function MusicProvider({ children }: { children: ReactNode }) {
  const [saved] = useState(readSession)
  const [status, setStatus] = useState<MusicContextValue['status']>('idle')
  const [error, setError] = useState<string | null>(null)
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [films, setFilms] = useState<MusicContextValue['films']>([])
  const [pending, setPending] = useState(0)
  const [user, setUser] = useState<MusicState>(emptyUser)
  const [canSave, setCanSave] = useState(true)

  const [queue, setQueueState] = useState<Queue>(emptyQueue)
  const [context, setContext] = useState<PlayContext | null>(saved.context ?? null)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [volume, setVolumeState] = useState(typeof saved.volume === 'number' ? saved.volume : 0.9)
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffleState] = useState(saved.shuffle === true)
  const [repeat, setRepeatState] = useState<RepeatMode>(saved.repeat === 'all' || saved.repeat === 'one' ? saved.repeat : 'off')
  const [autoplay, setAutoplayState] = useState(saved.autoplay !== false)
  const [crossfade, setCrossfadeState] = useState(typeof saved.crossfade === 'number' ? saved.crossfade : 0)
  const [rate, setRateState] = useState(1)
  const [sleep, setSleepState] = useState<SleepTimer>({ endsAt: null, endOfTrack: false })
  const [expanded, setExpanded] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toastText, setToastText] = useState<string | null>(null)
  const [clock] = useState(() => new PlaybackClock())
  const [account, setAccountState] = useState<string | null>(null)

  const index = useMemo(() => (tracks.length === 0 ? emptyIndex : buildIndex(tracks)), [tracks])
  const likes = useMemo(() => new Set(user.likes), [user.likes])

  // Refs hold the latest values for the audio engine's callbacks, which are created once. The queue ref is written only by
  // commitQueue; every other ref simply follows its state.
  const queueRef = useRef<Queue>(emptyQueue)
  const indexRef = useRef(emptyIndex)
  const repeatRef = useRef(repeat)
  const shuffleRef = useRef(shuffle)
  const autoplayRef = useRef(autoplay)
  const sleepRef = useRef(sleep)
  const likesRef = useRef<ReadonlySet<string>>(new Set())
  const userRef = useRef(emptyUser)
  const canSaveRef = useRef(true)
  const radioRef = useRef<RadioSeed | null>(null)
  const engineRef = useRef<MusicEngine | null>(null)
  const failures = useRef(0)
  const listened = useRef({ trackId: '', seconds: 0, last: 0, reported: false })
  const restored = useRef(false)
  const started = useRef(false)
  const toastTimer = useRef<number | null>(null)
  const advanceRef = useRef<(manual: boolean) => void>(() => undefined)
  const accountRef = useRef<string | null>(null)

  useEffect(() => {
    indexRef.current = index
    repeatRef.current = repeat
    shuffleRef.current = shuffle
    autoplayRef.current = autoplay
    sleepRef.current = sleep
    likesRef.current = likes
    userRef.current = user
    canSaveRef.current = canSave
  })

  const toast = useCallback((message: string): void => {
    setToastText(message)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastText(null), 3200)
  }, [])

  const commitQueue = useCallback((next: Queue): void => {
    queueRef.current = next
    setQueueState(next)
  }, [])

  // --- loading the song that is current ---------------------------------------------------------------------------------------------------

  const loadCurrent = useCallback(
    async (autoplayNow = true, startAt = 0): Promise<void> => {
      const engine = engineRef.current
      const item = currentItem(queueRef.current)
      if (!engine || !item) return
      listened.current = { trackId: item.trackId, seconds: 0, last: startAt, reported: false }
      try {
        await engine.load(item.trackId, startAt, autoplayNow)
        failures.current = 0
      } catch {
        failures.current += 1
        if (failures.current >= MAX_FAILURES_IN_A_ROW) {
          toast('Those songs could not be played right now.')
          failures.current = 0
          return
        }
        toast('That song could not be played. Skipping it.')
        window.setTimeout(() => {
          if (currentItem(queueRef.current)?.trackId === item.trackId) advanceRef.current(true)
        }, 700)
      }
    },
    [toast],
  )

  // --- the library -------------------------------------------------------------------------------------------------------------------

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetchMusicLibrary()
      setTracks(response.tracks)
      setFilms(response.films)
      setPending(response.pending)
      setUser(response.state)
      setCanSave(true)
      setError(null)
      setStatus('ready')
      // The first time the library arrives, put the previous session back (paused, at the place it was left).
      if (!restored.current) {
        restored.current = true
        const known = new Set(response.tracks.map((track) => track.id))
        const ids = (saved.ids ?? []).filter((id) => known.has(id)).slice(0, 500)
        if (ids.length > 0) {
          commitQueue(makeQueue(ids, typeof saved.index === 'number' ? Math.min(Math.max(saved.index, 0), ids.length - 1) : 0))
          void loadCurrent(false, typeof saved.position === 'number' ? saved.position : 0)
        }
      }
    } catch (reason) {
      setError(errorText(reason, 'Music could not be loaded.'))
      setStatus((current) => (current === 'ready' ? current : 'error'))
    }
  }, [saved, commitQueue, loadCurrent])

  const ensureLibrary = useCallback((): void => {
    if (started.current) return
    started.current = true
    setStatus('loading')
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (account !== null && saved.ids?.length) ensureLibrary()
  }, [account, saved.ids, ensureLibrary])

  // Songs being read for the first time appear as their tags are read.
  useEffect(() => {
    if (pending <= 0) return
    const timer = window.setTimeout(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [pending, tracks.length, refresh])

  // --- reporting what was listened to ---------------------------------------------------------------------------------------------------

  const noteListening = useCallback((position: number, duration: number): void => {
    const current = currentItem(queueRef.current)
    if (!current) return
    const entry = listened.current
    if (entry.trackId !== current.trackId) {
      listened.current = { trackId: current.trackId, seconds: 0, last: position, reported: false }
      return
    }
    const delta = position - entry.last
    entry.last = position
    if (delta > 0 && delta < 2.5) entry.seconds += delta
    const threshold = Math.min(REPORT_AFTER_SECONDS, duration > 0 ? duration * 0.5 : REPORT_AFTER_SECONDS)
    if (entry.reported || entry.seconds < threshold) return
    entry.reported = true
    const stamp = new Date().toISOString()
    setUser((state) => {
      const found = state.plays.find((play) => play.trackId === current.trackId)
      const plays = found
        ? state.plays.map((play) => (play.trackId === current.trackId ? { ...play, count: play.count + 1, lastAt: stamp } : play))
        : [{ trackId: current.trackId, count: 1, lastAt: stamp }, ...state.plays]
      return {
        ...state,
        plays,
        recent: [
          { trackId: current.trackId, at: stamp },
          ...state.recent.filter((recent) => recent.trackId !== current.trackId),
        ].slice(0, 60),
      }
    })
    if (canSaveRef.current) void reportPlay(current.trackId, entry.seconds, false).catch(() => undefined)
  }, [])

  // --- moving through the queue ------------------------------------------------------------------------------------------------------------

  /** More songs for a radio, or for autoplay once the queue has run out. Returns how many were added. */
  const extendQueue = useCallback(
    (count: number): number => {
      const queueNow = queueRef.current
      const seed: RadioSeed | null =
        radioRef.current ??
        (autoplayRef.current && currentItem(queueNow) ? { kind: 'track', value: currentItem(queueNow)!.trackId } : null)
      if (!seed) return 0
      const exclude = new Set(queueNow.items.map((item) => item.trackId))
      const more = radioTracks(indexRef.current, seed, {
        exclude,
        count,
        random: seededRandom(`${Date.now()}:${exclude.size}`),
        likes: likesRef.current,
      })
      if (more.length === 0) return 0
      commitQueue(
        append(
          queueNow,
          more.map((track) => track.id),
        ),
      )
      return more.length
    },
    [commitQueue],
  )

  const goTo = useCallback(
    (position: number): void => {
      commitQueue(jump(queueRef.current, position))
      void loadCurrent()
    },
    [commitQueue, loadCurrent],
  )

  /** Moves on to the next song. `manual` is true when someone pressed Next (so repeat-one does not replay the same song). */
  const advance = useCallback(
    (manual: boolean): void => {
      const engine = engineRef.current
      let target = nextIndex(queueRef.current, repeatRef.current, manual)
      if (target === null && extendQueue(12) > 0) target = queueRef.current.index + 1
      if (target === null) {
        engine?.pause()
        return
      }
      if (target === queueRef.current.index) {
        engine?.seek(0)
        void engine?.play()
        return
      }
      goTo(target)
      // A radio never runs dry: it adds more a few songs before the end.
      if (radioRef.current && queueRef.current.items.length - queueRef.current.index <= 4) extendQueue(10)
    },
    [extendQueue, goTo],
  )

  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  const onEnded = useCallback((): void => {
    if (sleepRef.current.endOfTrack) {
      setSleepState({ endsAt: null, endOfTrack: false })
      const target = nextIndex(queueRef.current, repeatRef.current, true)
      toast('Sleep timer: music stopped at the end of the song')
      if (target !== null && target !== queueRef.current.index) {
        commitQueue(jump(queueRef.current, target))
        void loadCurrent(false)
      } else engineRef.current?.pause()
      return
    }
    advance(false)
  }, [advance, commitQueue, loadCurrent, toast])

  const onAdvanced = useCallback(
    (trackId: string): void => {
      const queueNow = queueRef.current
      const target = nextIndex(queueNow, repeatRef.current, false)
      if (target !== null && queueNow.items[target]?.trackId === trackId) {
        commitQueue(jump(queueNow, target))
        listened.current = { trackId, seconds: 0, last: 0, reported: false }
        if (radioRef.current && queueRef.current.items.length - queueRef.current.index <= 4) extendQueue(10)
      } else {
        void loadCurrent()
      }
    },
    [commitQueue, extendQueue, loadCurrent],
  )

  // --- the audio engine --------------------------------------------------------------------------------------------------------------------

  const live = useRef({ onEnded, onAdvanced, noteListening, toast })
  useEffect(() => {
    live.current = { onEnded, onAdvanced, noteListening, toast }
  })

  useEffect(() => {
    const engine = new MusicEngine(
      {
        time: (position, duration) => {
          clock.set(position, duration)
          live.current.noteListening(position, duration)
        },
        playing: setPlaying,
        buffering: setBuffering,
        ended: () => live.current.onEnded(),
        advanced: (trackId) => live.current.onAdvanced(trackId),
        error: () => {
          live.current.toast('That song could not be played.')
          live.current.onEnded()
        },
      },
      () => {
        const queueNow = queueRef.current
        if (repeatRef.current === 'one') return null
        const target = nextIndex(queueNow, repeatRef.current, false)
        return target === null || target === queueNow.index ? null : (queueNow.items[target]?.trackId ?? null)
      },
    )
    engineRef.current = engine
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [clock])

  useEffect(() => {
    engineRef.current?.setVolume(volume)
  }, [volume])
  useEffect(() => {
    engineRef.current?.setMuted(muted)
  }, [muted])
  useEffect(() => {
    engineRef.current?.setCrossfade(crossfade)
  }, [crossfade])
  useEffect(() => {
    engineRef.current?.setRate(rate)
  }, [rate])

  // --- transport --------------------------------------------------------------------------------------------------------------------------

  const startQueue = useCallback(
    (
      trackIds: readonly string[],
      options: { start?: number; context?: PlayContext; shuffle?: boolean } = {},
      radio: RadioSeed | null = null,
    ): void => {
      const valid = trackIds.filter((id) => indexRef.current.byId.has(id))
      if (valid.length === 0) return
      const wantShuffle = options.shuffle ?? shuffleRef.current
      if (options.shuffle !== undefined) setShuffleState(options.shuffle)
      const start = options.start ?? (wantShuffle ? Math.floor(Math.random() * valid.length) : 0)
      let next = makeQueue(valid, start)
      if (wantShuffle) next = shuffleUpcoming(next, Math.random)
      radioRef.current = radio
      commitQueue(next)
      setContext(options.context ?? null)
      failures.current = 0
      void loadCurrent()
    },
    [commitQueue, loadCurrent],
  )

  const playTracks = useCallback(
    (trackIds: readonly string[], options?: { start?: number; context?: PlayContext; shuffle?: boolean }): void =>
      startQueue(trackIds, options, null),
    [startQueue],
  )

  const toggle = useCallback((): void => {
    const engine = engineRef.current
    if (!engine) return
    if (engine.playing) {
      engine.pause()
      return
    }
    if (engine.trackId) {
      void engine.play()
      return
    }
    void loadCurrent()
  }, [loadCurrent])

  const pause = useCallback((): void => {
    engineRef.current?.pause()
  }, [])

  const seek = useCallback(
    (seconds: number): void => {
      engineRef.current?.seek(seconds)
      clock.set(seconds, engineRef.current?.duration() ?? 0)
    },
    [clock],
  )
  const next = useCallback((): void => advance(true), [advance])
  const previous = useCallback((): void => {
    const engine = engineRef.current
    if (engine && engine.position() > 3) {
      engine.seek(0)
      return
    }
    const target = previousIndex(queueRef.current, repeatRef.current)
    if (target === null) {
      engine?.seek(0)
      return
    }
    goTo(target)
  }, [goTo])

  const setVolume = useCallback((value: number): void => {
    setVolumeState(Math.min(1, Math.max(0, value)))
    setMuted(false)
  }, [])
  const toggleMute = useCallback((): void => setMuted((current) => !current), [])
  const toggleShuffle = useCallback((): void => {
    const turningOn = !shuffleRef.current
    setShuffleState(turningOn)
    commitQueue(turningOn ? shuffleUpcoming(queueRef.current, Math.random) : restoreOrder(queueRef.current))
  }, [commitQueue])
  const cycleRepeat = useCallback(
    (): void => setRepeatState((current) => (current === 'off' ? 'all' : current === 'all' ? 'one' : 'off')),
    [],
  )

  const setSleep = useCallback(
    (minutes: number | 'track' | null): void => {
      if (minutes === null) {
        setSleepState({ endsAt: null, endOfTrack: false })
        toast('Sleep timer off')
        return
      }
      if (minutes === 'track') {
        setSleepState({ endsAt: null, endOfTrack: true })
        toast('Music will stop at the end of this song')
        return
      }
      setSleepState({ endsAt: Date.now() + minutes * 60_000, endOfTrack: false })
      toast(`Music will stop in ${minutes} minutes`)
    },
    [toast],
  )

  useEffect(() => {
    if (sleep.endsAt === null) return
    const timer = window.setTimeout(
      () => {
        engineRef.current?.pause()
        setSleepState({ endsAt: null, endOfTrack: false })
        toast('Sleep timer: music paused')
      },
      Math.max(0, sleep.endsAt - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [sleep.endsAt, toast])

  // --- editing the queue ------------------------------------------------------------------------------------------------------------------

  const playNext = useCallback(
    (trackIds: readonly string[]): void => {
      const valid = trackIds.filter((id) => indexRef.current.byId.has(id))
      if (valid.length === 0) return
      if (queueRef.current.items.length === 0) {
        startQueue(valid, { context: { kind: 'queue', id: null, label: 'Your queue' } })
        return
      }
      commitQueue(insertNext(queueRef.current, valid))
      toast(valid.length === 1 ? 'Playing next' : `${valid.length} songs will play next`)
    },
    [commitQueue, startQueue, toast],
  )

  const addToQueue = useCallback(
    (trackIds: readonly string[]): void => {
      const valid = trackIds.filter((id) => indexRef.current.byId.has(id))
      if (valid.length === 0) return
      if (queueRef.current.items.length === 0) {
        startQueue(valid, { context: { kind: 'queue', id: null, label: 'Your queue' } })
        return
      }
      commitQueue(append(queueRef.current, valid))
      toast(valid.length === 1 ? 'Added to queue' : `${valid.length} songs added to the queue`)
    },
    [commitQueue, startQueue, toast],
  )

  const removeFromQueue = useCallback(
    (position: number): void => {
      const queueNow = queueRef.current
      const wasCurrent = position === queueNow.index
      const updated = removeAt(queueNow, position)
      commitQueue(updated)
      if (!wasCurrent) return
      if (updated.index < 0) {
        engineRef.current?.stop()
        clock.set(0, 0)
        return
      }
      void loadCurrent()
    },
    [clock, commitQueue, loadCurrent],
  )

  const moveInQueue = useCallback(
    (from: number, to: number): void => commitQueue(move(queueRef.current, from, to)),
    [commitQueue],
  )
  const clearUpcoming = useCallback((): void => {
    commitQueue(clearQueueUpcoming(queueRef.current))
    toast('Cleared what was coming up')
  }, [commitQueue, toast])

  const startRadio = useCallback(
    (seed: RadioSeed, label?: string): void => {
      const picks = radioTracks(indexRef.current, seed, {
        count: 25,
        random: seededRandom(`${Date.now()}`),
        likes: likesRef.current,
      })
      if (picks.length === 0) {
        toast('There are not enough songs for a radio from that.')
        return
      }
      startQueue(
        picks.map((pick) => pick.id),
        {
          start: 0,
          shuffle: false,
          context: { kind: 'radio', id: `${seed.kind}:${seed.value}`, label: label ?? radioLabel(indexRef.current, seed) },
        },
        seed,
      )
    },
    [startQueue, toast],
  )

  // --- what the listener keeps ---------------------------------------------------------------------------------------------------------------

  const toggleLike = useCallback(
    (trackId: string): void => {
      const liked = likesRef.current.has(trackId)
      setUser((state) => ({ ...state, likes: liked ? state.likes.filter((id) => id !== trackId) : [trackId, ...state.likes] }))
      if (!canSaveRef.current) return
      void (liked ? unlikeTrack(trackId) : likeTrack(trackId)).catch((reason: unknown) => {
        setUser((state) => ({ ...state, likes: liked ? [trackId, ...state.likes] : state.likes.filter((id) => id !== trackId) }))
        toast(errorText(reason, 'That could not be saved.'))
      })
    },
    [toast],
  )

  const replacePlaylist = useCallback((summary: PlaylistSummary): void => {
    setUser((state) => ({ ...state, playlists: [summary, ...state.playlists.filter((playlist) => playlist.id !== summary.id)] }))
  }, [])

  const createPlaylist = useCallback(
    async (name: string, trackIds: readonly string[] = []): Promise<PlaylistSummary | null> => {
      try {
        const created = await apiCreatePlaylist(name, trackIds)
        replacePlaylist(created)
        return created
      } catch (reason) {
        toast(errorText(reason, 'The playlist could not be created.'))
        return null
      }
    },
    [replacePlaylist, toast],
  )

  const renamePlaylist = useCallback(
    async (id: string, name: string): Promise<void> => {
      try {
        replacePlaylist(await apiRenamePlaylist(id, name))
      } catch (reason) {
        toast(errorText(reason, 'The playlist could not be renamed.'))
      }
    },
    [replacePlaylist, toast],
  )

  const deletePlaylist = useCallback(
    async (id: string): Promise<void> => {
      try {
        await apiDeletePlaylist(id)
        setUser((state) => ({ ...state, playlists: state.playlists.filter((playlist) => playlist.id !== id) }))
      } catch (reason) {
        toast(errorText(reason, 'The playlist could not be deleted.'))
      }
    },
    [toast],
  )

  const addToPlaylist = useCallback(
    async (id: string, trackIds: readonly string[]): Promise<void> => {
      try {
        replacePlaylist(await addPlaylistTracks(id, trackIds))
        toast(trackIds.length === 1 ? 'Added to playlist' : `${trackIds.length} songs added to the playlist`)
      } catch (reason) {
        toast(errorText(reason, 'The playlist could not be changed.'))
      }
    },
    [replacePlaylist, toast],
  )

  const setPlaylistTracks = useCallback(
    async (id: string, trackIds: readonly string[]): Promise<void> => {
      const before = userRef.current.playlists.find((playlist) => playlist.id === id)
      if (before) replacePlaylist({ ...before, trackIds: [...trackIds], trackCount: trackIds.length })
      try {
        replacePlaylist(await apiSetPlaylistTracks(id, trackIds))
      } catch (reason) {
        if (before) replacePlaylist(before)
        toast(errorText(reason, 'The playlist could not be changed.'))
      }
    },
    [replacePlaylist, toast],
  )

  const saveRadio = useCallback(
    async (seed: RadioSeed, label: string): Promise<SavedRadio | null> => {
      try {
        const radio = await apiSaveRadio(seed.kind, seed.value, label)
        setUser((state) => ({ ...state, radios: [radio, ...state.radios.filter((existing) => existing.id !== radio.id)] }))
        return radio
      } catch (reason) {
        toast(errorText(reason, 'The radio could not be saved.'))
        return null
      }
    },
    [toast],
  )

  const deleteRadio = useCallback(
    async (id: string): Promise<void> => {
      try {
        await apiDeleteRadio(id)
        setUser((state) => ({ ...state, radios: state.radios.filter((radio) => radio.id !== id) }))
      } catch (reason) {
        toast(errorText(reason, 'The radio could not be removed.'))
      }
    },
    [toast],
  )

  // --- the operating system's controls, the tab title, and remembering the place ----------------------------------------------------------------

  const track = useMemo<MusicTrack | null>(() => {
    const item = currentItem(queue)
    return item ? (index.byId.get(item.trackId) ?? null) : null
  }, [queue, index])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      [
        'play',
        () => {
          const engine = engineRef.current
          if (engine?.trackId) void engine.play()
          else void loadCurrent()
        },
      ],
      ['pause', () => engineRef.current?.pause()],
      ['previoustrack', previous],
      ['nexttrack', next],
      [
        'seekto',
        (details) => {
          if (typeof details.seekTime === 'number') seek(details.seekTime)
        },
      ],
      ['seekbackward', () => seek((engineRef.current?.position() ?? 0) - 10)],
      ['seekforward', () => seek((engineRef.current?.position() ?? 0) + 10)],
      ['stop', () => engineRef.current?.pause()],
    ]
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        /* this browser lacks that action */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null)
        } catch {
          /* ignore */
        }
      }
    }
  }, [loadCurrent, next, previous, seek])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artists.join(', '),
          album: track.album,
          artwork: track.cover
            ? [{ src: new URL(coverUrl(track.albumId), window.location.href).href, sizes: '640x640', type: 'image/jpeg' }]
            : [],
        })
      : null
  }, [track])

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = track ? (playing ? 'playing' : 'paused') : 'none'
  }, [playing, track])

  useEffect(() => {
    if (!track || !playing) return
    const original = document.title
    document.title = `▶ ${track.title}${track.artists.length ? ` · ${track.artists[0]}` : ''}`
    return () => {
      document.title = original
    }
  }, [track, playing])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !track || !playing) return
    const timer = window.setInterval(() => {
      const { position, duration } = clock.get()
      if (duration > 0 && position <= duration) {
        try {
          navigator.mediaSession.setPositionState({ duration, position, playbackRate: rate })
        } catch {
          /* not supported */
        }
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [track, playing, clock, rate])

  useEffect(() => {
    const store = (): void => {
      if (queueRef.current.items.length === 0) return
      writeSession({
        ids: queueRef.current.items.map((item) => item.trackId).slice(0, 500),
        index: Math.min(queueRef.current.index, 499),
        position: clock.get().position,
        context,
        volume,
        repeat,
        shuffle,
        autoplay,
        crossfade,
      })
    }
    store()
    const timer = window.setInterval(store, 5000)
    window.addEventListener('pagehide', store)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pagehide', store)
      store()
    }
  }, [queue, context, volume, repeat, shuffle, autoplay, crossfade, clock])

  /** Called by the app whenever sign-in changes. Signing out, or into a different account, stops the music and forgets the library. */
  const setAccount = useCallback(
    (next: string | null): void => {
      const previous = accountRef.current
      if (previous === next) return
      accountRef.current = next
      if (previous !== null) {
        engineRef.current?.stop()
        commitQueue(emptyQueue)
        clock.set(0, 0)
        radioRef.current = null
        setTracks([])
        setUser(emptyUser)
        setPending(0)
        setStatus('idle')
        setContext(null)
        setExpanded(false)
        setSheet(null)
        started.current = false
        restored.current = true
      }
      setAccountState(next)
    },
    [commitQueue, clock],
  )

  const value = useMemo<MusicContextValue>(
    () => ({
      setAccount,
      status,
      error,
      pending,
      index,
      films,
      user,
      likes,
      canSave,
      ensureLibrary,
      refresh,
      queue,
      track,
      context,
      playing,
      buffering,
      volume,
      muted,
      shuffle,
      repeat,
      autoplay,
      crossfade,
      sleep,
      rate,
      clock,
      expanded,
      sheet,
      setExpanded,
      setSheet,
      playTracks,
      toggle,
      pause,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setAutoplay: setAutoplayState,
      setCrossfade: setCrossfadeState,
      setRate: setRateState,
      setSleep,
      playNext,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      jumpTo: goTo,
      clearUpcoming,
      startRadio,
      toggleLike,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addToPlaylist,
      setPlaylistTracks,
      saveRadio,
      deleteRadio,
      toast,
    }),
    [
      setAccount,
      status,
      error,
      pending,
      index,
      films,
      user,
      likes,
      canSave,
      ensureLibrary,
      refresh,
      queue,
      track,
      context,
      playing,
      buffering,
      volume,
      muted,
      shuffle,
      repeat,
      autoplay,
      crossfade,
      sleep,
      rate,
      clock,
      expanded,
      sheet,
      playTracks,
      toggle,
      pause,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setSleep,
      playNext,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      goTo,
      clearUpcoming,
      startRadio,
      toggleLike,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addToPlaylist,
      setPlaylistTracks,
      saveRadio,
      deleteRadio,
      toast,
    ],
  )

  return (
    <MusicContext.Provider value={value}>
      {children}
      {toastText && (
        <p className="music-toast" role="status">
          {toastText}
        </p>
      )}
    </MusicContext.Provider>
  )
}
