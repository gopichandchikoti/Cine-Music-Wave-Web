import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The themes live in CSS, so this reads the stylesheets: the dark palettes are pinned to the approved values, and the light palettes
// must keep text readable (WCAG AA) for Music and Watch.

const css = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const musicDark = css('src/features/music/Music.css')
const musicLight = css('src/features/music/Music.light.css')
const watchDark = css('src/features/watch/Watch.css')
const watchLight = css('src/features/watch/Watch.light.css')

/** The custom properties declared in the first rule whose selector contains `selector`. */
function declared(source: string, selector: string): Map<string, string> {
  const start = source.indexOf(selector)
  assert.ok(start >= 0, `a rule for ${selector}`)
  const open = source.indexOf('{', start)
  const body = source.slice(open + 1, source.indexOf('}', open))
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]))
}

type Rgba = { rgb: [number, number, number]; alpha: number }
function parse(colour: string): Rgba {
  if (colour.startsWith('#')) {
    const value = colour.slice(1)
    return { rgb: [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16)) as [number, number, number], alpha: 1 }
  }
  const parts = colour
    .replace(/rgba?\(|\)/g, '')
    .split(',')
    .map((part) => Number(part.trim()))
  return { rgb: [parts[0], parts[1], parts[2]], alpha: parts[3] ?? 1 }
}
const linear = (channel: number): number => {
  const unit = channel / 255
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: [number, number, number]): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
const over = (front: Rgba, back: [number, number, number]): [number, number, number] =>
  back.map((channel, at) => Math.round(front.rgb[at] * front.alpha + channel * (1 - front.alpha))) as [number, number, number]

/** WCAG contrast of `foreground` (which may be translucent) over the opaque `background`. */
function contrast(foreground: string, background: string): number {
  const back = parse(background)
  const seen = over(parse(foreground), back.rgb)
  const [high, low] = [luminance(seen), luminance(back.rgb)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

test('the dark Music and Watch palettes are the approved ones, unchanged', () => {
  const music = declared(musicDark, '.music-shell, .music-dock')
  assert.equal(music.get('--m-bg'), '#090a10')
  assert.equal(music.get('--m-ink'), '#f6f6fb')
  assert.equal(music.get('--m-accent'), '#ff5c8a')
  assert.equal(music.get('--m-accent-ink'), '#1a0610')
  const watch = declared(watchDark, '.watch-shell {')
  assert.equal(watch.get('--w-bg'), '#03110a')
  assert.equal(watch.get('--w-ink'), '#ecfdf3')
  assert.equal(watch.get('--w-accent'), '#34e58a')
})

test('light Music: text meets WCAG AA on the page, and the accent controls do too', () => {
  const m = declared(musicLight, ":root[data-theme='light'] :is(.music-shell")
  const surface = `rgb(${over(parse(m.get('--m-surface') ?? ''), parse(m.get('--m-bg') ?? '').rgb).join(', ')})`
  assert.ok(contrast(m.get('--m-ink') ?? '', m.get('--m-bg') ?? '') >= 7, 'ink on the page')
  assert.ok(contrast(m.get('--m-muted') ?? '', m.get('--m-bg') ?? '') >= 4.5, 'muted text on the page')
  assert.ok(contrast(m.get('--m-muted') ?? '', surface) >= 4.5, 'muted text on a raised surface')
  assert.ok(contrast(m.get('--m-accent') ?? '', m.get('--m-bg') ?? '') >= 4.5, 'accent on the page')
  assert.ok(contrast(m.get('--m-accent-ink') ?? '', m.get('--m-accent') ?? '') >= 4.5, 'text on the accent')
  assert.ok(contrast(m.get('--m-accent-ink') ?? '', m.get('--m-ink') ?? '') >= 7, 'text on the strong fill')
})

test('light Watch: text meets WCAG AA on the page, and the accent controls do too', () => {
  const w = declared(watchLight, ":root[data-theme='light'] .watch-shell {")
  assert.ok(contrast(w.get('--w-ink') ?? '', w.get('--w-bg') ?? '') >= 7, 'ink on the page')
  assert.ok(contrast(w.get('--w-muted') ?? '', w.get('--w-bg') ?? '') >= 4.5, 'muted text on the page')
  assert.ok(contrast(w.get('--w-muted') ?? '', w.get('--w-surface') ?? '') >= 4.5, 'muted text on a raised surface')
  assert.ok(contrast(w.get('--w-accent') ?? '', w.get('--w-bg') ?? '') >= 4.5, 'accent on the page')
  assert.ok(contrast(w.get('--w-accent-ink') ?? '', w.get('--w-accent') ?? '') >= 4.5, 'text on the accent')
  assert.ok(contrast(w.get('--w-warn') ?? '', w.get('--w-bg') ?? '') >= 4.5, 'warning text on the page')
})

test('the Watch title page, pop-up card and player keep the dark palette in the light theme', () => {
  const dark = declared(watchDark, '.watch-shell {')
  const kept = declared(watchLight, ":root[data-theme='light'] :is(.watch-scrim, .watch-player, .watch-hover) {")
  for (const name of [
    '--w-bg',
    '--w-raised',
    '--w-surface',
    '--w-surface-2',
    '--w-ink',
    '--w-muted',
    '--w-accent',
    '--w-accent-ink',
  ]) {
    assert.equal(kept.get(name), dark.get(name), name)
  }
})
