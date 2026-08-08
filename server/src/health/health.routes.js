import { Router } from 'express'
import { logger as defaultLogger } from '../observability/logger.js'

const readinessTimeoutMs = 2_000

async function withTimeout(operation, timeoutMs) {
  let timeout
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Readiness check timed out')), timeoutMs)
        timeout.unref?.()
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

export function createHealthRouter({ database, cacheCheck = null, logger = defaultLogger, timeoutMs = readinessTimeoutMs }) {
  const router = Router()

  function live(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ status: 'ok', requestId: req.requestId || null })
  }

  async function ready(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    let dependency = 'database'
    try {
      await withTimeout(database.university.findFirst({ select: { id: true } }), timeoutMs)
      const checks = { database: 'up' }
      if (cacheCheck) {
        dependency = 'redis'
        await withTimeout(cacheCheck(), timeoutMs)
        checks.redis = 'up'
      }
      res.json({
        status: 'ready',
        checks,
        requestId: req.requestId || null,
      })
    } catch (error) {
      logger.warn('health.readiness.failed', {
        requestId: req.requestId,
        dependency,
        error,
      })
      res.status(503).json({
        status: 'not_ready',
        checks: { database: dependency === 'database' ? 'down' : 'up', ...(dependency === 'redis' ? { redis: 'down' } : {}) },
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Database ашиглах боломжгүй байна.',
          requestId: req.requestId || null,
        },
      })
    }
  }

  router.get(['/live', '/api/live', '/api/health'], live)
  router.get(['/ready', '/api/ready'], ready)
  return router
}
