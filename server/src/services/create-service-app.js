import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from '../config/env.js'
import { accessLogMiddleware, requestIdMiddleware } from '../middleware/request-context.js'
import { errorHandler, notFoundHandler } from '../middleware/error-handler.js'
import { globalApiLimiter } from '../middleware/rate-limits.js'
import { sqlInjectionGuard } from '../middleware/sql-injection-guard.js'

export function createServiceApp({ serviceName, registerRoutes }) {
  const app = express()
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
    res.setHeader('X-UniNet-Service', serviceName)
    next()
  })
  app.use(express.json({ limit: '100kb', strict: true, inflate: false, verify(req, _res, buffer) { if (req.originalUrl?.startsWith('/api/payments/stripe/webhook')) req.rawBody = Buffer.from(buffer) } }))
  app.use(express.urlencoded({ limit: '100kb', extended: false, parameterLimit: 100, inflate: false }))
  app.use(cookieParser())
  app.use('/api', sqlInjectionGuard)
  app.use('/api', globalApiLimiter)
  registerRoutes(app)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
