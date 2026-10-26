import { randomUUID } from 'node:crypto'
import type { ErrorRequestHandler, RequestHandler, Response } from 'express'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/

/** Gives every request an id, echoed in the `X-Request-Id` header and in error bodies, so one failure can be traced. */
export const requestId: RequestHandler = (request, response, next) => {
  const supplied = request.get('x-request-id')
  const id = supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID()
  response.locals.requestId = id
  response.setHeader('X-Request-Id', id)
  next()
}

/** The one error body every route uses: a stable code, a plain-language message and the request id for the server log. */
export const sendProblem = (response: Response, status: number, code: string, message: string): void => {
  response.status(status).json({ code, message, requestId: String(response.locals.requestId ?? '') })
}

const errorStatus = (error: unknown): number => {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
  return status === 413 || status === 400 ? status : 500
}

const errorMessage = (status: number): string => {
  if (status === 413) return 'The request is too large.'
  if (status === 400) return 'The request body is invalid.'
  return 'The study library could not complete that request.'
}

/** The last handler: a stable error body with no stack, SQL, path or provider detail. Diagnostics go to the server log only. */
export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const status = errorStatus(error)
  const requestId = String(response.locals.requestId ?? '')
  if (status === 500) {
    const detail = error instanceof Error ? { name: error.name, code: (error as NodeJS.ErrnoException).code } : {}
    process.stderr.write(
      `${JSON.stringify({ level: 'error', requestId, method: request.method, path: request.path, ...detail })}\n`,
    )
  }
  if (response.headersSent) {
    response.end()
    return
  }
  response.status(status).json({ code: 'REQUEST_FAILED', message: errorMessage(status), requestId })
}
