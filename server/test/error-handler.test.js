import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createErrorHandler, errorHandler, normalizeHttpError, notFoundHandler } from '../src/middleware/error-handler.js'
import { createRequestIdMiddleware } from '../src/middleware/request-context.js'

function errorTestApp() {
  const app = express()
  app.use(createRequestIdMiddleware({ idFactory: () => 'error-request-id' }))
  app.use(express.json({ limit: '1kb', strict: true, inflate: false }))
  app.post('/echo', (req, res) => res.json(req.body))
  app.get('/unexpected', () => { throw new Error('database password was leaked here') })
  app.get('/duplicate', () => { throw Object.assign(new Error('duplicate detail'), { code: 'P2002' }) })
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

describe('consistent API error envelope', () => {
  it('maps aborted and unsupported-encoding parser failures', () => {
    expect(normalizeHttpError({ type: 'request.aborted' })).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
    })
    expect(normalizeHttpError({ type: 'encoding.unsupported' })).toMatchObject({
      status: 415,
      code: 'UNSUPPORTED_CONTENT_ENCODING',
    })
  })

  it('maps invalid JSON without returning parser internals', async () => {
    const response = await request(errorTestApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"broken"')

    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject({
      code: 'INVALID_JSON',
      requestId: 'error-request-id',
    })
    expect(response.text).not.toContain('SyntaxError')
  })

  it('maps an oversized request body to 413', async () => {
    const response = await request(errorTestApp())
      .post('/echo')
      .send({ content: 'a'.repeat(2_000) })

    expect(response.status).toBe(413)
    expect(response.body.error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      requestId: 'error-request-id',
    })
  })

  it('maps database duplicate errors consistently', async () => {
    const response = await request(errorTestApp()).get('/duplicate')

    expect(response.status).toBe(409)
    expect(response.body.error).toMatchObject({ code: 'CONFLICT', requestId: 'error-request-id' })
    expect(response.text).not.toContain('duplicate detail')
  })

  it('returns generic 500 details and a JSON 404 envelope', async () => {
    const unexpected = await request(errorTestApp()).get('/unexpected')
    const missing = await request(errorTestApp()).get('/not-a-route')

    expect(unexpected.status).toBe(500)
    expect(unexpected.body.error).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      requestId: 'error-request-id',
    })
    expect(unexpected.text).not.toContain('database password')
    expect(missing.status).toBe(404)
    expect(missing.body.error).toMatchObject({ code: 'ROUTE_NOT_FOUND', requestId: 'error-request-id' })
  })

  it('logs the sanitized route action with the request ID for unexpected errors', async () => {
    const logger = { error: vi.fn() }
    const failure = Object.assign(new Error('missing database column'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2022',
      meta: { modelName: 'EventRegistration', column: 'EventRegistration.ticketTokenHash' },
    })
    const app = express()
    app.use(createRequestIdMiddleware({ idFactory: () => 'schema-request-id' }))
    app.get('/registrations/:id', () => { throw failure })
    app.use(createErrorHandler({ logger, logServerErrors: true }))

    await request(app).get('/registrations/8ab4f955-5167-4367-97ff-7f5f4ecb391f').expect(500)

    expect(logger.error).toHaveBeenCalledWith('http.request.failed', {
      requestId: 'schema-request-id',
      action: 'GET /registrations/:id',
      error: failure,
    })
  })
})
