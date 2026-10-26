import { realpathSync } from 'node:fs'
import path from 'node:path'
import { isContained } from '../auth/file-policy.js'

// The media folder is the only place on this computer the app reads video and music from. On Windows it must be on one drive
// (G: unless WATCH_ALLOWED_DRIVE says otherwise), so a mistyped setting can never expose Desktop, Documents or another disk.

export type MediaRoot = {
  root: string
  /** The one drive letter media may come from (Windows), or null where there are no drive letters. */
  allowedDrive: string | null
  /** Set when the configured folder is not allowed; the media routes then refuse every request. */
  refusal: string | null
}

const driveLetter = (value: string): string | null => /^([A-Za-z]):/.exec(value)?.[1]?.toUpperCase() ?? null

export function resolveMediaRoot(
  env: NodeJS.ProcessEnv,
  appDirectory: string,
  platform: NodeJS.Platform = process.platform,
): MediaRoot {
  const configured = env.WATCH_MEDIA_DIR?.trim()
  if (platform !== 'win32')
    return { root: path.resolve(configured || path.join(appDirectory, 'data', 'watch')), allowedDrive: null, refusal: null }
  const allowedDrive = (env.WATCH_ALLOWED_DRIVE ?? 'G').trim().replace(/:.*$/, '').toUpperCase() || 'G'
  const root = path.win32.resolve(configured || `${allowedDrive}:\\`)
  const drive = driveLetter(root)
  const refusal =
    drive === allowedDrive
      ? null
      : `Media must live on drive ${allowedDrive}:, but WATCH_MEDIA_DIR points to ${root}. Move the media to ${allowedDrive}: and set WATCH_MEDIA_DIR to a folder there.`
  return { root, allowedDrive, refusal }
}

/**
 * The real location of `target` if, after following every shortcut, link and junction, it is still inside `root` and on the allowed
 * drive; otherwise null. A name that looks like it is inside the media folder can still lead somewhere else.
 */
export function confinedRealPath(root: string, target: string, allowedDrive: string | null): string | null {
  try {
    const realRoot = realpathSync.native(root)
    const real = realpathSync.native(target)
    if (allowedDrive && driveLetter(real) !== allowedDrive) return null
    return real === realRoot || isContained(realRoot, real) ? real : null
  } catch {
    return null
  }
}
