import { createClient } from 'redis'
import { RedisStore } from 'rate-limit-redis'
import { env } from '../config/env.js'
import { logger } from '../observability/logger.js'

export const redisClient = env.REDIS_URL
  ? createClient({
      url: env.REDIS_URL,
      socket: { connectTimeout: 5_000, reconnectStrategy: retries => Math.min(100 * 2 ** retries, 3_000) },
      disableOfflineQueue: true,
    })
  : null

let connectionPromise = null

redisClient?.on('error', error => {
  logger.error('redis.client.error', { error })
})

export function connectRedis() {
  if (!redisClient || redisClient.isReady) return Promise.resolve()
  if (!connectionPromise) {
    connectionPromise = redisClient.connect().then(() => {
      logger.info('redis.connected')
    }).catch(error => {
      connectionPromise = null
      throw error
    })
  }
  return connectionPromise
}

export async function checkRedis() {
  if (!redisClient) return null
  await connectRedis()
  return redisClient.ping()
}

export async function closeRedis() {
  if (!redisClient?.isOpen) return
  await redisClient.quit()
}

export function createRedisRateLimitStore(prefix) {
  if (!redisClient) return undefined
  return new RedisStore({
    prefix: `uninet:rate-limit:${prefix}:`,
    sendCommand: async (...args) => {
      await connectRedis()
      return redisClient.sendCommand(args)
    },
  })
}
