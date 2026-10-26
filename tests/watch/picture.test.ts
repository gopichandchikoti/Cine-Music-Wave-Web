import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutPicture, nextPicture, PICTURE_PRESETS, type FrameRect } from '../../src/features/watch/picture.js'

const screen = { width: 1600, height: 900 }
const hd = { width: 1920, height: 1080 }
// A 2.39:1 film inside a 16:9 frame: the picture is the middle 74.4% of the height.
const scopeInHd: FrameRect = { x: 0, y: 0.128, w: 1, h: 0.744 }
const close = (actual: number, expected: number, message?: string): void =>
  assert.ok(Math.abs(actual - expected) < 1, `${message ?? 'value'}: ${actual} is not within 1px of ${expected}`)

test('fitting a 16:9 frame on a 16:9 screen fills it exactly and trims nothing', () => {
  const layout = layoutPicture('auto', screen, hd, null)
  assert.deepEqual([layout.left, layout.top, layout.width, layout.height], [0, 0, 1600, 900])
  assert.equal(layout.trim, null)
})

test('fit never cuts the picture: a wide film on a tall screen is limited by the screen width', () => {
  const layout = layoutPicture('auto', { width: 1000, height: 1000 }, hd, scopeInHd)
  close(layout.width, 1000, 'frame width')
  // The picture (not the bars) is centred, so the frame sits symmetrically.
  close(layout.top + (0.128 + 0.744 / 2) * layout.height, 500, 'picture centre')
})

test('fill zooms until the picture covers the screen and trims the overflow', () => {
  const layout = layoutPicture('fill', screen, hd, scopeInHd)
  close(layout.height * 0.744, 900, 'picture height fills the screen')
  close(layout.width, 2150.5, 'frame is wider than the screen')
  close(layout.left, -275.3, 'sides are trimmed evenly')
  assert.equal(layout.trim, null)
})

test('original frame ignores the detected bars', () => {
  const layout = layoutPicture('frame', { width: 1000, height: 1000 }, hd, scopeInHd)
  close(layout.width, 1000)
  close(layout.height, 562.5)
  close(layout.top, 218.75)
})

test('cropping to 2.39:1 cuts the top and bottom of a 16:9 frame and leaves bars', () => {
  const layout = layoutPicture('crop-2.39', screen, hd, null)
  assert.ok(layout.trim)
  close(layout.trim.left, 0)
  close(layout.trim.right, 0)
  close(layout.trim.top, ((1080 - 1920 / 2.39) / 2) * (1600 / 1920), 'top trim')
  close(layout.trim.top, layout.trim.bottom, 'symmetric')
})

test('cropping to IMAX 1.43:1 cuts the sides and fits the tall picture to the screen height', () => {
  const layout = layoutPicture('crop-1.43', screen, hd, scopeInHd)
  assert.ok(layout.trim)
  const visibleWidth = layout.width - layout.trim.left - layout.trim.right
  const visibleHeight = layout.height - layout.trim.top - layout.trim.bottom
  close((visibleWidth / visibleHeight) * 1000, 1430, 'visible region has the requested ratio')
  close(visibleHeight, 900, 'visible region uses the full screen height')
  close(layout.left + layout.trim.left + visibleWidth / 2, 800, 'visible region is centred')
})

test('cropping a frame that is already narrower than the ratio trims the height instead', () => {
  const layout = layoutPicture('crop-1.85', screen, { width: 1000, height: 1000 }, null)
  assert.ok(layout.trim)
  close(layout.trim.left, 0)
  assert.ok(layout.trim.top > 0)
})

test('an unknown size falls back to the whole screen instead of dividing by zero', () => {
  const layout = layoutPicture('auto', screen, { width: 0, height: 0 }, null)
  assert.deepEqual([layout.left, layout.top, layout.width, layout.height], [0, 0, 1600, 900])
})

test('the picture shortcut visits every mode once and wraps', () => {
  const seen = new Set<string>()
  let id = PICTURE_PRESETS[0].id
  for (let step = 0; step < PICTURE_PRESETS.length; step += 1) {
    seen.add(id)
    id = nextPicture(id)
  }
  assert.equal(seen.size, PICTURE_PRESETS.length)
  assert.equal(id, PICTURE_PRESETS[0].id)
})
