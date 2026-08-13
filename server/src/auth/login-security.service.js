import crypto from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'
import { createNotification } from '../notifications/notification.service.js'

const digest = value => crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex')

function identity(email, ipAddress) {
  const emailHash = digest(email)
  const ipHash = digest(ipAddress || 'unknown')
  return { emailHash, ipHash, keyHash: digest(`${emailHash}:${ipHash}`) }
}

function retrySeconds(state, now = new Date()) {
  if (!state?.blockedUntil || state.blockedUntil <= now) return 0
  return Math.max(1, Math.ceil((state.blockedUntil.getTime() - now.getTime()) / 1000))
}

function backoffSeconds(failureCount) {
  const threshold = env.NODE_ENV === 'production'
    ? env.LOGIN_BACKOFF_THRESHOLD
    : Math.max(10, env.LOGIN_BACKOFF_THRESHOLD)
  if (failureCount < threshold) return 0
  const exponent = Math.min(12, failureCount - threshold)
  return Math.min(env.LOGIN_BACKOFF_MAX_SECONDS, 5 * (2 ** exponent))
}

export const loginSecurityService = {
  async assertNotBlocked(email, ipAddress) {
    const keys = identity(email, ipAddress)
    const state = await prisma.loginSecurityState.findUnique({ where: { keyHash: keys.keyHash } })
    const retryAfterSeconds = retrySeconds(state)
    if (retryAfterSeconds > 0) {
      throw new AppError(
        'Олон удаагийн амжилтгүй оролдлогын улмаас түр хүлээнэ үү.',
        429,
        'LOGIN_BACKOFF_ACTIVE',
        { retryAfterSeconds },
      )
    }
    return { keys, state }
  },

  async recordFailure(email, ipAddress, user = null, context = {}) {
    const keys = identity(email, ipAddress)
    const previous = await prisma.loginSecurityState.findUnique({ where: { keyHash: keys.keyHash } })
    const failureCount = (previous?.failureCount || 0) + 1
    const seconds = backoffSeconds(failureCount)
    const now = new Date()
    const blockedUntil = seconds ? new Date(now.getTime() + seconds * 1000) : null
    const shouldNotify = Boolean(
      user
      && failureCount >= env.LOGIN_ALERT_THRESHOLD
      && (!previous?.notifiedAt || previous.notifiedAt < new Date(now.getTime() - 6 * 60 * 60 * 1000)),
    )
    const state = await prisma.loginSecurityState.upsert({
      where: { keyHash: keys.keyHash },
      create: {
        ...keys,
        failureCount,
        blockedUntil,
        lastFailureAt: now,
        notifiedAt: shouldNotify ? now : null,
      },
      update: {
        failureCount,
        blockedUntil,
        lastFailureAt: now,
        ...(shouldNotify ? { notifiedAt: now } : {}),
      },
    })
    if (shouldNotify) {
      await prisma.$transaction(async tx => {
        await createNotification(tx, {
          userId: user.id,
          universityId: user.universityId,
          type: 'SECURITY_ALERT',
          title: 'Сэжигтэй нэвтрэх оролдлого',
          description: `${failureCount} удаагийн амжилтгүй нэвтрэх оролдлого илэрлээ. Энэ та биш бол нууц үгээ солино уу.`,
          actionUrl: '/settings/security',
        })
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            universityId: user.universityId,
            action: 'SUSPICIOUS_LOGIN_ALERTED',
            resourceType: 'AUTH_SECURITY_EVENT',
            resourceId: user.id,
            resourceName: `email-sha256:${keys.emailHash.slice(0, 24)}`,
            nextData: { failureCount, blockedUntil, ipHash: keys.ipHash.slice(0, 24) },
            severity: 'HIGH',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent?.slice(0, 500),
          },
        })
      })
    }
    return { failureCount: state.failureCount, retryAfterSeconds: seconds, blockedUntil }
  },

  async recordSuccess(email, ipAddress) {
    const keys = identity(email, ipAddress)
    const now = new Date()
    await prisma.loginSecurityState.upsert({
      where: { keyHash: keys.keyHash },
      create: { ...keys, failureCount: 0, blockedUntil: null, lastSuccessAt: now },
      update: { failureCount: 0, blockedUntil: null, lastSuccessAt: now },
    })
  },

  async cleanup(before = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) {
    return prisma.loginSecurityState.deleteMany({
      where: { updatedAt: { lt: before }, blockedUntil: { lt: new Date() } },
    })
  },
}
