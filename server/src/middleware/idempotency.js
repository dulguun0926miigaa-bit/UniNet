import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../utils/app-error.js'

const keyPattern = /^[A-Za-z0-9._:-]{16,128}$/
const retentionMilliseconds = 24 * 60 * 60 * 1000

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

export function requestFingerprint({ method, path, body }) {
  return createHash('sha256')
    .update(JSON.stringify({ method: method.toUpperCase(), path, body: stableValue(body ?? null) }))
    .digest('hex')
}

export function parseIdempotencyKey(value) {
  if (typeof value !== 'string' || !keyPattern.test(value)) {
    throw new AppError('Idempotency-Key нь 16–128 тэмдэгттэй аюулгүй identifier байх ёстой.', 400, 'IDEMPOTENCY_KEY_INVALID')
  }
  return value
}

/**
 * Persists successful JSON responses for duplicate-sensitive authenticated
 * mutations. Reusing a key with a different request is always rejected.
 */
export async function requireIdempotency(req, res, next) {
  try {
    const userId = req.auth?.user?.id
    if (!userId) throw new AppError('Idempotency хамгаалалт authentication шаардана.', 401, 'AUTH_REQUIRED')
    const key = parseIdempotencyKey(req.get('idempotency-key'))
    const method = req.method.toUpperCase()
    const path = req.originalUrl.split('?')[0]
    const requestHash = requestFingerprint({ method, path, body: req.body })
    const identity = { userId_key_method_path: { userId, key, method, path } }
    let record
    try {
      record = await prisma.idempotencyRecord.create({
        data: {
          userId,
          key,
          method,
          path,
          requestHash,
          expiresAt: new Date(Date.now() + retentionMilliseconds),
        },
      })
    } catch (error) {
      const isDuplicate = error && typeof error === 'object' && 'code' in error && error.code === 'P2002'
      if (!isDuplicate) throw error
      const existing = await prisma.idempotencyRecord.findUnique({ where: identity })
      if (!existing) throw new AppError('Idempotency хүсэлт зэрэг өөрчлөгдлөө. Дахин оролдоно уу.', 409, 'IDEMPOTENCY_RACE')
      if (existing.expiresAt <= new Date()) {
        await prisma.idempotencyRecord.deleteMany({ where: { id: existing.id, expiresAt: { lte: new Date() } } })
        return requireIdempotency(req, res, next)
      }
      if (existing.requestHash !== requestHash) {
        throw new AppError('Энэ Idempotency-Key өөр хүсэлтэд өмнө нь ашиглагдсан байна.', 409, 'IDEMPOTENCY_KEY_REUSED')
      }
      if (existing.state === 'COMPLETED' && existing.responseStatus && existing.responseBody != null) {
        res.setHeader('Idempotency-Replayed', 'true')
        res.setHeader('Cache-Control', 'no-store')
        return res.status(existing.responseStatus).json(existing.responseBody)
      }
      throw new AppError('Ижил хүсэлт боловсруулагдаж байна. Түр хүлээгээд дахин оролдоно уу.', 409, 'IDEMPOTENCY_IN_PROGRESS')
    }

    const originalJson = res.json.bind(res)
    res.json = body => {
      res.json = originalJson
      if (res.statusCode < 200 || res.statusCode >= 400) {
        void prisma.idempotencyRecord.deleteMany({ where: { id: record.id, state: 'IN_PROGRESS' } })
        return originalJson(body)
      }
      void prisma.idempotencyRecord.update({
        where: { id: record.id },
        data: { state: 'COMPLETED', responseStatus: res.statusCode, responseBody: body },
      }).then(() => originalJson(body)).catch(next)
      return res
    }
    return next()
  } catch (error) {
    return next(error)
  }
}
