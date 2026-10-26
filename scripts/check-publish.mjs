/** Reject local-only maintainer logs anywhere in the history being published. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function isLocalFeatureLog(file) {
  return /^feature[ _-]?logs?(?:[._ -].*)?$/i.test(file.replaceAll('\\', '/').split('/').at(-1) ?? '')
}

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })

export function rejectedPaths(revisions) {
  const commits = [...new Set(revisions)]
  if (commits.some((value) => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value))) throw new Error('Invalid revision.')
  if (commits.length === 0) return []
  const trees = new Set(
    git('log', '--format=%T', ...commits, '--')
      .trim()
      .split('\n')
      .filter(Boolean),
  )
  const rejected = new Set()
  for (const tree of trees) {
    for (const file of git('ls-tree', '-r', '--name-only', '-z', tree).split('\0')) {
      if (file && isLocalFeatureLog(file)) rejected.add(file)
    }
  }
  return [...rejected].sort()
}

export function verifyPush(input) {
  const revisions = []
  for (const line of input.split(/\r?\n/).filter((value) => value.trim())) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(fields[1] ?? '')) throw new Error('Invalid push input.')
    if (!/^0+$/.test(fields[1])) revisions.push(fields[1])
  }
  return rejectedPaths(revisions)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const rejected = verifyPush(readFileSync(0, 'utf8'))
    if (rejected.length) {
      process.stderr.write('Push blocked: local-only maintainer logs exist in the history being published.\n')
      for (const file of rejected) process.stderr.write(`  ${file}\n`)
      process.exitCode = 1
    }
  } catch {
    process.stderr.write('Push blocked: publication policy could not be verified.\n')
    process.exitCode = 1
  }
}
