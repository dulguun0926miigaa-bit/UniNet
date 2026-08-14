import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { prisma } from './lib/prisma.js'
import { authRouter } from './auth/auth.routes.js'
import { surveyRouter } from './surveys/survey.routes.js'
import { studentRouter } from './student/student.routes.js'
import { operationsRouter } from './operations/operations.routes.js'
import { workflowRouter } from './operations/workflow.routes.js'
import { settingsRouter } from './settings/settings.routes.js'
import { publicRouter } from './public/public.routes.js'
import { createHealthRouter } from './health/health.routes.js'
import { accessLogMiddleware, requestIdMiddleware } from './middleware/request-context.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { AppError } from './utils/app-error.js'
import { membershipRouter } from './memberships/membership.routes.js'
import { openApiRouter } from './openapi/openapi.routes.js'
import { privacyRouter } from './privacy/privacy.routes.js'
import { notificationRouter } from './notifications/notification.routes.js'
import { checkRedis, redisClient } from './lib/redis.js'
import { fileRouter } from './files/file.routes.js'
import { universityRouter } from './universities/university.routes.js'
import { paymentRouter } from './payments/payment.routes.js'
import { globalApiLimiter } from './middleware/rate-limits.js'
import { sqlInjectionGuard } from './middleware/sql-injection-guard.js'

export const app = express()

app.disable('x-powered-by')
if (env.trustProxy !== false) app.set('trust proxy', env.trustProxy)
app.set('query parser', 'simple')
app.use(requestIdMiddleware)
app.use(accessLogMiddleware)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  strictTransportSecurity: env.NODE_ENV === 'production'
    ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
    : false,
  referrerPolicy: { policy: 'no-referrer' },
}))
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  next()
})
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true)
    callback(new AppError('Энэ origin-оос хандахыг зөвшөөрөөгүй.', 403, 'CORS_ORIGIN_DENIED'))
  },
  credentials: true,
}))
app.use(express.json({ limit: '100kb', strict: true, inflate: false, verify(req, _res, buffer) {
  const request = /** @type {import('express').Request & { rawBody?: Buffer }} */ (req)
  if (request.originalUrl?.startsWith('/api/payments/stripe/webhook')) request.rawBody = Buffer.from(buffer)
} }))
app.use(express.urlencoded({ limit: '100kb', extended: false, parameterLimit: 100, inflate: false }))
app.use(cookieParser())
app.use('/api', sqlInjectionGuard)
app.use('/api', globalApiLimiter)

app.use(createHealthRouter({ database: prisma, cacheCheck: redisClient ? checkRedis : null }))
app.use('/api', openApiRouter)
app.use('/api/public', publicRouter)
app.use('/api/privacy', privacyRouter)
app.use('/api/auth', authRouter)
app.use('/api/surveys', surveyRouter) // Database-backed Staff and Student surveys.
app.use('/api/student', studentRouter)
app.use('/api/payments', paymentRouter)
app.use('/api/operations', workflowRouter)
app.use('/api/operations', operationsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/memberships', membershipRouter)
app.use('/api/universities', universityRouter)
app.use('/api/notifications', notificationRouter)
app.use('/api/files', fileRouter)

app.use(notFoundHandler)
app.use(errorHandler)
