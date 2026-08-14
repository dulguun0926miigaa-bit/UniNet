import { app } from './app.js'
import { env } from './config/env.js'
import { prisma } from './lib/prisma.js'
import { createGracefulShutdown, installProcessLifecycle } from './lifecycle/graceful-shutdown.js'
import { logger } from './observability/logger.js'
import { closeRedis, connectRedis } from './lib/redis.js'
import { deployPendingMigrations } from '../../scripts/deploy-pending-migrations.mjs'

await deployPendingMigrations()
await connectRedis()
const server = app.listen(env.PORT, () => {
  logger.info('server.started', { port: env.PORT })
})

server.requestTimeout = 30_000
server.headersTimeout = 35_000
server.keepAliveTimeout = 5_000

const shutdown = createGracefulShutdown({ server, database: prisma, logger, closeDependencies: [closeRedis] })
installProcessLifecycle({ shutdown, logger })
