import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApiLimiter, registrationAccountLimiter, searchReadLimiter } from '../src/middleware/rate-limits.js'

describe('API mutation rate limiting', () => {
  it('returns a consistent correlated 429 envelope after the configured limit', async () => {
    const app = express()
    app.use((req, _res, next) => { req.requestId = 'rate-test-request'; next() })
    app.post('/mutate', createApiLimiter({
      windowMs: 60_000,
      limit: 2,
      code: 'TEST_RATE_LIMITED',
      message: 'Too many test requests.',
    }), (_req, res) => res.json({ ok: true }))

    expect((await request(app).post('/mutate')).status).toBe(200)
    expect((await request(app).post('/mutate')).status).toBe(200)
    const limited = await request(app).post('/mutate')

    expect(limited.status).toBe(429)
    expect(limited.body.error).toEqual({
      code: 'TEST_RATE_LIMITED',
      message: 'Too many test requests.',
      requestId: 'rate-test-request',
    })
    expect(limited.headers['ratelimit-policy']).toBeTruthy()
  })

  it('does not count successful authentication responses as failed attempts', async () => {
    const app = express()
    app.use(express.json())
    const limiter = createApiLimiter({
      windowMs: 60_000,
      limit: 2,
      code: 'AUTH_TEST_RATE_LIMITED',
      message: 'Too many failed authentication attempts.',
      skipSuccessfulRequests: true,
    })
    app.post('/login', limiter, (req, res) => res.status(req.body.fail ? 401 : 200).json({ ok: !req.body.fail }))

    for (let index = 0; index < 5; index += 1) {
      expect((await request(app).post('/login').send({ fail: false })).status).toBe(200)
    }
    expect((await request(app).post('/login').send({ fail: true })).status).toBe(401)
    expect((await request(app).post('/login').send({ fail: true })).status).toBe(401)
    expect((await request(app).post('/login').send({ fail: true })).status).toBe(429)
  })

  it('limits repeated registration attempts for the same normalized email', async () => {
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => { req.requestId = 'registration-rate-test'; next() })
    app.post('/register', registrationAccountLimiter, (_req, res) => res.status(201).json({ ok: true }))

    const email = `rate-${Date.now()}@num.edu.mn`
    for (let index = 0; index < 5; index += 1) {
      expect((await request(app).post('/register').send({ email: index % 2 ? email.toUpperCase() : email })).status).toBe(201)
    }
    const limited = await request(app).post('/register').send({ email })

    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('REGISTRATION_ACCOUNT_RATE_LIMITED')
    expect(limited.body.error.requestId).toBe('registration-rate-test')
  })

  it('applies the dedicated limiter only when a search query is present', async () => {
    const app = express()
    app.use((req, _res, next) => { req.requestId = 'search-rate-test'; next() })
    app.get('/items', searchReadLimiter, (_req, res) => res.json({ ok: true }))

    for (let index = 0; index < 65; index += 1) {
      expect((await request(app).get('/items')).status).toBe(200)
    }
    for (let index = 0; index < 60; index += 1) {
      expect((await request(app).get('/items?search=survey')).status).toBe(200)
    }
    const limited = await request(app).get('/items?search=survey')
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('SEARCH_RATE_LIMITED')
  })

})
