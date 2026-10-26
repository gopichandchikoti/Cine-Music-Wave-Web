import { constants } from 'node:zlib'
import compression from 'compression'
import type { RequestHandler } from 'express'

const MIN_BYTES = 1024
const BROTLI_QUALITY = 4

/**
 * gzip/brotli for JSON and text responses. Range requests are never compressed, because a `Content-Range` describes the
 * stored bytes and would no longer match. Built assets are precompressed at build time instead (see static-assets).
 */
export const responseCompression: RequestHandler = compression({
  threshold: MIN_BYTES,
  brotli: { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } },
  filter: (request, response) => (request.headers.range ? false : compression.filter(request, response)),
})
