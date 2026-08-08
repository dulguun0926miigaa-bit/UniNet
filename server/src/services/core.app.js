import { createServiceApp } from './create-service-app.js'
import { prisma } from '../lib/prisma.js'
import { checkRedis, redisClient } from '../lib/redis.js'
import { createHealthRouter } from '../health/health.routes.js'
import { openApiRouter } from '../openapi/openapi.routes.js'
import { publicRouter } from '../public/public.routes.js'
import { surveyRouter } from '../surveys/survey.routes.js'
import { studentRouter } from '../student/student.routes.js'
import { workflowRouter } from '../operations/workflow.routes.js'
import { operationsRouter } from '../operations/operations.routes.js'
import { settingsRouter } from '../settings/settings.routes.js'
import { membershipRouter } from '../memberships/membership.routes.js'
import { universityRouter } from '../universities/university.routes.js'
import { fileRouter } from '../files/file.routes.js'
import { paymentRouter } from '../payments/payment.routes.js'

export const coreApp = createServiceApp({
  serviceName: 'core-service',
  registerRoutes(app) {
    app.use(createHealthRouter({ database: prisma, cacheCheck: redisClient ? checkRedis : null }))
    app.use('/api', openApiRouter)
    app.use('/api/public', publicRouter)
    app.use('/api/surveys', surveyRouter)
    app.use('/api/student', studentRouter)
    app.use('/api/payments', paymentRouter)
    app.use('/api/operations', workflowRouter)
    app.use('/api/operations', operationsRouter)
    app.use('/api/settings', settingsRouter)
    app.use('/api/memberships', membershipRouter)
    app.use('/api/universities', universityRouter)
    app.use('/api/files', fileRouter)
  },
})
