import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const script = process.env.PUBLISH_GUARD_UNDER_TEST || fileURLToPath(new URL('./check-publish.mjs', import.meta.url))
const { isLocalFeatureLog } = await import(pathToFileURL(script).href)
const fixture = mkdtempSync(path.join(tmpdir(), 'publish-policy-test-'))
const git = (args, input) =>
  execFileSync('git', ['-C', fixture, ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
git(['init', '--bare'])
const readme = git(['hash-object', '-w', '--stdin'], 'Product documentation\n')
const notes = git(['hash-object', '-w', '--stdin'], 'Local maintainer fixture\n')
const cleanTree = git(['mktree'], `100644 blob ${readme}\tREADME.md\n`)
const taintedTree = git(['mktree'], `100644 blob ${readme}\tREADME.md\n100644 blob ${notes}\tFEATURE_LOG.md\n`)
const commit = (tree, parent) =>
  git(
    ['hash-object', '-t', 'commit', '-w', '--stdin'],
    `tree ${tree}\n${parent ? `parent ${parent}\n` : ''}author Publication Fixture <fixture@example.invalid> 1600000000 +0000\ncommitter Publication Fixture <fixture@example.invalid> 1600000000 +0000\n\nFixture\n`,
  )
const clean = commit(cleanTree)
const tainted = commit(taintedTree, clean)
const deletedLater = commit(cleanTree, tainted)
const run = (revision) =>
  spawnSync(process.execPath, [script], {
    cwd: fixture,
    input: `refs/heads/main ${revision} refs/heads/main ${'0'.repeat(40)}\n`,
    encoding: 'utf8',
  })

after(() => {
  const target = realpathSync(fixture)
  assert.equal(path.dirname(target), realpathSync(tmpdir()))
  assert.ok(path.basename(target).startsWith('publish-policy-test-'))
  rmSync(target, { recursive: true, force: true })
})

test('recognizes local-only filename variants without matching ordinary source files', () => {
  for (const name of ['FEATURE_LOG.md', 'docs/Feature-Log.txt', 'notes/feature_log_2026.md', 'featurelog.md'])
    assert.equal(isLocalFeatureLog(name), true)
  for (const name of ['CHANGELOG.md', 'FeatureLogger.ts', 'src/features/login.ts']) assert.equal(isLocalFeatureLog(name), false)
})
test('permits clean history', () => assert.equal(run(clean).status, 0))
test('rejects a current log and a log deleted only in a later commit', () => {
  for (const revision of [tainted, deletedLater]) {
    const result = run(revision)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /FEATURE_LOG\.md/)
  }
})
test('fails closed for malformed push input', () => {
  const result = spawnSync(process.execPath, [script], { cwd: fixture, input: 'untrusted input\n', encoding: 'utf8' })
  assert.equal(result.status, 1)
})
