import { PNG } from 'pngjs'
import { AuthError } from './types.js'
export function validateAvatar(input: Buffer, mime: string): Buffer {
  if (input.length > 512 * 1024) throw new AuthError(413, 'AVATAR_TOO_LARGE', 'Choose a PNG no larger than 512 KB.')
  if (
    mime !== 'image/png' ||
    input.length < 33 ||
    !input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    input.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw new AuthError(415, 'AVATAR_UNSUPPORTED', 'Choose a PNG image.')
  const width = input.readUInt32BE(16),
    height = input.readUInt32BE(20)
  if (width < 16 || height < 16 || width > 512 || height > 512 || width * height > 262144)
    throw new AuthError(400, 'AVATAR_DIMENSIONS', 'Use an image between 16 and 512 pixels in each dimension.')
  if (input[24] !== 8 || input[26] !== 0 || input[27] !== 0 || input[28] !== 0)
    throw new AuthError(415, 'AVATAR_UNSUPPORTED', 'Choose a non-interlaced 8-bit PNG.')
  let offset = 8,
    headers = 0,
    dataChunks = 0,
    ended = false,
    chunks = 0
  while (offset < input.length) {
    if (++chunks > 4096 || offset + 12 > input.length)
      throw new AuthError(400, 'AVATAR_INVALID', 'The PNG image could not be read.')
    const length = input.readUInt32BE(offset),
      type = input.toString('ascii', offset + 4, offset + 8)
    if (length > input.length - offset - 12 || ended)
      throw new AuthError(400, 'AVATAR_INVALID', 'The PNG image could not be read.')
    if (type === 'IHDR' && (++headers !== 1 || offset !== 8 || length !== 13))
      throw new AuthError(400, 'AVATAR_INVALID', 'The PNG image could not be read.')
    if (type === 'IDAT') dataChunks++
    if (type === 'IEND') {
      if (length !== 0) throw new AuthError(400, 'AVATAR_INVALID', 'The PNG image could not be read.')
      ended = true
    }
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw new AuthError(415, 'AVATAR_UNSUPPORTED', 'Choose a static PNG image.')
    offset += length + 12
  }
  if (headers !== 1 || dataChunks < 1 || !ended) throw new AuthError(400, 'AVATAR_INVALID', 'The PNG image could not be read.')
  try {
    const png = PNG.sync.read(input, { checkCRC: true })
    if (png.width !== width || png.height !== height || png.data.length !== width * height * 4) throw Error('dimensions')
    return PNG.sync.write(png, { colorType: 6 })
  } catch {
    throw new AuthError(400, 'AVATAR_INVALID', 'The PNG image could not be read.')
  }
}
