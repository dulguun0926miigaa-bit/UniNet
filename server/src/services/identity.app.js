import { createServiceApp } from './create-service-app.js'
import { prisma } from '../lib/prisma.js'
import { checkRedis, redisClient } from '../lib/redis.js'
import { createHealthRouter } from '../health/health.routes.js'
import { privacyRouter } from '../privacy/privacy.routes.js'
import { authRouter } from '../auth/auth.routes.js'
import { notificationRouter } from '../notifications/notification.routes.js'

export const identityApp = createServiceApp({
  serviceName: 'identity-service',
  registerRoutes(app) {
    app.use(createHealthRouter({ database: prisma, cacheCheck: redisClient ? checkRedis : null }))
    app.use('/api/privacy', privacyRouter)
    app.use('/api/auth', authRouter)
    app.use('/api/notifications', notificationRouter)
  },
})
