import path from 'node:path'
export function isPublicLibraryPath(relativePath: string, ignored: ReadonlySet<string>): boolean {
  if (relativePath.includes('\0') || path.isAbsolute(relativePath)) return false
  const parts = relativePath.replace(/\\/g, '/').split('/')
  return (
    parts.length > 0 &&
    parts.every(
      (part) =>
        Boolean(part) && part !== '.' && part !== '..' && !part.startsWith('.') && !ignored.has(part) && !part.includes(':'),
    )
  )
}
export function isContained(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)
}
// Resolves a request path under an already-resolved root, or null if it would leave it. Unlike a `root + path.sep`
// prefix test, this also works when the root is a drive root such as G:\, whose resolved form already ends in a separator.
export function resolveWithinRoot(root: string, filePath: string): string | null {
  const absolutePath = path.resolve(root, path.normalize(filePath))
  return absolutePath === root || isContained(root, absolutePath) ? absolutePath : null
}
