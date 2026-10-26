// Writes a .br and a .gz twin next to every compressible file in dist/. The server sends the twin when the browser
// accepts it, so assets cost no CPU at request time and are compressed at the highest level.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompress, constants, gzip } from 'node:zlib'
import { promisify } from 'node:util'

const brotli = promisify(brotliCompress)
const deflate = promisify(gzip)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.webmanifest'])
const MIN_BYTES = 512

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)])),
  )
  return nested.flat()
}

const files = (await walk(root)).filter((file) => COMPRESSIBLE.has(path.extname(file)))
let before = 0
let brotliTotal = 0
let written = 0

for (const file of files) {
  const source = await readFile(file)
  if (source.length < MIN_BYTES) continue
  const [encodedBrotli, encodedGzip] = await Promise.all([
    brotli(source, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
      },
    }),
    deflate(source, { level: 9 }),
  ])
  before += source.length
  brotliTotal += Math.min(encodedBrotli.length, source.length)
  if (encodedBrotli.length < source.length) {
    await writeFile(`${file}.br`, encodedBrotli)
    written += 1
  }
  if (encodedGzip.length < source.length) {
    await writeFile(`${file}.gz`, encodedGzip)
    written += 1
  }
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`
console.log(
  `precompress: ${files.length} files scanned, ${written} twins written, ${kib(before)} -> ${kib(brotliTotal)} with brotli`,
)
