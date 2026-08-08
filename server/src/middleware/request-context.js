import { randomUUID } from 'node:crypto'
import { logger as defaultLogger } from '../observability/logger.js'

export const REQUEST_ID_HEADER = 'X-Request-Id'
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export function normalizeRequestId(value) {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
  return requestIdPattern.test(candidate) ? candidate : null
}

export function createRequestIdMiddleware({ idFactory = randomUUID } = {}) {
  return function requestIdMiddleware(req, res, next) {
    req.requestId = normalizeRequestId(req.get('x-request-id')) || idFactory()
    res.setHeader(REQUEST_ID_HEADER, req.requestId)
    next()
  }
}

function safeRoute(req) {
  const routePath = req.route?.path
  if (typeof routePath === 'string') return `${req.baseUrl || ''}${routePath}`

  return req.path
    .split('/')
    .map((segment) => {
      if (segment.includes('@')) return ':redacted'
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id'
      if (segment.length > 64) return ':redacted'
      return segment
    })
    .join('/')
}

export function createAccessLogMiddleware({ logger = defaultLogger, now = process.hrtime.bigint } = {}) {
  return function accessLogMiddleware(req, res, next) {
    const startedAt = now()
    let completed = false

    function logRequest(closedEarly = false) {
      if (completed) return
      completed = true
      const durationMs = Number(now() - startedAt) / 1_000_000
      const status = closedEarly && !res.writableEnded ? 499 : res.statusCode
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
      const user = req.auth?.user
      const route = safeRoute(req)

      logger[level]('http.request.completed', {
        requestId: req.requestId,
        action: `${req.method} ${route}`,
        actorId: user?.id || null,
        tenantId: user?.universityId || null,
        http: {
          method: req.method,
          route,
          status,
          durationMs: Number(durationMs.toFixed(3)),
        },
      })
    }

    res.once('finish', () => logRequest(false))
    res.once('close', () => logRequest(true))
    next()
  }
}

export const requestIdMiddleware = createRequestIdMiddleware()
export const accessLogMiddleware = createAccessLogMiddleware()

