import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localEnv = existsSync(path.join(root, '.env')) ? parseEnv(readFileSync(path.join(root, '.env'), 'utf8')) : {}
const selectedEnv = { ...localEnv, ...process.env }
const env = { ...selectedEnv, PORT: '4041', AUTH_PUBLIC_ORIGIN: selectedEnv.AUTH_PUBLIC_ORIGIN ?? 'http://localhost:4040' }
const children = [
  spawn(process.execPath, [path.join(root, 'node_modules/webpack-cli/bin/cli.js'), 'serve', '--mode', 'development'], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  }),
  spawn(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'watch', 'server/index.ts'], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  }),
]
let stopping = false
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exitCode = code
}
for (const child of children) {
  child.on('error', () => stop(1))
  child.on('exit', (code) => stop(code ?? 1))
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
