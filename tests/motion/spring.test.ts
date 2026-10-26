import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fromDurationAndBounce,
  SPRINGS,
  settlingTime,
  springConstants,
  springEasing,
  springPosition,
} from '../../src/utils/spring.js'

test("physical constants follow Apple's response and damping fraction", () => {
  const { stiffness, damping, mass } = springConstants({ response: 0.5, dampingFraction: 1 })
  assert.equal(mass, 1)
  assert.ok(Math.abs(stiffness - (2 * Math.PI * 2) ** 2) < 1e-9, 'k = (2π / 0.5)²')
  assert.ok(Math.abs(damping - 8 * Math.PI) < 1e-9, 'c = 4π × 1 / 0.5')
})

test('duration and bounce map to response and damping fraction', () => {
  assert.deepEqual(fromDurationAndBounce(0.5, 0.3), { response: 0.5, dampingFraction: 0.7 })
  assert.deepEqual(fromDurationAndBounce(0.5, 0), { response: 0.5, dampingFraction: 1 })
  assert.deepEqual(fromDurationAndBounce(0.4, 2), { response: 0.4, dampingFraction: 0 }, 'bounce is clamped')
})

test('every spring starts at rest, ends on target, and only the under-damped ones overshoot', () => {
  for (const [name, spec] of Object.entries(SPRINGS)) {
    assert.equal(springPosition(spec, 0), 0, `${name} starts at 0`)
    assert.ok(Math.abs(springPosition(spec, settlingTime(spec) + 0.5) - 1) < 0.001, `${name} ends at 1`)
    const peak = Math.max(...Array.from({ length: 400 }, (_, index) => springPosition(spec, index * 0.005)))
    if (spec.dampingFraction >= 1) assert.ok(peak <= 1.0001, `${name} must not overshoot`)
    else assert.ok(peak > 1.001 && peak < 1.4, `${name} overshoots a little (peak ${peak.toFixed(3)})`)
  }
})

test('the smooth spring never moves backwards', () => {
  let previous = -1
  for (let index = 0; index <= 300; index += 1) {
    const value = springPosition(SPRINGS.smooth, index * 0.004)
    assert.ok(value >= previous - 1e-9)
    previous = value
  }
})

test('the CSS easing is a linear() list from 0 to 1 with a sensible duration', () => {
  for (const spec of Object.values(SPRINGS)) {
    const { easing, durationMs } = springEasing(spec)
    assert.match(easing, /^linear\(0, /)
    assert.match(easing, /, 1\)$/)
    assert.ok(durationMs >= 200 && durationMs <= 1500, `duration ${durationMs}ms`)
  }
  assert.ok(
    springEasing(SPRINGS.bouncy)
      .easing.split(', ')
      .some((value) => Number.parseFloat(value) > 1),
    'the bouncy curve passes 1',
  )
})

test('a faster response settles sooner', () => {
  assert.ok(settlingTime({ response: 0.25, dampingFraction: 0.8 }) < settlingTime({ response: 0.5, dampingFraction: 0.8 }))
})
