import {
  AudioLines,
  Captions,
  ChevronLeft,
  CircleAlert,
  Crop,
  Gauge,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  StepForward,
  Volume2,
  VolumeX,
} from '../../components/icons'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { content as copy, formatContent } from '../../content.js'
import { capabilitiesQuery } from './capabilities'
import { activeCue, parseCues, type Cue } from './captions'
import { isPictureId, layoutPicture, nextPicture, PICTURE_PRESETS, type FrameRect, type PictureId, type Size } from './picture'
import { playTestBeep, soundVerdict, startSoundMeter, type SoundReading, type SoundVerdict } from './soundCheck'
import { TitleArt } from './TitleArt'
import { fetchFrame, fetchPlan, fetchSubtitleText, saveProgress, streamUrl } from './watchApi'
import { episodeAfter, episodeLabel, formatClock, isCompleted } from './watchModel'
import type { PlanResponse, ProgressEntry, WatchFile, WatchTitle } from './watchTypes'

type PlayerProps = {
  title: WatchTitle
  file: WatchFile
  startAt: number
  /** The element that goes fullscreen, so moving to the next episode does not leave fullscreen. */
  fullscreenHost: RefObject<HTMLElement | null>
  onClose: () => void
  onPlayFile: (file: WatchFile) => void
  onProgress: (entry: ProgressEntry) => void
}

// The server decides how to play each file for this browser. If the browser still refuses, the player walks down this list
// (original or repackaged, then converted to H.264, then converted to VP9) before giving up, so a file is never abandoned
// just because its codecs were unusual.
type Profile = 'auto' | 'h264' | 'webm'
const PROFILES: readonly Profile[] = ['auto', 'h264', 'webm']
type Target = { start: number; audio: number | null; profile: Profile; delay: number; safeAudio: boolean; nonce: number }
type Menu = 'audio' | 'subtitles' | 'speed' | 'picture' | null
type StatsVideo = HTMLVideoElement & { webkitAudioDecodedByteCount?: number }

const RATES = [0.75, 1, 1.25, 1.5, 2]
const SAVE_EVERY_MS = 10_000
const HIDE_CONTROLS_MS = 3200
const HUD_MS = 1700
const SYNC_STEP_MS = 50
const SYNC_LIMIT_MS = 5000
const SYNC_COMMIT_MS = 700
/** Seconds of actual playing before a track that decoded nothing is treated as silent. Long enough to cover a quiet opening. */
const SILENCE_CHECK_AFTER = 6
/** Seconds of actual playing before a video that has drawn no frames is treated as a black screen. */
const BLACK_SCREEN_CHECK_AFTER = 4

const PICTURE_COPY: Record<PictureId, { label: string; hint: string }> = {
  auto: { label: copy.watchView.pictureAuto, hint: copy.watchView.pictureAutoHint },
  frame: { label: copy.watchView.pictureFrame, hint: copy.watchView.pictureFrameHint },
  fill: { label: copy.watchView.pictureFill, hint: copy.watchView.pictureFillHint },
  'crop-1.33': { label: copy.watchView.picture43, hint: copy.watchView.picture43Hint },
  'crop-1.43': { label: copy.watchView.picture143, hint: copy.watchView.picture143Hint },
  'crop-1.78': { label: copy.watchView.picture169, hint: copy.watchView.picture169Hint },
  'crop-1.85': { label: copy.watchView.picture185, hint: copy.watchView.picture185Hint },
  'crop-1.9': { label: copy.watchView.picture190, hint: copy.watchView.picture190Hint },
  'crop-2.39': { label: copy.watchView.picture239, hint: copy.watchView.picture239Hint },
}

// --- small remembered preferences: each is optional, so a blocked or full store just means nothing is remembered -------------

const KEYS = {
  volume: 'cine-music-wave:watch-volume',
  picture: 'cine-music-wave:watch-picture',
  audioLanguage: 'cine-music-wave:watch-audio-language',
  subtitleLanguage: 'cine-music-wave:watch-subtitle-language',
  safeAudio: 'cine-music-wave:watch-safe-audio',
  sync: (fileId: string) => `cine-music-wave:watch-sync:${fileId}`,
}

const remembered = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
const remember = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* not remembered */
  }
}

const readVolume = (): number => {
  const stored = remembered(KEYS.volume)
  const value = stored === null ? 1 : Number(stored)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1
}
const readPicture = (): PictureId => {
  const stored = remembered(KEYS.picture)
  return isPictureId(stored) ? stored : 'auto'
}
const readSync = (fileId: string): number => {
  const value = Number(remembered(KEYS.sync(fileId)))
  return Number.isFinite(value) ? Math.max(-SYNC_LIMIT_MS, Math.min(SYNC_LIMIT_MS, Math.round(value))) : 0
}

/** The audio track in the viewer's remembered language, when it is not the one the file would play anyway. */
const preferredAudio = (file: WatchFile): number | null => {
  const language = remembered(KEYS.audioLanguage)
  const match = language ? file.audio.find((track) => track.language === language) : undefined
  const fallback = file.audio.find((track) => track.default) ?? file.audio[0]
  return match && match.ordinal !== fallback?.ordinal ? match.ordinal : null
}
const preferredSubtitle = (file: WatchFile): number | null => {
  const language = remembered(KEYS.subtitleLanguage)
  return language && language !== 'off' ? (file.subtitles.find((track) => track.language === language)?.ordinal ?? null) : null
}

const VERDICT_TEXT: Record<SoundVerdict, string> = {
  muted: copy.watchView.soundMuted,
  paused: copy.watchView.soundPaused,
  unknown: copy.watchView.soundUnknown,
  waiting: copy.watchView.soundWaiting,
  flowing: copy.watchView.soundFlowing,
  silent: copy.watchView.soundSilent,
}

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high)
const signed = (value: number): string => (value > 0 ? `+${value}` : String(value))

export function Player({ title, file, startAt, fullscreenHost, onClose, onPlayFile, onProgress }: PlayerProps) {
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [target, setTarget] = useState<Target>(() => ({
    start: startAt,
    audio: preferredAudio(file),
    profile: 'auto',
    delay: readSync(file.id),
    safeAudio: remembered(KEYS.safeAudio) === '1',
    nonce: 0,
  }))
  // What the server answered for the current target. A result belongs to one target, so a stale answer is never used for a newer one.
  const [planned, setPlanned] = useState<{ key: string; plan: PlanResponse } | null>(null)
  const [refused, setRefused] = useState<{ key: string; message: string | null } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [position, setPosition] = useState(startAt)
  const [buffered, setBuffered] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [volume, setVolume] = useState(readVolume)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [scrub, setScrub] = useState<number | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [subtitle, setSubtitle] = useState<number | null>(() => preferredSubtitle(file))
  const [cueSet, setCueSet] = useState<{ ordinal: number; cues: Cue[] } | null>(null)
  const [awake, setAwake] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [picture, setPicture] = useState<PictureId>(readPicture)
  const [natural, setNatural] = useState<Size | null>(null)
  const [screen, setScreen] = useState<Size>(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [content, setContent] = useState<FrameRect | null>(null)
  const [syncDraft, setSyncDraft] = useState(() => readSync(file.id))
  const [hud, setHud] = useState<{ text: string; id: number } | null>(null)
  const [activity, setActivity] = useState(0)
  // The reading belongs to one stream: after the video element is replaced an old reading is ignored.
  const [sound, setSound] = useState<(SoundReading & { for: string }) | null>(null)
  const [beep, setBeep] = useState<'idle' | 'playing' | 'blocked'>('idle')

  const positionRef = useRef(startAt)
  const planRef = useRef<PlanResponse | null>(null)
  const wantPlay = useRef(true)
  const pendingSeek = useRef(0)
  const lastSaved = useRef(-1)
  const lastWake = useRef(0)
  const hudCount = useRef(0)
  const audioChecked = useRef(false)
  const videoChecked = useRef(false)
  const playedFrom = useRef<number | null>(null)

  const key = `${file.id}:${target.nonce}`
  const plan = planned?.key === key ? planned.plan : null
  const phase: 'planning' | 'ready' | 'failed' = refused?.key === key ? 'failed' : plan ? 'ready' : 'planning'
  const src = plan ? streamUrl(plan.url) : undefined
  const offset = plan && plan.mode !== 'direct' ? plan.start : 0
  const isAudio = title.kind === 'album'
  const next = episodeAfter(title, file)
  const duration = plan?.duration ?? file.duration ?? 0
  const shown = scrub ?? position
  const cue = subtitle !== null && cueSet?.ordinal === subtitle ? activeCue(cueSet.cues, position) : null
  const idle = playing && menu === null && !awake
  const layout = !isAudio && natural ? layoutPicture(picture, screen, natural, content) : null
  const activeAudio = target.audio ?? file.audio.find((track) => track.default)?.ordinal ?? file.audio[0]?.ordinal ?? 0
  const activeAudioTrack = file.audio.find((track) => track.ordinal === activeAudio) ?? null
  const reading = sound?.for === key ? sound : null
  const verdict = soundVerdict({ muted, volume, playing, reading })
  const audioDescription = plan
    ? plan.audioCodec === 'copy'
      ? copy.watchView.audioOriginal
      : plan.audioCodec === 'opus'
        ? copy.watchView.audioOpus
        : copy.watchView.audioAac
    : ''

  // A new plan means a new stream (and a new video element), so the old source is never requested again.
  const replan = (change: Partial<Omit<Target, 'nonce'>>): void => {
    audioChecked.current = false
    videoChecked.current = false
    playedFrom.current = null
    setTarget((previous) => ({ ...previous, ...change, nonce: previous.nonce + 1 }))
  }

  const showHud = (text: string): void => {
    hudCount.current += 1
    setHud({ text, id: hudCount.current })
  }

  // --- asking the server how to play this file for this browser ------------------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController()
    const planKey = `${file.id}:${target.nonce}`
    const parts = [capabilitiesQuery(target.safeAudio), `profile=${target.profile}`]
    if (target.audio !== null) parts.push(`audio=${target.audio}`)
    if (target.delay !== 0) parts.push(`delay=${target.delay}`)
    if (target.start > 0) parts.push(`start=${target.start.toFixed(3)}`)
    fetchPlan(file.id, parts.join('&'), controller.signal).then(
      (result) => {
        const begin = result.mode === 'direct' ? target.start : result.start
        pendingSeek.current = result.mode === 'direct' ? target.start : 0
        planRef.current = result
        positionRef.current = begin
        setPosition(begin)
        setPlanned({ key: planKey, plan: result })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setRefused({ key: planKey, message: error instanceof Error ? error.message : null })
      },
    )
    return () => controller.abort()
  }, [file.id, target])

  // Where the real picture sits inside any baked-in black bars, so "fit to screen" can fit the picture instead of the bars.
  useEffect(() => {
    if (isAudio) return
    const controller = new AbortController()
    fetchFrame(file.id, controller.signal).then(
      ({ rect }) => setContent(rect),
      () => undefined,
    )
    return () => controller.abort()
  }, [file.id, isAudio])

  // --- keeping the user's place ---------------------------------------------------------------------------------------------------

  const persist = (keepalive: boolean): void => {
    const current = planRef.current
    const at = Math.floor(positionRef.current)
    if (!current || at < 5 || at === lastSaved.current) return
    lastSaved.current = at
    onProgress({
      fileId: file.id,
      titleId: title.id,
      position: at,
      duration: current.duration,
      completed: isCompleted(at, current.duration),
      updatedAt: new Date().toISOString(),
    })
    void saveProgress(file.id, at, current.duration, keepalive).catch(() => undefined)
  }
  const persistLatest = useRef(persist)
  useEffect(() => {
    persistLatest.current = persist
  })

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (video.current && !video.current.paused) persistLatest.current(false)
    }, SAVE_EVERY_MS)
    return () => {
      window.clearInterval(timer)
      persistLatest.current(true)
    }
  }, [])

  // --- page behaviour while the player is open ----------------------------------------------------------------------------------

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const onChange = (): void => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setScreen({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = video.current
    if (!element) return
    element.volume = volume
    element.muted = muted
    element.playbackRate = rate
  }, [volume, muted, rate, src])

  useEffect(() => {
    if (!playing || menu !== null) return
    const timer = window.setTimeout(() => setAwake(false), HIDE_CONTROLS_MS)
    return () => window.clearTimeout(timer)
  }, [playing, menu, activity])

  useEffect(() => {
    if (!hud) return
    const timer = window.setTimeout(() => setHud(null), HUD_MS)
    return () => window.clearTimeout(timer)
  }, [hud])

  useEffect(() => {
    if (subtitle === null) return
    const controller = new AbortController()
    void fetchSubtitleText(file.id, subtitle, controller.signal).then(
      (text) => setCueSet({ ordinal: subtitle, cues: parseCues(text) }),
      () => {
        if (!controller.signal.aborted) setSubtitle(null)
      },
    )
    return () => controller.abort()
  }, [file.id, subtitle])

  // The level meter only listens while the Audio panel is open.
  useEffect(() => {
    if (menu !== 'audio' || !plan) return
    const element = video.current
    if (!element) return
    const meter = startSoundMeter(element, (next) => setSound({ ...next, for: key }))
    return () => meter.stop()
  }, [menu, plan, key])

  // An audio-sync change restarts the stream, so wait until the viewer has stopped nudging it before asking.
  useEffect(() => {
    if (syncDraft === target.delay) return
    const timer = window.setTimeout(() => {
      remember(KEYS.sync(file.id), syncDraft === 0 ? null : String(syncDraft))
      replan({ delay: syncDraft, start: positionRef.current })
    }, SYNC_COMMIT_MS)
    return () => window.clearTimeout(timer)
  }, [syncDraft, target.delay, file.id])

  // Pointer and key events arrive constantly; waking the controls at most four times a second is plenty.
  const wake = (stamp: number): void => {
    if (stamp - lastWake.current < 250) return
    lastWake.current = stamp
    setAwake(true)
    setActivity((value) => value + 1)
  }

  // --- actions ------------------------------------------------------------------------------------------------------------------

  const reportPlayRejection = (reason: unknown): void => {
    // A newer load or a pause interrupts a pending play() with AbortError; that is not a failure.
    if (reason instanceof DOMException && reason.name === 'AbortError') return
    if (reason instanceof DOMException && reason.name === 'NotAllowedError') setPlaying(false)
  }

  const togglePlay = (): void => {
    const element = video.current
    if (!element) return
    if (element.paused) {
      wantPlay.current = true
      void element.play().catch(reportPlayRejection)
    } else {
      wantPlay.current = false
      element.pause()
    }
  }

  const seekTo = (seconds: number): void => {
    const element = video.current
    const current = planRef.current
    if (!element || !current) return
    const time = clamp(seconds, 0, Math.max(0, current.duration - 0.5))
    positionRef.current = time
    setPosition(time)
    if (current.mode === 'direct') {
      element.currentTime = time
      return
    }
    // A repackaged or converted stream has no byte ranges: seek inside what is already buffered, otherwise ask for a new stream from there.
    const local = time - offset
    const ranges = element.seekable
    if (local >= 0 && ranges.length > 0 && local <= ranges.end(ranges.length - 1) - 0.5) {
      element.currentTime = local
      return
    }
    replan({ start: time })
  }

  const skip = (seconds: number): void => seekTo(positionRef.current + seconds)

  const closeMenu = (): void => {
    setMenu(null)
    root.current?.focus()
  }

  const chooseAudio = (ordinal: number): void => {
    const track = file.audio.find((candidate) => candidate.ordinal === ordinal)
    closeMenu()
    if (track?.language) remember(KEYS.audioLanguage, track.language)
    if (track) showHud(formatContent(copy.watchView.audioChanged, { track: track.label }))
    replan({ audio: ordinal, start: positionRef.current })
  }

  const chooseSubtitle = (ordinal: number | null): void => {
    setSubtitle(ordinal)
    closeMenu()
    remember(
      KEYS.subtitleLanguage,
      ordinal === null ? 'off' : (file.subtitles.find((track) => track.ordinal === ordinal)?.language ?? null),
    )
  }

  const choosePicture = (id: PictureId): void => {
    setPicture(id)
    closeMenu()
    remember(KEYS.picture, id)
    showHud(formatContent(copy.watchView.pictureChanged, { mode: PICTURE_COPY[id].label }))
  }

  const nudgeSync = (change: number): void => {
    const value = change === 0 ? 0 : clamp(syncDraft + change, -SYNC_LIMIT_MS, SYNC_LIMIT_MS)
    setSyncDraft(value)
    showHud(formatContent(copy.watchView.syncChanged, { value: signed(value) }))
  }

  const playBeep = async (): Promise<void> => {
    setBeep('playing')
    setBeep((await playTestBeep()) === 'played' ? 'idle' : 'blocked')
  }

  // The same switch the player flips by itself when it catches a silent track, offered to the viewer as well.
  const toggleCompatibleAudio = (): void => {
    const enable = !target.safeAudio
    remember(KEYS.safeAudio, enable ? '1' : null)
    closeMenu()
    replan({ safeAudio: enable, start: positionRef.current })
  }

  const retryFromStart = (): void => {
    setNote(null)
    replan({ profile: 'auto', start: positionRef.current })
  }

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void (fullscreenHost.current ?? root.current)?.requestFullscreen().catch(() => undefined)
  }

  const close = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    onClose()
  }

  const changeVolume = (value: number): void => {
    const level = clamp(value, 0, 1)
    setVolume(level)
    setMuted(level === 0)
    remember(KEYS.volume, String(level))
  }

  // --- the video element ----------------------------------------------------------------------------------------------------------

  // Moves one step down the list (original, then H.264, then VP9), or gives up when the list is exhausted.
  const fallBack = (): void => {
    const following = PROFILES[PROFILES.indexOf(target.profile) + 1]
    if (following === undefined) {
      setRefused({ key, message: null })
      return
    }
    setNote(copy.watchView.switchingFormat)
    replan({ profile: following, start: positionRef.current })
  }

  const handleError = (): void => {
    const element = video.current
    if (!element?.error || element.error.code === MediaError.MEDIA_ERR_ABORTED) return
    fallBack()
  }

  // The same idea for the picture: a browser can claim it decodes HEVC or AV1 and then draw nothing but black.
  const checkForBlackScreen = (element: HTMLVideoElement): void => {
    if (videoChecked.current || !plan || plan.videoCodec !== 'copy' || isAudio || target.profile !== 'auto') return
    if (playedFrom.current === null || element.currentTime - playedFrom.current < BLACK_SCREEN_CHECK_AFTER) return
    videoChecked.current = true
    const frames = element.getVideoPlaybackQuality().totalVideoFrames
    if (element.videoWidth > 0 && frames === 0) fallBack()
  }

  // Some browsers say they can decode a sound format and then play the picture in silence. If a copied audio track has decoded
  // nothing after several seconds of playing, ask the server to convert the audio to plain AAC, and remember that for next time.
  const checkForSilence = (element: StatsVideo): void => {
    if (audioChecked.current || !plan || plan.audioCodec !== 'copy' || file.audio.length === 0 || target.safeAudio) return
    if (
      element.muted ||
      element.volume === 0 ||
      playedFrom.current === null ||
      element.currentTime - playedFrom.current < SILENCE_CHECK_AFTER
    )
      return
    audioChecked.current = true
    if (typeof element.webkitAudioDecodedByteCount !== 'number' || element.webkitAudioDecodedByteCount > 0) return
    remember(KEYS.safeAudio, '1')
    setNote(copy.watchView.audioFallbackNote)
    replan({ safeAudio: true, start: positionRef.current })
  }

  const handleTimeUpdate = (): void => {
    const element = video.current
    if (!element) return
    const time = offset + element.currentTime
    positionRef.current = time
    if (scrub === null) setPosition(time)
    const ranges = element.buffered
    setBuffered(ranges.length > 0 ? offset + ranges.end(ranges.length - 1) : 0)
    checkForSilence(element)
    checkForBlackScreen(element)
  }

  const handleEnded = (): void => {
    const current = planRef.current
    if (current) {
      positionRef.current = current.duration
      lastSaved.current = -1
      persist(false)
    }
    setPlaying(false)
    if (next) onPlayFile(next)
  }

  const handleKey = (event: KeyboardEvent): void => {
    wake(event.timeStamp)
    if (event.key === 'Escape') {
      if (menu !== null) setMenu(null)
      else if (!document.fullscreenElement) close()
      return
    }
    const origin = event.target
    if (origin instanceof HTMLInputElement || origin instanceof HTMLSelectElement) return
    if (origin instanceof HTMLButtonElement && (event.key === ' ' || event.key === 'Enter')) return
    const handled = (): void => event.preventDefault()
    switch (event.key) {
      case ' ':
      case 'k':
        handled()
        togglePlay()
        break
      case 'ArrowLeft':
      case 'j':
        handled()
        skip(-10)
        break
      case 'ArrowRight':
      case 'l':
        handled()
        skip(10)
        break
      case 'ArrowUp':
        handled()
        changeVolume(volume + 0.05)
        break
      case 'ArrowDown':
        handled()
        changeVolume(volume - 0.05)
        break
      case 'm':
        handled()
        setMuted((value) => !value)
        break
      case 'f':
        handled()
        toggleFullscreen()
        break
      case 'c':
        handled()
        chooseSubtitle(subtitle === null ? (file.subtitles[0]?.ordinal ?? null) : null)
        break
      case 'z':
        handled()
        choosePicture(nextPicture(picture))
        break
      case '[':
        handled()
        nudgeSync(-SYNC_STEP_MS)
        break
      case ']':
        handled()
        nudgeSync(SYNC_STEP_MS)
        break
      default:
        break
    }
  }

  // Listen on the document, not the player: when a menu closes the focused button disappears and focus falls back to the page,
  // and the shortcuts (space, arrows, escape) must keep working.
  const keyHandler = useRef(handleKey)
  useEffect(() => {
    keyHandler.current = handleKey
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => keyHandler.current(event)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])

  const commitScrub = (): void => {
    if (scrub === null) return
    const time = scrub
    setScrub(null)
    seekTo(time)
  }

  const busy = phase === 'planning' || (phase === 'ready' && waiting)
  const heading =
    title.kind === 'movie'
      ? title.title
      : `${title.title}${episodeLabel(file) ? ` · ${episodeLabel(file)}` : ''}${file.title ? ` · ${file.title}` : ''}`
  const toggleMenu = (name: Exclude<Menu, null>): void => setMenu(menu === name ? null : name)

  return (
    <div
      className={`watch-player ${idle ? 'is-idle' : ''} ${isAudio ? 'is-audio' : ''}`}
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`${copy.watchView.playerLabel}: ${heading}`}
      tabIndex={-1}
      onPointerMove={(event) => wake(event.timeStamp)}
      onPointerDown={(event) => wake(event.timeStamp)}
    >
      {isAudio && (
        <div className="watch-player-cover" aria-hidden="true">
          <TitleArt title={title} kind="card" />
        </div>
      )}
      <video
        key={target.nonce}
        ref={video}
        className={`watch-player-video ${layout ? 'is-placed' : ''}`}
        style={
          layout
            ? {
                left: layout.left,
                top: layout.top,
                width: layout.width,
                height: layout.height,
                clipPath: layout.trim
                  ? `inset(${layout.trim.top}px ${layout.trim.right}px ${layout.trim.bottom}px ${layout.trim.left}px)`
                  : undefined,
              }
            : undefined
        }
        src={src}
        playsInline
        preload="auto"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onLoadStart={() => setWaiting(true)}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget
          element.volume = volume
          element.muted = muted
          element.playbackRate = rate
          if (element.videoWidth > 0) setNatural({ width: element.videoWidth, height: element.videoHeight })
          if (pendingSeek.current > 0) {
            element.currentTime = pendingSeek.current
            pendingSeek.current = 0
          }
        }}
        onResize={(event) => {
          if (event.currentTarget.videoWidth > 0)
            setNatural({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })
        }}
        onCanPlay={(event) => {
          setWaiting(false)
          if (wantPlay.current && event.currentTarget.paused) void event.currentTarget.play().catch(reportPlayRejection)
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          persist(false)
        }}
        onPlaying={(event) => {
          setWaiting(false)
          setNote(null)
          setPlaying(true)
          if (playedFrom.current === null) playedFrom.current = event.currentTarget.currentTime
        }}
        onWaiting={() => setWaiting(true)}
        onTimeUpdate={handleTimeUpdate}
        onProgress={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
      />

      {cue && (
        <div className="watch-caption" aria-hidden="true">
          <span>{cue.text}</span>
        </div>
      )}
      {hud && (
        <div className="watch-hud glass" role="status" key={hud.id}>
          {hud.text}
        </div>
      )}

      <div className="watch-player-top">
        <button
          className="watch-round is-ghost glass-button"
          type="button"
          onClick={close}
          aria-label={copy.watchView.backToLibrary}
          title={copy.watchView.backToLibrary}
        >
          <ChevronLeft size={24} />
        </button>
        <div className="watch-player-heading-block">
          <small>{copy.watchView.nowPlaying}</small>
          <strong>{heading}</strong>
        </div>
        <div className="watch-player-chips">
          {activeAudioTrack && (
            <span className="watch-player-chip glass-button" title={`${copy.watchView.audioNow}: ${audioDescription}`}>
              <AudioLines size={13} />
              {formatContent(copy.watchView.audioChip, { track: activeAudioTrack.label })}
              {syncDraft !== 0 ? ` · ${signed(syncDraft)} ms` : ''}
            </span>
          )}
          {plan && plan.mode !== 'direct' && (
            <span className="watch-player-chip glass-button" title={`${plan.reason} (${audioDescription})`}>
              {plan.mode === 'remux' ? copy.watchView.repackagedNote : copy.watchView.convertingNote}
            </span>
          )}
        </div>
      </div>

      {(busy || note) && phase !== 'failed' && (
        <div className="watch-player-status" role="status">
          <span className="watch-spinner is-large" />
          {note ?? (phase === 'planning' ? copy.watchView.preparingVideo : copy.watchView.buffering)}
        </div>
      )}

      {phase === 'failed' && (
        <div className="watch-player-error" role="alert">
          <CircleAlert size={30} />
          <strong>{copy.watchView.playbackFailed}</strong>
          <p>{refused?.message ?? copy.watchView.playbackFailedHelp}</p>
          <div>
            <button className="watch-button is-primary" type="button" onClick={retryFromStart}>
              <RotateCcw size={18} />
              {copy.watchView.tryAgain}
            </button>
            <button className="watch-button" type="button" onClick={close}>
              {copy.watchView.backToLibrary}
            </button>
          </div>
        </div>
      )}

      <div className="watch-player-bar glass">
        <div className="watch-scrub">
          <span>{formatClock(shown)}</span>
          <div className="watch-scrub-track">
            <span
              className="watch-scrub-buffer"
              style={{ width: `${duration > 0 ? clamp((buffered / duration) * 100, 0, 100) : 0}%` }}
            />
            <input
              type="range"
              aria-label={copy.watchView.seekMedia}
              min={0}
              max={Math.max(duration, 1)}
              step={1}
              value={clamp(shown, 0, Math.max(duration, 1))}
              style={{ ['--filled' as string]: `${duration > 0 ? clamp((shown / duration) * 100, 0, 100) : 0}%` }}
              onChange={(event) => setScrub(Number(event.target.value))}
              onPointerUp={commitScrub}
              onKeyUp={commitScrub}
              onBlur={commitScrub}
              disabled={phase !== 'ready'}
            />
          </div>
          <span>{formatClock(Math.max(0, duration - shown))}</span>
        </div>
        <div className="watch-player-buttons">
          <div className="watch-player-group">
            <button
              className="watch-player-button"
              type="button"
              onClick={togglePlay}
              aria-label={playing ? copy.watchView.pause : copy.watchView.play}
              title={playing ? copy.watchView.pause : copy.watchView.play}
            >
              {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
            </button>
            <button
              className="watch-player-button"
              type="button"
              onClick={() => skip(-10)}
              aria-label={copy.watchView.back10Seconds}
              title={copy.watchView.back10Seconds}
            >
              <SkipBack size={22} />
            </button>
            <button
              className="watch-player-button"
              type="button"
              onClick={() => skip(10)}
              aria-label={copy.watchView.forward10Seconds}
              title={copy.watchView.forward10Seconds}
            >
              <SkipForward size={22} />
            </button>
            <div className="watch-volume">
              <button
                className="watch-player-button"
                type="button"
                onClick={() => setMuted((value) => !value)}
                aria-label={muted || volume === 0 ? copy.watchView.unmute : copy.watchView.mute}
                title={muted || volume === 0 ? copy.watchView.unmute : copy.watchView.mute}
              >
                {muted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
              </button>
              <input
                type="range"
                aria-label={copy.watchView.volume}
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="watch-player-heading">{heading}</div>
          <div className="watch-player-group">
            {next && (
              <button
                className="watch-player-button"
                type="button"
                onClick={() => onPlayFile(next)}
                aria-label={copy.watchView.nextEpisode}
                title={copy.watchView.nextEpisode}
              >
                <StepForward size={22} />
              </button>
            )}
            {file.audio.length > 0 && (
              <div className="watch-menu-host">
                <button
                  className={`watch-player-button ${menu === 'audio' || syncDraft !== 0 ? 'is-on' : ''}`}
                  type="button"
                  onClick={() => toggleMenu('audio')}
                  aria-haspopup="dialog"
                  aria-expanded={menu === 'audio'}
                  aria-label={copy.watchView.audioTracks}
                  title={copy.watchView.audioTracks}
                >
                  <AudioLines size={22} />
                </button>
                {menu === 'audio' && (
                  <div className="watch-menu is-audio" role="dialog" aria-label={copy.watchView.audioTracks}>
                    <h3 className="watch-menu-heading">{copy.watchView.audioLanguage}</h3>
                    {file.audio.length > 1 ? (
                      <div role="menu" aria-label={copy.watchView.audioLanguage}>
                        {file.audio.map((track) => (
                          <button
                            key={track.ordinal}
                            type="button"
                            role="menuitemradio"
                            aria-checked={track.ordinal === activeAudio}
                            onClick={() => chooseAudio(track.ordinal)}
                          >
                            {track.label}
                            {track.default && <small>{copy.watchView.audioDefaultTag}</small>}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="watch-menu-note">{activeAudioTrack?.label}</p>
                    )}
                    <h3 className="watch-menu-heading">{copy.watchView.syncMenu}</h3>
                    <div className="watch-sync-row">
                      <button
                        type="button"
                        onClick={() => nudgeSync(-SYNC_STEP_MS)}
                        aria-label={copy.watchView.syncEarlier}
                        title={copy.watchView.syncEarlier}
                        disabled={syncDraft <= -SYNC_LIMIT_MS}
                      >
                        <Minus size={18} />
                      </button>
                      <output aria-live="polite">{formatContent(copy.watchView.syncValue, { value: signed(syncDraft) })}</output>
                      <button
                        type="button"
                        onClick={() => nudgeSync(SYNC_STEP_MS)}
                        aria-label={copy.watchView.syncLater}
                        title={copy.watchView.syncLater}
                        disabled={syncDraft >= SYNC_LIMIT_MS}
                      >
                        <Plus size={18} />
                      </button>
                      <button className="watch-sync-reset" type="button" onClick={() => nudgeSync(0)} disabled={syncDraft === 0}>
                        {copy.watchView.syncReset}
                      </button>
                    </div>
                    <p className="watch-menu-note">{copy.watchView.syncHint}</p>
                    <h3 className="watch-menu-heading">{copy.watchView.soundCheckTitle}</h3>
                    <div className="watch-meter" role="img" aria-label={copy.watchView.soundLevel}>
                      <span style={{ width: `${Math.round((reading?.level ?? 0) * 100)}%` }} />
                    </div>
                    <p className="watch-menu-note" aria-live="polite">
                      {VERDICT_TEXT[verdict]}
                    </p>
                    <p className="watch-menu-note is-quiet">
                      {formatContent(copy.watchView.soundFacts, {
                        volume: Math.round((muted ? 0 : volume) * 100),
                        audio: audioDescription,
                      })}
                    </p>
                    <div className="watch-menu-actions">
                      <button
                        className="watch-menu-action"
                        type="button"
                        onClick={() => {
                          void playBeep()
                        }}
                        disabled={beep === 'playing'}
                      >
                        {beep === 'playing' ? copy.watchView.soundBeepPlaying : copy.watchView.soundBeep}
                      </button>
                      <button className="watch-menu-action" type="button" onClick={toggleCompatibleAudio}>
                        {target.safeAudio ? copy.watchView.soundConvertOff : copy.watchView.soundConvert}
                      </button>
                    </div>
                    {beep === 'blocked' && <p className="watch-menu-note is-warning">{copy.watchView.soundBeepBlocked}</p>}
                  </div>
                )}
              </div>
            )}
            {file.subtitles.length > 0 && (
              <div className="watch-menu-host">
                <button
                  className={`watch-player-button ${subtitle !== null ? 'is-on' : ''}`}
                  type="button"
                  onClick={() => toggleMenu('subtitles')}
                  aria-haspopup="menu"
                  aria-expanded={menu === 'subtitles'}
                  aria-label={copy.watchView.subtitles}
                  title={copy.watchView.subtitles}
                >
                  <Captions size={22} />
                </button>
                {menu === 'subtitles' && (
                  <div className="watch-menu" role="menu" aria-label={copy.watchView.subtitles}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={subtitle === null}
                      onClick={() => chooseSubtitle(null)}
                    >
                      {copy.watchView.subtitlesOff}
                    </button>
                    {file.subtitles.map((track) => (
                      <button
                        key={track.ordinal}
                        type="button"
                        role="menuitemradio"
                        aria-checked={subtitle === track.ordinal}
                        onClick={() => chooseSubtitle(track.ordinal)}
                      >
                        {track.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!isAudio && (
              <div className="watch-menu-host">
                <button
                  className={`watch-player-button ${picture !== 'auto' || menu === 'picture' ? 'is-on' : ''}`}
                  type="button"
                  onClick={() => toggleMenu('picture')}
                  aria-haspopup="menu"
                  aria-expanded={menu === 'picture'}
                  aria-label={copy.watchView.pictureMenu}
                  title={`${copy.watchView.pictureMenu} ( Z )`}
                >
                  <Crop size={22} />
                </button>
                {menu === 'picture' && (
                  <div className="watch-menu is-wide" role="menu" aria-label={copy.watchView.pictureMenu}>
                    {PICTURE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={picture === preset.id}
                        onClick={() => choosePicture(preset.id)}
                      >
                        {PICTURE_COPY[preset.id].label}
                        <small>{PICTURE_COPY[preset.id].hint}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="watch-menu-host">
              <button
                className="watch-player-button"
                type="button"
                onClick={() => toggleMenu('speed')}
                aria-haspopup="menu"
                aria-expanded={menu === 'speed'}
                aria-label={copy.watchView.playbackSpeed}
                title={copy.watchView.playbackSpeed}
              >
                <Gauge size={22} />
              </button>
              {menu === 'speed' && (
                <div className="watch-menu" role="menu" aria-label={copy.watchView.playbackSpeed}>
                  {RATES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={value === rate}
                      onClick={() => {
                        setRate(value)
                        closeMenu()
                      }}
                    >{`${value}×`}</button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="watch-player-button"
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? copy.watchView.exitFullscreen : copy.watchView.fullscreen}
              title={fullscreen ? copy.watchView.exitFullscreen : copy.watchView.fullscreen}
            >
              {fullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
