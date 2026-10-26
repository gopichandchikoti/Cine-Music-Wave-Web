import { capabilitiesQuery } from '../watch/capabilities'
import { fetchMusicPlan, musicStreamUrl } from './musicApi'
import type { PlanResponse } from './musicTypes'

// Plays songs. One audio element does the work (the most dependable choice on phones, which are strict about audio that starts on
// its own). A second element is used only while crossfading, to hold the next song while the two overlap.
//
// A song the browser can play is streamed as it is, with byte ranges so seeking is instant. One it cannot (a WAV, say) is converted by
// the server and has no byte ranges, so a seek there asks for a new stream that starts at the chosen second.

type Deck = { audio: HTMLAudioElement; trackId: string | null; plan: PlanResponse | null; offset: number }

export type EngineEvents = {
  time: (position: number, duration: number) => void
  playing: (playing: boolean) => void
  buffering: (buffering: boolean) => void
  /** The song finished by itself and nothing took over; the player decides what comes next. */
  ended: () => void
  /** A crossfade finished: the next song is already playing, so the queue only needs to move on. */
  advanced: (trackId: string) => void
  error: (message: string) => void
}

export const MAX_CROSSFADE_SECONDS = 12
const PRELOAD_SECONDS = 20
const FADE_TICK_MS = 80

export class MusicEngine {
  private readonly decks: [Deck, Deck]
  private active = 0
  private volumeValue = 1
  private mutedValue = false
  private rateValue = 1
  private crossfadeSeconds = 0
  private token = 0
  private fade: { timer: number; from: number; to: number; startedAt: number; length: number; trackId: string } | null = null
  private readonly plans = new Map<string, Promise<PlanResponse>>()

  private readonly events: EngineEvents
  private readonly peekNext: () => string | null

  constructor(events: EngineEvents, peekNext: () => string | null) {
    this.events = events
    this.peekNext = peekNext
    const make = (): Deck => ({ audio: new Audio(), trackId: null, plan: null, offset: 0 })
    this.decks = [make(), make()]
    this.decks.forEach((deck, position) => this.listen(deck, position))
  }

  private get deck(): Deck {
    return this.decks[this.active]
  }
  private get standby(): Deck {
    return this.decks[1 - this.active]
  }

  get trackId(): string | null {
    return this.deck.trackId
  }
  get playing(): boolean {
    return !this.deck.audio.paused
  }
  get volume(): number {
    return this.volumeValue
  }
  get muted(): boolean {
    return this.mutedValue
  }
  get crossfade(): number {
    return this.crossfadeSeconds
  }

  /** Where the song is, counting from the start of the song even when the stream began part-way through. */
  position(): number {
    return this.deck.offset + this.deck.audio.currentTime
  }
  duration(): number {
    return this.deck.plan?.duration ?? (Number.isFinite(this.deck.audio.duration) ? this.deck.audio.duration : 0)
  }

  // --- plans -----------------------------------------------------------------------------------------------------------------------

  private plan(trackId: string, start = 0): Promise<PlanResponse> {
    const key = `${trackId}@${start.toFixed(0)}`
    const known = this.plans.get(key)
    if (known) return known
    const query = `${capabilitiesQuery(false)}&profile=auto${start > 0 ? `&start=${start.toFixed(3)}` : ''}`
    const request = fetchMusicPlan(trackId, query)
    this.plans.set(key, request)
    // A plan is cheap but not free, and a failed one must be asked for again next time.
    request.catch(() => this.plans.delete(key))
    if (this.plans.size > 40) this.plans.delete(this.plans.keys().next().value as string)
    return request
  }

  // --- the audio elements -------------------------------------------------------------------------------------------------------

  private listen(deck: Deck, position: number): void {
    const { audio } = deck
    audio.preload = 'auto'
    const isActive = (): boolean => this.active === position
    audio.addEventListener('timeupdate', () => {
      if (!isActive()) return
      this.events.time(this.position(), this.duration())
      this.maybePrepare()
    })
    audio.addEventListener('play', () => {
      if (isActive()) this.events.playing(true)
    })
    audio.addEventListener('pause', () => {
      if (isActive() && !this.fade) this.events.playing(false)
    })
    audio.addEventListener('waiting', () => {
      if (isActive()) this.events.buffering(true)
    })
    audio.addEventListener('playing', () => {
      if (isActive()) this.events.buffering(false)
    })
    audio.addEventListener('canplay', () => {
      if (isActive()) this.events.buffering(false)
    })
    audio.addEventListener('ended', () => {
      if (isActive() && !this.fade) this.events.ended()
    })
    audio.addEventListener('error', () => {
      if (!isActive() || !audio.error || audio.error.code === MediaError.MEDIA_ERR_ABORTED) return
      this.events.error('This song could not be played.')
    })
  }

  private applyVolume(): void {
    const level = this.mutedValue ? 0 : this.volumeValue
    this.deck.audio.volume = this.fade ? this.deck.audio.volume : level
    this.deck.audio.playbackRate = this.rateValue
    this.standby.audio.playbackRate = this.rateValue
    if (!this.fade) this.standby.audio.volume = 0
  }

  setVolume(value: number): void {
    this.volumeValue = Math.min(1, Math.max(0, value))
    this.applyVolume()
  }
  setMuted(muted: boolean): void {
    this.mutedValue = muted
    this.applyVolume()
  }
  setRate(rate: number): void {
    this.rateValue = rate
    this.applyVolume()
  }
  setCrossfade(seconds: number): void {
    this.crossfadeSeconds = Math.min(MAX_CROSSFADE_SECONDS, Math.max(0, seconds))
  }

  // --- loading and transport ------------------------------------------------------------------------------------------------------

  /** Loads a song and (by default) starts it. Rejects if the server cannot prepare it. */
  async load(trackId: string, startAt = 0, autoplay = true): Promise<void> {
    this.cancelFade()
    const token = ++this.token
    this.standby.audio.pause()
    this.standby.audio.removeAttribute('src')
    this.standby.trackId = null
    this.events.buffering(true)
    let plan: PlanResponse
    try {
      plan = await this.plan(trackId, startAt)
    } catch (error) {
      if (token === this.token) this.events.buffering(false)
      throw error
    }
    if (token !== this.token) return
    const { audio } = this.deck
    this.deck.trackId = trackId
    this.deck.plan = plan
    this.deck.offset = plan.mode === 'direct' ? 0 : plan.start
    audio.src = musicStreamUrl(plan.url)
    this.applyVolume()
    if (plan.mode === 'direct' && startAt > 0) {
      const seekOnce = (): void => {
        audio.currentTime = startAt
        audio.removeEventListener('loadedmetadata', seekOnce)
      }
      audio.addEventListener('loadedmetadata', seekOnce)
    }
    this.events.time(startAt, plan.duration)
    if (autoplay) await this.play()
  }

  async play(): Promise<void> {
    if (this.fade) {
      await this.standby.audio.play().catch(() => undefined)
    }
    try {
      await this.deck.audio.play()
    } catch (error) {
      // A newer load interrupts a pending play; being told to wait for a tap is not an error either.
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
        this.events.playing(false)
        return
      }
      throw error
    }
  }

  pause(): void {
    this.deck.audio.pause()
    if (this.fade) this.standby.audio.pause()
    this.events.playing(false)
  }

  seek(seconds: number): void {
    const deck = this.deck
    const duration = this.duration()
    const target = Math.min(Math.max(0, seconds), duration > 0 ? Math.max(0, duration - 0.25) : seconds)
    this.cancelFade()
    if (!deck.plan || deck.plan.mode === 'direct') {
      deck.audio.currentTime = target
      this.events.time(target, duration)
      return
    }
    const local = target - deck.offset
    const ranges = deck.audio.seekable
    if (local >= 0 && ranges.length > 0 && local <= ranges.end(ranges.length - 1) - 0.5) {
      deck.audio.currentTime = local
      return
    }
    const wasPlaying = !deck.audio.paused
    if (deck.trackId) void this.load(deck.trackId, target, wasPlaying).catch(() => this.events.error('Seeking failed.'))
  }

  stop(): void {
    this.cancelFade()
    this.token += 1
    for (const deck of this.decks) {
      deck.audio.pause()
      deck.audio.removeAttribute('src')
      deck.audio.load()
      deck.trackId = null
      deck.plan = null
      deck.offset = 0
    }
  }

  // --- the next song: warm it up, and crossfade into it ------------------------------------------------------------------------------

  /** Asks the server about the next song a little before the end, so the change is quick. */
  private maybePrepare(): void {
    const deck = this.deck
    const duration = this.duration()
    if (duration <= 0 || deck.audio.paused) return
    const remaining = duration - this.position()
    const next = this.peekNext()
    if (next && remaining <= PRELOAD_SECONDS) void this.plan(next).catch(() => undefined)
    if (
      this.crossfadeSeconds > 0 &&
      !this.fade &&
      next &&
      next !== deck.trackId &&
      remaining <= this.crossfadeSeconds + 0.3 &&
      remaining > 0.2
    )
      void this.startFade(next)
  }

  private async startFade(trackId: string): Promise<void> {
    const token = this.token
    let plan: PlanResponse
    try {
      plan = await this.plan(trackId)
    } catch {
      return
    }
    if (token !== this.token || this.fade) return
    const from = this.active
    const to = 1 - this.active
    const incoming = this.decks[to]
    incoming.trackId = trackId
    incoming.plan = plan
    incoming.offset = plan.mode === 'direct' ? 0 : plan.start
    incoming.audio.src = musicStreamUrl(plan.url)
    incoming.audio.volume = 0
    incoming.audio.playbackRate = this.rateValue
    try {
      await incoming.audio.play()
    } catch {
      incoming.trackId = null
      return
    }
    if (token !== this.token) {
      incoming.audio.pause()
      return
    }
    const length = Math.max(1, Math.min(this.crossfadeSeconds, this.duration() - this.position()))
    const startedAt = performance.now()
    const level = this.mutedValue ? 0 : this.volumeValue
    const timer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / (length * 1000))
      // Equal-power curves keep the loudness steady through the overlap instead of dipping in the middle.
      this.decks[from].audio.volume = level * Math.cos((progress * Math.PI) / 2)
      this.decks[to].audio.volume = level * Math.sin((progress * Math.PI) / 2)
      if (progress >= 1) this.finishFade()
    }, FADE_TICK_MS)
    this.fade = { timer, from, to, startedAt, length, trackId }
  }

  private finishFade(): void {
    const fade = this.fade
    if (!fade) return
    window.clearInterval(fade.timer)
    this.fade = null
    const outgoing = this.decks[fade.from]
    outgoing.audio.pause()
    outgoing.audio.removeAttribute('src')
    outgoing.trackId = null
    this.active = fade.to
    this.applyVolume()
    this.events.advanced(fade.trackId)
  }

  private cancelFade(): void {
    const fade = this.fade
    if (!fade) return
    window.clearInterval(fade.timer)
    this.fade = null
    const incoming = this.decks[fade.to]
    incoming.audio.pause()
    incoming.audio.removeAttribute('src')
    incoming.trackId = null
    this.applyVolume()
  }

  dispose(): void {
    this.stop()
  }
}
