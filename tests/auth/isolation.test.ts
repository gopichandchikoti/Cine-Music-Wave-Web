import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AuthRepository } from '../../server/auth/repository.js'
test('entertainment migration leaves existing identity tables and rows unchanged', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wave-isolation-')),
    filename = path.join(directory, 'shared.sqlite')
  const original = new DatabaseSync(filename)
  original.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY, marker TEXT); INSERT INTO users VALUES('original','preserve'); CREATE TABLE watch_progress(marker TEXT); INSERT INTO watch_progress VALUES('preserve');",
  )
  const before = original.prepare("SELECT sql FROM sqlite_master WHERE name IN ('users','watch_progress') ORDER BY name").all()
  const repo = new AuthRepository(filename)
  try {
    assert.deepEqual(
      original.prepare("SELECT sql FROM sqlite_master WHERE name IN ('users','watch_progress') ORDER BY name").all(),
      before,
    )
    assert.equal((original.prepare('SELECT marker FROM users').get() as { marker: string }).marker, 'preserve')
    assert.equal((original.prepare('SELECT marker FROM watch_progress').get() as { marker: string }).marker, 'preserve')
    const tables = repo.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name)
    assert.ok(tables.includes('entertainment_users'))
    assert.ok(tables.includes('entertainment_music_playlists'))
    assert.ok(!tables.some((name) => name.includes('markdown') || name.includes('learning')))
  } finally {
    repo.close()
    original.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
