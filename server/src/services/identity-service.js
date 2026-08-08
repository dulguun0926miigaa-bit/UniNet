import { identityApp } from './identity.app.js'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { createGracefulShutdown, installProcessLifecycle } from '../lifecycle/graceful-shutdown.js'
import { logger } from '../observability/logger.js'
import { closeRedis, connectRedis } from '../lib/redis.js'

await connectRedis()
const server = identityApp.listen(env.IDENTITY_SERVICE_PORT, env.SERVICE_BIND_HOST, () => {
  logger.info('identity-service.started', { host: env.SERVICE_BIND_HOST, port: env.IDENTITY_SERVICE_PORT })
})
server.requestTimeout = 30_000
server.headersTimeout = 35_000
server.keepAliveTimeout = 5_000
const shutdown = createGracefulShutdown({ server, database: prisma, logger, closeDependencies: [closeRedis] })
installProcessLifecycle({ shutdown, logger })
