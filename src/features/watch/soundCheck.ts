// Tools for answering "why can't I hear anything?": a live level meter on the playing video, and a test beep that does not depend on
// the video at all. Together they show whether the sound stops in the video, or after it leaves the page (muted tab, wrong output).

type CapturingElement = HTMLMediaElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }

export type SoundReading = {
  /** 0 to 1, how loud the video is right now. */
  level: number
  /** True when anything audible came through during the last couple of seconds. */
  heard: boolean
  /** How long the meter has been listening. */
  seconds: number
  /** False when this browser cannot measure the video's sound (no stream capture, or the video comes from another origin). */
  supported: boolean
}

export type SoundMeter = { stop: () => void }

const TICK_MS = 100
const WINDOW_TICKS = 25
const AUDIBLE = 0.004
/** How long to wait for the video's sound to become available before giving up (the stream may still be loading). */
const ATTACH_TICKS = 100

type Tap = { analyser: AnalyserNode; samples: Uint8Array<ArrayBuffer>; dispose: () => void }

/** Connects to a copy of the video's sound, or returns 'wait' (not ready yet) or 'unsupported'. The copy is not sent to the speakers. */
function attach(element: HTMLMediaElement): Tap | 'wait' | 'unsupported' {
  const capturing = element as CapturingElement
  const capture = capturing.captureStream ?? capturing.mozCaptureStream
  if (!capture) return 'unsupported'
  if (!element.currentSrc) return 'wait'
  try {
    // A picture served from another origin hides its sound from the page.
    if (new URL(element.currentSrc, window.location.href).origin !== window.location.origin) return 'unsupported'
    const tracks = capture.call(capturing).getAudioTracks()
    if (tracks.length === 0) return 'wait'
    const context = new AudioContext()
    void context.resume()
    const source = context.createMediaStreamSource(new MediaStream(tracks))
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    // The analyser only runs while something pulls on it, so it feeds a silent output.
    const silent = context.createGain()
    silent.gain.value = 0
    source.connect(analyser)
    analyser.connect(silent)
    silent.connect(context.destination)
    return {
      analyser,
      samples: new Uint8Array(analyser.fftSize),
      dispose: () => {
        source.disconnect()
        void context.close()
      },
    }
  } catch {
    return 'unsupported'
  }
}

/** Listens to the video's sound without changing it, reporting about ten times a second. Keeps trying while the stream is still loading. */
export function startSoundMeter(element: HTMLMediaElement, onReading: (reading: SoundReading) => void): SoundMeter {
  let tap: Tap | null = null
  let attempts = 0
  let ticks = 0
  const recent: number[] = []
  const timer = window.setInterval(() => {
    if (!tap) {
      const attached = attach(element)
      attempts += 1
      if (attached === 'unsupported' || (attached === 'wait' && attempts >= ATTACH_TICKS)) {
        window.clearInterval(timer)
        onReading({ level: 0, heard: false, seconds: 0, supported: false })
        return
      }
      if (attached === 'wait') return
      tap = attached
    }
    tap.analyser.getByteTimeDomainData(tap.samples)
    let sum = 0
    for (const value of tap.samples) {
      const centred = (value - 128) / 128
      sum += centred * centred
    }
    const level = Math.sqrt(sum / tap.samples.length)
    recent.push(level)
    if (recent.length > WINDOW_TICKS) recent.shift()
    ticks += 1
    onReading({
      level: Math.min(1, level * 3),
      heard: Math.max(...recent) > AUDIBLE,
      seconds: (ticks * TICK_MS) / 1000,
      supported: true,
    })
  }, TICK_MS)
  return {
    stop: () => {
      window.clearInterval(timer)
      tap?.dispose()
    },
  }
}

/** A short tone made by the browser itself. Hearing it means the browser can reach your speakers, whatever the video is doing. */
export async function playTestBeep(): Promise<'played' | 'blocked'> {
  const context = new AudioContext()
  try {
    await context.resume()
    if (context.state !== 'running') return 'blocked'
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime
    oscillator.frequency.value = 440
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05)
    gain.gain.linearRampToValueAtTime(0, now + 0.8)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.85)
    await new Promise<void>((resolve) => {
      oscillator.onended = () => resolve()
    })
    return 'played'
  } finally {
    void context.close()
  }
}

export type SoundVerdict = 'muted' | 'paused' | 'unknown' | 'waiting' | 'flowing' | 'silent'

export type SoundFacts = {
  muted: boolean
  volume: number
  playing: boolean
  /** Null until the meter has reported once. */
  reading: SoundReading | null
}

/** What the meter's reading means, in one word. The player turns it into a sentence. */
export function soundVerdict({ muted, volume, playing, reading }: SoundFacts): SoundVerdict {
  if (muted || volume <= 0) return 'muted'
  if (!playing) return 'paused'
  if (!reading) return 'waiting'
  if (!reading.supported) return 'unknown'
  if (reading.heard) return 'flowing'
  return reading.seconds >= 3 ? 'silent' : 'waiting'
}
