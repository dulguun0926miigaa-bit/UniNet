import { logger as defaultLogger } from '../observability/logger.js'

export function createGracefulShutdown({
  server,
  database,
  logger = defaultLogger,
  closeDependencies = [],
  timeoutMs = 10_000,
  exit = (code) => process.exit(code),
}) {
  let shutdownPromise

  return function shutdown(reason, exitCode = 0) {
    if (shutdownPromise) return shutdownPromise

    logger.info('server.shutdown.started', { reason, exitCode })
    shutdownPromise = new Promise((resolve) => {
      let settled = false

      async function finish(code, forced = false) {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        try {
          await database.$disconnect()
        } catch (error) {
          code = 1
          logger.error('server.database.disconnect.failed', { reason, error })
        }
        for (const closeDependency of closeDependencies) {
          try {
            await closeDependency()
          } catch (error) {
            code = 1
            logger.error('server.dependency.disconnect.failed', { reason, error })
          }
        }
        logger.info('server.shutdown.completed', { reason, exitCode: code, forced })
        resolve(code)
        exit(code)
      }

      const timeout = setTimeout(() => {
        server.closeAllConnections?.()
        void finish(1, true)
      }, timeoutMs)
      timeout.unref?.()

      server.close((error) => {
        if (error) {
          logger.error('server.http.close.failed', { reason, error })
          void finish(1)
          return
        }
        void finish(exitCode)
      })
      server.closeIdleConnections?.()
    })

    return shutdownPromise
  }
}

export function installProcessLifecycle({ shutdown, logger = defaultLogger }) {
  process.once('SIGINT', () => { void shutdown('SIGINT', 0) })
  process.once('SIGTERM', () => { void shutdown('SIGTERM', 0) })
  process.once('unhandledRejection', (error) => {
    logger.error('process.unhandled_rejection', {
      error: error instanceof Error ? error : { type: typeof error },
    })
    void shutdown('unhandledRejection', 1)
  })
  process.once('uncaughtException', (error) => {
    logger.error('process.uncaught_exception', { error })
    void shutdown('uncaughtException', 1)
  })
}
