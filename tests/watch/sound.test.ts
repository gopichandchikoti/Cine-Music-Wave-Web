import test from 'node:test'
import assert from 'node:assert/strict'
import { soundVerdict, type SoundReading } from '../../src/features/watch/soundCheck.js'

const reading = (overrides: Partial<SoundReading> = {}): SoundReading => ({
  level: 0.2,
  heard: true,
  seconds: 5,
  supported: true,
  ...overrides,
})

test('a muted or zero-volume player is reported as muted before anything else', () => {
  assert.equal(soundVerdict({ muted: true, volume: 1, playing: true, reading: reading() }), 'muted')
  assert.equal(soundVerdict({ muted: false, volume: 0, playing: true, reading: reading() }), 'muted')
})

test('nothing can be judged while paused, and the first moments are spent listening', () => {
  assert.equal(soundVerdict({ muted: false, volume: 1, playing: false, reading: reading() }), 'paused')
  assert.equal(soundVerdict({ muted: false, volume: 1, playing: true, reading: null }), 'waiting')
})

test('a browser that cannot measure sound says so instead of claiming silence', () => {
  assert.equal(
    soundVerdict({ muted: false, volume: 1, playing: true, reading: reading({ supported: false, heard: false, seconds: 0 }) }),
    'unknown',
  )
})

test('sound that reaches the page is "flowing"; silence only counts after a few seconds of listening', () => {
  assert.equal(soundVerdict({ muted: false, volume: 0.8, playing: true, reading: reading() }), 'flowing')
  assert.equal(
    soundVerdict({ muted: false, volume: 0.8, playing: true, reading: reading({ heard: false, seconds: 1 }) }),
    'waiting',
  )
  assert.equal(
    soundVerdict({ muted: false, volume: 0.8, playing: true, reading: reading({ heard: false, seconds: 4 }) }),
    'silent',
  )
})
