import { prisma } from '../lib/prisma.js'
import { AppError } from '../utils/app-error.js'

const deletionDelayMs = 30 * 24 * 60 * 60 * 1000

export function buildDeletionSchedule(now, legalHoldUntil) {
  const defaultSchedule = new Date(now.getTime() + deletionDelayMs)
  const hasLegalHold = Boolean(legalHoldUntil && legalHoldUntil > now)
  /** @type {'ON_HOLD' | 'REQUESTED'} */
  const status = hasLegalHold ? 'ON_HOLD' : 'REQUESTED'
  return {
    hasLegalHold,
    status,
    scheduledFor: hasLegalHold && legalHoldUntil > defaultSchedule
      ? legalHoldUntil
      : defaultSchedule,
  }
}

/** @param {any} request */
function publicRequest(request) {
  return {
    id: request.id,
    type: request.type,
    status: request.status,
    reason: request.reason,
    requestedAt: request.requestedAt,
    scheduledFor: request.scheduledFor,
    completedAt: request.completedAt,
    cancelledAt: request.cancelledAt,
    legalHold: Boolean(request.legalHoldUntil && request.legalHoldUntil > new Date()),
    legalHoldUntil: request.legalHoldUntil,
  }
}

/** @param {{ user: any, reason?: string, context?: any }} input */
export async function deactivateAccount(input) {
  const now = new Date()
  const request = await prisma.$transaction(async tx => {
    const updated = await tx.user.updateMany({
      where: { id: input.user.id, status: 'ACTIVE' },
      data: { status: 'DEACTIVATED', deactivatedAt: now },
    })
    if (updated.count !== 1) throw new AppError('Бүртгэл идэвхгүй болгох боломжгүй байна.', 409, 'ACCOUNT_NOT_ACTIVE')
    await tx.session.updateMany({
      where: { userId: input.user.id, revokedAt: null },
      data: { revokedAt: now },
    })
    const created = await tx.accountActionRequest.create({
      data: {
        userId: input.user.id,
        type: 'DEACTIVATE',
        status: 'COMPLETED',
        reason: input.reason ?? 'User requested account deactivation',
        completedAt: now,
        ipAddress: input.context?.ipAddress,
        userAgent: input.context?.userAgent,
        context: { source: 'SETTINGS' },
      },
    })
    await tx.auditLog.create({
      data: {
        actorId: input.user.id,
        universityId: input.user.universityId,
        action: 'ACCOUNT_DEACTIVATED',
        resourceType: 'USER',
        resourceId: input.user.id,
        severity: 'HIGH',
        ipAddress: input.context?.ipAddress,
        userAgent: input.context?.userAgent,
        nextData: { status: 'DEACTIVATED', requestId: created.id },
      },
    })
    return created
  })
  return publicRequest(request)
}

/** @param {{ user: any, reason: string, context?: any }} input */
export async function requestAccountDeletion(input) {
  const now = new Date()
  const request = await prisma.$transaction(async tx => {
    const existing = await tx.accountActionRequest.findFirst({
      where: { userId: input.user.id, type: 'DELETE', status: { in: ['REQUESTED', 'ON_HOLD'] } },
      orderBy: { requestedAt: 'desc' },
    })
    if (existing) return existing

    const user = await tx.user.findUnique({
      where: { id: input.user.id },
      select: { legalHoldUntil: true, legalHoldReason: true },
    })
    const { hasLegalHold, status, scheduledFor } = buildDeletionSchedule(now, user?.legalHoldUntil)
    const created = await tx.accountActionRequest.create({
      data: {
        userId: input.user.id,
        type: 'DELETE',
        status,
        reason: input.reason,
        scheduledFor,
        legalHoldUntil: hasLegalHold ? user.legalHoldUntil : null,
        legalHoldReason: hasLegalHold ? user.legalHoldReason : null,
        ipAddress: input.context?.ipAddress,
        userAgent: input.context?.userAgent,
        context: { source: 'SETTINGS', retentionWindowDays: 30 },
      },
    })
    await tx.user.update({
      where: { id: input.user.id },
      data: { deletionRequestedAt: now, deletionScheduledFor: scheduledFor },
    })
    await tx.auditLog.create({
      data: {
        actorId: input.user.id,
        universityId: input.user.universityId,
        action: 'ACCOUNT_DELETION_REQUESTED',
        resourceType: 'USER',
        resourceId: input.user.id,
        severity: 'HIGH',
        ipAddress: input.context?.ipAddress,
        userAgent: input.context?.userAgent,
        nextData: { requestId: created.id, status: created.status, scheduledFor },
      },
    })
    return created
  }, { isolationLevel: 'Serializable' })
  return publicRequest(request)
}

/** @param {{ user: any, context?: any }} input */
export async function cancelAccountDeletion(input) {
  const now = new Date()
  const request = await prisma.$transaction(async tx => {
    const current = await tx.accountActionRequest.findFirst({
      where: { userId: input.user.id, type: 'DELETE', status: { in: ['REQUESTED', 'ON_HOLD'] } },
      orderBy: { requestedAt: 'desc' },
    })
    if (!current) throw new AppError('Идэвхтэй устгах хүсэлт олдсонгүй.', 404, 'DELETION_REQUEST_NOT_FOUND')
    const updated = await tx.accountActionRequest.update({
      where: { id: current.id },
      data: { status: 'CANCELLED', cancelledAt: now },
    })
    await tx.user.update({
      where: { id: input.user.id },
      data: { deletionRequestedAt: null, deletionScheduledFor: null },
    })
    await tx.auditLog.create({
      data: {
        actorId: input.user.id,
        universityId: input.user.universityId,
        action: 'ACCOUNT_DELETION_CANCELLED',
        resourceType: 'USER',
        resourceId: input.user.id,
        severity: 'INFO',
        ipAddress: input.context?.ipAddress,
        userAgent: input.context?.userAgent,
        nextData: { requestId: updated.id, status: 'CANCELLED' },
      },
    })
    return updated
  })
  return publicRequest(request)
}

export async function listAccountRequests(userId) {
  const requests = await prisma.accountActionRequest.findMany({
    where: { userId },
    orderBy: { requestedAt: 'desc' },
    take: 50,
  })
  return requests.map(publicRequest)
}
