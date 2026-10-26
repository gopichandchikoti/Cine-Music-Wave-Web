import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAuthConfig, type AuthConfig } from '../auth/config.js'
import { resolveMediaRoot, type MediaRoot } from '../watch/root.js'

export type ServerConfig = {
  production: boolean
  appDirectory: string
  staticDirectory: string
  port: number
  host: string
  accounts: AuthConfig
  media: MediaRoot
  personalDatabasePath: string
  watch: { catalogDirectory: string; maxStreams: number; pregeneratePreviews: boolean; encoder: 'x264' | 'amf' }
  trustProxy: string | undefined
}

/** Folders the media scan never enters. The app's own folder name is added at run time. */
export const IGNORED_DIRECTORIES = [
  '.git',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'Music',
  'Music Library.musiclibrary',
  '$RECYCLE.BIN',
  'System Volume Information',
] as const

/** Reads every environment setting once, so the rest of the server never touches `process.env`. */
export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const accounts = loadAuthConfig(env)
  if (accounts.mode !== 'accounts') throw new Error('Cine Music Wave requires personal accounts.')
  const production = accounts.production
  return {
    production,
    appDirectory,
    staticDirectory: path.join(appDirectory, 'dist'),
    port: Number(env.PORT ?? (production ? 4040 : 4041)),
    host: env.ENTERTAINMENT_SERVER_HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    accounts,
    media: resolveMediaRoot(env, appDirectory),
    personalDatabasePath: path.resolve(env.PERSONAL_DB_PATH ?? path.join(appDirectory, 'data', 'cine-music-wave.sqlite')),
    watch: {
      catalogDirectory: path.resolve(env.WATCH_CATALOG_DIR ?? path.join(appDirectory, 'data', 'watch-catalog')),
      maxStreams: Math.max(1, Math.min(8, Number(env.WATCH_MAX_STREAMS) || 3)),
      pregeneratePreviews: env.WATCH_PREVIEWS !== 'lazy',
      encoder: env.WATCH_ENCODER === 'amf' ? 'amf' : 'x264',
    },
    trustProxy: env.AUTH_TRUST_PROXY,
  }
}
