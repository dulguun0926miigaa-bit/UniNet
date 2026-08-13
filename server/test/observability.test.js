import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createLogger, redactLogData } from '../src/observability/logger.js'
import {
  createAccessLogMiddleware,
  createRequestIdMiddleware,
} from '../src/middleware/request-context.js'

function loggerDouble() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

describe('structured logging and request context', () => {
  it('redacts credentials, tokens, cookies, direct PII, and URL query values', () => {
    const input = {
      authorization: 'Bearer private-access-token',
      password: 'CorrectHorseBatteryStaple!',
      profile: { email: 'student@example.com', phone: '99112233' },
      callbackUrl: 'https://example.com/callback?token=secret&email=student@example.com',
      safe: 'visible',
    }

    const output = redactLogData(input)

    expect(JSON.stringify(output)).not.toContain('private-access-token')
    expect(JSON.stringify(output)).not.toContain('CorrectHorseBatteryStaple!')
    expect(JSON.stringify(output)).not.toContain('student@example.com')
    expect(output).toMatchObject({
      authorization: '[REDACTED]',
      password: '[REDACTED]',
      profile: { email: '[REDACTED]', phone: '[REDACTED]' },
      callbackUrl: 'https://example.com/callback',
      safe: 'visible',
    })
    expect(input.password).toBe('CorrectHorseBatteryStaple!')
  })

  it('emits one JSON record with stable collector-friendly fields', () => {
    const lines = []
    const logger = createLogger({
      write: (line) => lines.push(line),
      service: 'test-api',
      environment: 'test',
      now: () => new Date('2026-07-27T00:00:00.000Z'),
    })

    logger.info('test.completed', { requestId: 'request-1', refreshToken: 'never-log-me' })

    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toEqual({
      timestamp: '2026-07-27T00:00:00.000Z',
      level: 'info',
      service: 'test-api',
      environment: 'test',
      event: 'test.completed',
      requestId: 'request-1',
      refreshToken: '[REDACTED]',
    })
  })

  it('keeps safe Prisma error metadata while redacting sensitive metadata', () => {
    const error = Object.assign(new Error('query details must not be logged'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2022',
      meta: {
        modelName: 'EventRegistration',
        column: 'EventRegistration.ticketTokenHash',
        accessToken: 'never-log-this',
      },
    })

    expect(redactLogData(error)).toEqual({
      name: 'PrismaClientKnownRequestError',
      code: 'P2022',
      meta: {
        modelName: 'EventRegistration',
        column: 'EventRegistration.ticketTokenHash',
        accessToken: '[REDACTED]',
      },
    })
  })

  it('returns a correlation header and logs route, actor, tenant, status, and latency', async () => {
    const logger = loggerDouble()
    const ticks = [1_000_000_000n, 1_012_345_000n]
    const app = express()
    app.use(createRequestIdMiddleware({ idFactory: () => 'generated-id' }))
    app.use(createAccessLogMiddleware({ logger, now: () => ticks.shift() }))
    app.get('/users/:id', (req, res) => {
      req.auth = { user: { id: 'actor-1', universityId: 'tenant-1' }, token: {} }
      res.json({ ok: true })
    })

    const response = await request(app)
      .get('/users/8ab4f955-5167-4367-97ff-7f5f4ecb391f?token=must-not-be-logged')
      .set('X-Request-Id', 'client-request-1')

    expect(response.headers['x-request-id']).toBe('client-request-1')
    expect(logger.info).toHaveBeenCalledWith('http.request.completed', {
      requestId: 'client-request-1',
      action: 'GET /users/:id',
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      http: {
        method: 'GET',
        route: '/users/:id',
        status: 200,
        durationMs: 12.345,
      },
    })
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('must-not-be-logged')
  })

  it('rejects an unsafe incoming request ID instead of reflecting it', async () => {
    const app = express()
    app.use(createRequestIdMiddleware({ idFactory: () => 'safe-generated-id' }))
    app.get('/', (req, res) => res.json({ requestId: req.requestId }))

    const response = await request(app).get('/').set('X-Request-Id', 'bad id with spaces')

    expect(response.headers['x-request-id']).toBe('safe-generated-id')
    expect(response.body.requestId).toBe('safe-generated-id')
  })
})
