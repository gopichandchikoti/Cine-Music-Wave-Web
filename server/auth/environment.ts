import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
const filename = new URL('../../.env', import.meta.url)
if (existsSync(filename)) {
  const values = parseEnv(readFileSync(filename, 'utf8'))
  for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value
}
