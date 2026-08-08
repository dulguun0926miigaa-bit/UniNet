import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'
import { createOpaqueToken, hashToken } from '../utils/tokens.js'
import { emailService } from './email.service.js'

function durationToMs(value) {
  const match = /^(\d+)([mhd])$/.exec(value)
  if (!match) return 30 * 60_000
  return Number(match[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]
}

async function assertEmailAllowed(user, normalizedEmail) {
  if (normalizedEmail === user.normalizedEmail) throw new AppError('Шинэ имэйл одоогийн имэйлээс өөр байна.', 422, 'EMAIL_CHANGE_SAME_EMAIL')
  const duplicate = await prisma.user.findUnique({ where: { normalizedEmail } })
  if (duplicate) throw new AppError('Энэ имэйл өөр бүртгэлд ашиглагдаж байна.', 409, 'EMAIL_ALREADY_REGISTERED')
  const pendingDuplicate = await prisma.emailChangeRequest.findFirst({
    where: { newNormalizedEmail: normalizedEmail, verifiedAt: null, cancelledAt: null, expiresAt: { gt: new Date() }, userId: { not: user.id } },
  })
  if (pendingDuplicate) throw new AppError('Энэ имэйлд өөр баталгаажуулалтын хүсэлт байна.', 409, 'EMAIL_CHANGE_ALREADY_PENDING')
  if (user.universityId) {
    const domainName = normalizedEmail.split('@')[1]
    const domain = await prisma.universityDomain.findUnique({ where: { domain: domainName } })
    if (!domain?.isActive || !domain.isVerified || domain.universityId !== user.universityId) {
      throw new AppError('Шинэ имэйл одоогийн сургуулийн баталгаажсан домэйнд хамаарах ёстой.', 422, 'EMAIL_CHANGE_DOMAIN_MISMATCH')
    }
  }
}

export const emailChangeService = {
  async request(user, newEmail, context = {}) {
    const normalizedEmail = String(newEmail || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new AppError('Шинэ имэйл буруу байна.', 422, 'EMAIL_INVALID')
    await assertEmailAllowed(user, normalizedEmail)
    const token = createOpaqueToken()
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + durationToMs(env.EMAIL_CHANGE_TOKEN_EXPIRES_IN))
    await prisma.$transaction(async tx => {
      await tx.emailChangeRequest.updateMany({
        where: { userId: user.id, verifiedAt: null, cancelledAt: null },
        data: { cancelledAt: new Date() },
      })
      await tx.emailChangeRequest.create({
        data: { userId: user.id, newEmail: normalizedEmail, newNormalizedEmail: normalizedEmail, tokenHash, expiresAt },
      })
      await tx.auditLog.create({
        data: {
          actorId: user.id, universityId: user.universityId, action: 'EMAIL_CHANGE_REQUESTED',
          resourceType: 'USER_SECURITY', resourceId: user.id, resourceName: user.email,
          nextData: { newEmailDomain: normalizedEmail.split('@')[1], expiresAt }, severity: 'HIGH',
          ipAddress: context.ipAddress, userAgent: context.userAgent?.slice(0, 500),
        },
      })
    })
    try {
      const delivery = await emailService.sendEmailChangeVerification({ to: normalizedEmail, token })
      if (!delivery?.delivered) throw new Error('Email delivery disabled')
    } catch {
      await prisma.emailChangeRequest.updateMany({ where: { tokenHash, verifiedAt: null }, data: { cancelledAt: new Date() } })
      throw new AppError('Шинэ имэйл баталгаажуулах холбоос илгээж чадсангүй.', 503, 'EMAIL_CHANGE_DELIVERY_FAILED')
    }
    return { message: 'Шинэ имэйл рүү баталгаажуулах холбоос илгээгдлээ.', expiresAt }
  },

  async confirm(token, context = {}) {
    const tokenHash = hashToken(String(token || ''))
    const now = new Date()
    const request = await prisma.emailChangeRequest.findUnique({ where: { tokenHash }, include: { user: true } })
    if (!request || request.verifiedAt || request.cancelledAt || request.expiresAt <= now) {
      throw new AppError('Имэйл солих холбоос хүчингүй эсвэл хугацаа дууссан байна.', 400, 'EMAIL_CHANGE_TOKEN_INVALID')
    }
    await assertEmailAllowed(request.user, request.newNormalizedEmail)
    const result = await prisma.$transaction(async tx => {
      const claimed = await tx.emailChangeRequest.updateMany({
        where: { id: request.id, verifiedAt: null, cancelledAt: null, expiresAt: { gt: now } },
        data: { verifiedAt: now },
      })
      if (claimed.count !== 1) throw new AppError('Имэйл солих холбоос аль хэдийн ашиглагдсан байна.', 409, 'EMAIL_CHANGE_ALREADY_USED')
      const updated = await tx.user.update({
        where: { id: request.userId },
        data: {
          email: request.newEmail,
          normalizedEmail: request.newNormalizedEmail,
          ...(request.user.role === 'STUDENT' ? { studentEmail: request.newNormalizedEmail } : {}),
          emailVerifiedAt: now,
        },
      })
      const revoked = await tx.session.updateMany({ where: { userId: request.userId, revokedAt: null }, data: { revokedAt: now } })
      await tx.emailChangeRequest.updateMany({
        where: { userId: request.userId, id: { not: request.id }, verifiedAt: null, cancelledAt: null },
        data: { cancelledAt: now },
      })
      await tx.auditLog.create({
        data: {
          actorId: request.userId, universityId: request.user.universityId, action: 'EMAIL_CHANGED',
          resourceType: 'USER_SECURITY', resourceId: request.userId, resourceName: request.newEmail,
          previousData: { email: request.user.email }, nextData: { email: request.newEmail, sessionsRevoked: revoked.count },
          severity: 'HIGH', ipAddress: context.ipAddress, userAgent: context.userAgent?.slice(0, 500),
        },
      })
      return { updated, sessionsRevoked: revoked.count }
    })
    return { message: 'Имэйл амжилттай солигдлоо. Дахин нэвтэрнэ үү.', email: result.updated.email, sessionsRevoked: result.sessionsRevoked }
  },
}
