import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/authenticate.js'
import { AppError } from '../utils/app-error.js'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { notificationBus } from './notification-bus.js'

const router = Router()
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  since: z.coerce.date().optional(),
}).strict()
const uuid = z.string().uuid()

function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60000))
  if (minutes < 1) return 'Одоо'
  if (minutes < 60) return `${minutes} минутын өмнө`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} цагийн өмнө`
  return `${Math.floor(hours / 24)} хоногийн өмнө`
}

function serialize(notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    description: notification.description,
    actionUrl: notification.actionUrl,
    read: Boolean(notification.readAt),
    createdAt: notification.createdAt.toISOString(),
    time: relativeTime(notification.createdAt),
    university: notification.university?.shortName || 'UniNet',
  }
}

router.get('/stream', async (req, res, next) => {
  try {
    const token = String(req.query.token || '')
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'uninet-api', audience: 'uninet-notifications' })
    if (typeof payload === 'string' || payload.type !== 'notification-stream' || !payload.sub) throw new Error('Invalid stream token')
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()
    const send = data => res.write(`event: notification\ndata: ${JSON.stringify(data)}\n\n`)
    send({ connected: true, at: new Date().toISOString() })
    const unsubscribe = notificationBus.subscribe(payload.sub, send)
    const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 25_000)
    req.on('close', () => { clearInterval(heartbeat); unsubscribe() })
  } catch (error) { next(new AppError('Real-time notification token хүчингүй байна.', 401, 'NOTIFICATION_STREAM_TOKEN_INVALID')) }
})

router.use(authenticate)

router.post('/stream-token', (req, res) => {
  const token = jwt.sign({ sub: req.auth.user.id, type: 'notification-stream' }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256', issuer: 'uninet-api', audience: 'uninet-notifications', expiresIn: '5m',
  })
  res.json({ token, expiresInSeconds: 300 })
})

router.get('/', async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query)
    const notifications = await prisma.notification.findMany({
      where: { userId: req.auth.user.id, ...(query.since ? { createdAt: { gt: query.since } } : {}) },
      include: { university: { select: { shortName: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    })
    const unreadCount = await prisma.notification.count({ where: { userId: req.auth.user.id, readAt: null } })
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ notifications: notifications.map(serialize), unreadCount, polledAt: new Date().toISOString() })
  } catch (error) { next(error) }
})

router.patch('/read-all', async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.auth.user.id, readAt: null },
      data: { readAt: new Date() },
    })
    res.json({ updated: result.count })
  } catch (error) { next(error) }
})

router.patch('/:id/read', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const result = await prisma.notification.updateMany({
      where: { id, userId: req.auth.user.id },
      data: { readAt: new Date() },
    })
    if (!result.count) throw new AppError('Мэдэгдэл олдсонгүй.', 404, 'NOTIFICATION_NOT_FOUND')
    res.json({ id, read: true })
  } catch (error) { next(error) }
})

export { router as notificationRouter }
