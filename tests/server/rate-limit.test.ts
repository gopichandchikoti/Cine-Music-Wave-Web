import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import { createRateLimiter } from '../../server/middlewares/rate-limit.js'

type Captured = { status: number | null; headers: Record<string, string>; body: unknown; passed: boolean }

const call = (limiter: ReturnType<typeof createRateLimiter>, ip: string, path = '/x'): Captured => {
  const captured: Captured = { status: null, headers: {}, body: null, passed: false }
  const request = { ip, path, socket: { remoteAddress: ip } } as unknown as Request
  const response = {
    setHeader: (name: string, value: string) => {
      captured.headers[name] = value
    },
    status(code: number) {
      captured.status = code
      return this
    },
    json(body: unknown) {
      captured.body = body
    },
  } as unknown as Response
  limiter(request, response, () => {
    captured.passed = true
  })
  return captured
}

test('requests pass until the limit, then get 429 with Retry-After', () => {
  let now = 1_000
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 3, now: () => now })
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = call(limiter, '10.0.0.1')
    assert.ok(result.passed, `request ${attempt} passes`)
    assert.equal(result.headers['RateLimit-Remaining'], String(3 - attempt))
  }
  const blocked = call(limiter, '10.0.0.1')
  assert.equal(blocked.passed, false)
  assert.equal(blocked.status, 429)
  assert.equal(blocked.headers['Retry-After'], '60')
  assert.deepEqual(blocked.body, { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' })
  now += 60_001
  assert.ok(call(limiter, '10.0.0.1').passed, 'a new window starts after the old one ends')
})

test('each client address has its own budget', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 1 })
  assert.ok(call(limiter, '10.0.0.1').passed)
  assert.equal(call(limiter, '10.0.0.1').status, 429)
  assert.ok(call(limiter, '10.0.0.2').passed)
})

test('skipped requests are not counted', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 1, skip: (request) => request.path === '/health' })
  for (let attempt = 0; attempt < 5; attempt += 1) assert.ok(call(limiter, '10.0.0.1', '/health').passed)
  assert.ok(call(limiter, '10.0.0.1').passed)
})

test('memory stays bounded: the oldest client is dropped when capacity is reached', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 1, capacity: 2 })
  call(limiter, 'a')
  call(limiter, 'b')
  call(limiter, 'c')
  assert.ok(call(limiter, 'a').passed, 'a was evicted, so it starts a fresh window')
  assert.equal(call(limiter, 'c').status, 429, 'c is still tracked')
})
