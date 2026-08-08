import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createHealthRouter } from '../src/health/health.routes.js'
import { createRequestIdMiddleware } from '../src/middleware/request-context.js'

function healthApp(database, logger = { warn: vi.fn() }, timeoutMs = 100) {
  const app = express()
  app.use(createRequestIdMiddleware({ idFactory: () => 'health-request-id' }))
  app.use(createHealthRouter({ database, logger, timeoutMs }))
  return app
}

describe('liveness and readiness', () => {
  it('reports liveness without querying dependencies', async () => {
    const database = { university: { findFirst: vi.fn() } }
    const response = await request(healthApp(database)).get('/live')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', requestId: 'health-request-id' })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(database.university.findFirst).not.toHaveBeenCalled()
  })

  it('reports ready only after a successful database probe', async () => {
    const database = { university: { findFirst: vi.fn().mockResolvedValue({ id: 'university-1' }) } }
    const response = await request(healthApp(database)).get('/ready')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'ready',
      checks: { database: 'up' },
      requestId: 'health-request-id',
    })
    expect(database.university.findFirst).toHaveBeenCalledWith({ select: { id: true } })
  })

  it('fails closed with 503 when the database is unavailable', async () => {
    const logger = { warn: vi.fn() }
    const database = { university: { findFirst: vi.fn().mockRejectedValue(new Error('contains connection credentials')) } }
    const response = await request(healthApp(database, logger)).get('/api/ready')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      status: 'not_ready',
      checks: { database: 'down' },
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Database ашиглах боломжгүй байна.',
        requestId: 'health-request-id',
      },
    })
    expect(response.text).not.toContain('connection credentials')
    expect(logger.warn).toHaveBeenCalledOnce()
  })

  it('fails readiness within its configured timeout', async () => {
    const database = { university: { findFirst: vi.fn(() => new Promise(() => {})) } }
    const response = await request(healthApp(database, { warn: vi.fn() }, 5)).get('/ready')

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('DEPENDENCY_UNAVAILABLE')
  })
})
