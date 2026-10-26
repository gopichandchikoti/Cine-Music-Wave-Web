/** Reads a browser-local value. Storage can be missing or blocked (private windows, site settings), so failure means "nothing saved". */
export const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Saves a browser-local value. A refused write only means the value will not survive a reload. */
export const writeStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage is full or blocked; the app keeps working with what is in memory.
  }
}

export const readStoredSet = (key: string): Set<string> => {
  try {
    const value: unknown = JSON.parse(readStorage(key) ?? '[]')
    return Array.isArray(value) ? new Set(value.filter((item): item is string => typeof item === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export const writeStoredSet = (key: string, value: ReadonlySet<string>): void => {
  writeStorage(key, JSON.stringify([...value]))
}
