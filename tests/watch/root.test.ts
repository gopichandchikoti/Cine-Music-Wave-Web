import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { confinedRealPath, resolveMediaRoot } from '../../server/watch/root.js'
import { WatchLibrary } from '../../server/watch/library.js'
import { walkMedia } from '../../server/watch/catalog.js'

const app = 'E:\\New repos\\app'

test('on Windows the media folder defaults to the whole G: drive, never to Desktop', () => {
  const result = resolveMediaRoot({}, app, 'win32')
  assert.equal(result.root, 'G:\\')
  assert.equal(result.refusal, null)
})

test('a folder on G: is accepted in any spelling', () => {
  for (const configured of ['G:/', 'g:\\movies', 'G:/Telegram Desktop/Music'])
    assert.equal(resolveMediaRoot({ WATCH_MEDIA_DIR: configured }, app, 'win32').refusal, null, configured)
})

test('every other drive, home folder or network share is refused', () => {
  for (const configured of ['C:/Users/me/Desktop', 'D:\\', 'E:/New repos/data/watch', '\\\\server\\share\\movies', 'movies']) {
    const result = resolveMediaRoot({ WATCH_MEDIA_DIR: configured }, app, 'win32')
    assert.ok(result.refusal, `${configured} should be refused`)
    assert.match(result.refusal, /drive G:/)
  }
})

test('the allowed drive can be changed deliberately', () => {
  assert.equal(resolveMediaRoot({ WATCH_ALLOWED_DRIVE: 'h:', WATCH_MEDIA_DIR: 'H:/films' }, app, 'win32').refusal, null)
  assert.ok(resolveMediaRoot({ WATCH_ALLOWED_DRIVE: 'H', WATCH_MEDIA_DIR: 'G:/films' }, app, 'win32').refusal)
})

test('without drive letters the media folder defaults to the empty data/watch folder', () => {
  const result = resolveMediaRoot({}, '/srv/app', 'linux')
  assert.equal(result.root, path.resolve('/srv/app', 'data', 'watch'))
  assert.equal(result.allowedDrive, null)
})

test('a shortcut or junction inside the media folder cannot lead outside it', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'watch-root-'))
  try {
    const media = path.join(base, 'media')
    const outside = path.join(base, 'outside')
    mkdirSync(media)
    mkdirSync(outside)
    writeFileSync(path.join(media, 'song.mp3'), 'x')
    writeFileSync(path.join(outside, 'secret.mp3'), 'x')
    symlinkSync(outside, path.join(media, 'link'), 'junction')

    assert.ok(confinedRealPath(media, path.join(media, 'song.mp3'), null))
    assert.equal(confinedRealPath(media, path.join(media, 'link', 'secret.mp3'), null), null)
    assert.equal(confinedRealPath(media, path.join(media, 'missing.mp3'), null), null)
    // a file whose real location is on another drive than the allowed one is refused even inside the folder
    const drive = /^([A-Za-z]):/.exec(path.resolve(media))?.[1]?.toUpperCase()
    if (drive) assert.equal(confinedRealPath(media, path.join(media, 'song.mp3'), drive === 'Z' ? 'Y' : 'Z'), null)

    const library = new WatchLibrary({
      mediaRoot: media,
      allowedDrive: drive ?? null,
      catalogDirectory: path.join(base, 'catalog'),
      ignored: new Set(),
      tools: null,
      maxStreams: 1,
    })
    const file = (relative: string) => ({
      id: 'f_000000000000',
      path: relative,
      size: 1,
      modifiedAt: '',
      season: null,
      episode: null,
      episodeTitle: null,
      probe: null,
      sidecarSubtitles: [],
    })
    assert.equal(library.absolutePath(file('song.mp3')), path.join(media, 'song.mp3'))
    assert.equal(library.absolutePath(file('link/secret.mp3')), null)
    assert.equal(library.absolutePath(file('../outside/secret.mp3')), null)
    assert.equal(library.absolutePath(file('notes.txt')), null)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('scanning does not walk through a junction to files elsewhere', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'watch-scan-'))
  try {
    const media = path.join(base, 'media')
    const outside = path.join(base, 'outside')
    mkdirSync(media)
    mkdirSync(outside)
    writeFileSync(path.join(media, 'song.mp3'), 'x')
    writeFileSync(path.join(outside, 'secret.mp3'), 'x')
    symlinkSync(outside, path.join(media, 'link'), 'junction')
    const scan = await walkMedia(media, new Set())
    assert.deepEqual(
      scan.entries.map((entry) => entry.path),
      ['song.mp3'],
    )
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
