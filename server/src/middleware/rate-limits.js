import { createHash } from 'node:crypto'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { createRedisRateLimitStore } from '../lib/redis.js'

const ipKey = req => `ip:${ipKeyGenerator(req.ip || 'unknown')}`
const authenticatedOrIpKey = req => req.auth?.user?.id ? `user:${req.auth.user.id}` : ipKey(req)
const accountOrIpKey = req => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!email) return ipKey(req)
  return `account:${createHash('sha256').update(email).digest('hex')}`
}

const challengeOrIpKey = req => {
  const token = typeof req.body?.challengeToken === 'string' ? req.body.challengeToken.trim() : ''
  if (!token) return ipKey(req)
  return `challenge:${createHash('sha256').update(token).digest('hex')}`
}

export function createApiLimiter({ limit, windowMs, code, message, skip = () => false, keyGenerator = authenticatedOrIpKey }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    keyGenerator,
    store: createRedisRateLimitStore(code.toLowerCase()),
    passOnStoreError: false,
    handler(req, res) {
      res.status(429).json({
        error: {
          code,
          message,
          requestId: req.requestId ?? null,
        },
      })
    },
  })
}

const fifteenMinutes = 15 * 60 * 1000
const oneHour = 60 * 60 * 1000


export const globalApiLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 600,
  code: 'API_RATE_LIMITED',
  message: 'API хүсэлт хэт олон байна. Түр хүлээгээд дахин оролдоно уу.',
  keyGenerator: ipKey,
})

export const registrationIpLimiter = createApiLimiter({
  windowMs: oneHour,
  limit: 20,
  code: 'REGISTRATION_IP_RATE_LIMITED',
  message: 'Энэ сүлжээнээс хэт олон бүртгэлийн хүсэлт ирлээ. Нэг цагийн дараа дахин оролдоно уу.',
  keyGenerator: ipKey,
})

export const registrationAccountLimiter = createApiLimiter({
  windowMs: oneHour,
  limit: 5,
  code: 'REGISTRATION_ACCOUNT_RATE_LIMITED',
  message: 'Энэ имэйлээр хэт олон бүртгэлийн оролдлого хийсэн байна. Нэг цагийн дараа дахин оролдоно уу.',
  keyGenerator: accountOrIpKey,
})

export const authIpLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 60,
  code: 'AUTH_IP_RATE_LIMITED',
  message: 'Энэ сүлжээнээс хэт олон authentication хүсэлт ирлээ. Түр хүлээнэ үү.',
  keyGenerator: ipKey,
})

export const authAccountLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 10,
  code: 'AUTH_ACCOUNT_RATE_LIMITED',
  message: 'Энэ account-д хэт олон authentication хүсэлт ирлээ. Түр хүлээнэ үү.',
  keyGenerator: accountOrIpKey,
})


export const authChallengeLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 8,
  code: 'AUTH_CHALLENGE_RATE_LIMITED',
  message: 'Энэ Authenticator challenge дээр хэт олон оролдлого хийсэн байна. Түр хүлээнэ үү.',
  keyGenerator: challengeOrIpKey,
})

export const studentMutationLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 60,
  code: 'STUDENT_ACTION_RATE_LIMITED',
  message: 'Олон үйлдэл дараалан хийсэн байна. Түр хүлээгээд дахин оролдоно уу.',
})

export const surveySubmissionLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 20,
  code: 'SURVEY_SUBMISSION_RATE_LIMITED',
  message: 'Судалгааны хүсэлт хэт олон байна. Түр хүлээнэ үү.',
})

export const operationsMutationLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 120,
  code: 'OPERATIONS_RATE_LIMITED',
  message: 'Удирдлагын хүсэлт хэт олон байна. Түр хүлээнэ үү.',
  skip: req => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
})


export const searchReadLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 60,
  code: 'SEARCH_RATE_LIMITED',
  message: 'Хайлтын хүсэлт хэт олон байна. Түр хүлээгээд дахин оролдоно уу.',
  skip: req => typeof req.query?.search !== 'string' || req.query.search.trim().length === 0,
})

export const sensitiveReadLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 20,
  code: 'SENSITIVE_READ_RATE_LIMITED',
  message: 'Экспорт/тайлангийн хүсэлт хэт олон байна. Түр хүлээнэ үү.',
})

export const supportMutationLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 20,
  code: 'SUPPORT_RATE_LIMITED',
  message: 'Хүсэлт хэт олон байна. Түр хүлээгээд дахин оролдоно уу.',
})

export const fileUploadLimiter = createApiLimiter({
  windowMs: fifteenMinutes,
  limit: 12,
  code: 'FILE_UPLOAD_RATE_LIMITED',
  message: 'Файл оруулах хүсэлт хэт олон байна. Түр хүлээгээд дахин оролдоно уу.',
})
