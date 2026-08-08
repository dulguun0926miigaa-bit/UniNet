import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/authenticate.js'
import { requireIdempotency } from '../middleware/idempotency.js'
import { operationsMutationLimiter, searchReadLimiter } from '../middleware/rate-limits.js'
import { createNotification } from '../notifications/notification.service.js'
import { emailService } from '../auth/email.service.js'
import { AppError } from '../utils/app-error.js'
import {
  assertApplicationTransition,
  assertManagedContentAccess,
  managedContentScope,
  toRegistrationApiStatus,
  toRegistrationDatabaseStatus,
} from './workflow.policy.js'

const router = Router()
const uuid = z.string().uuid()
const registrationStatuses = ['REGISTERED', 'WAITLISTED', 'CANCELLED', 'ATTENDED', 'NO_SHOW']
const applicationStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']
const paginationBase = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}
const registrationListQuery = z.object({
  ...paginationBase,
  status: z.enum(registrationStatuses).optional(),
  eventId: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'status']).default('createdAt'),
}).strict()
const applicationListQuery = z.object({
  ...paginationBase,
  status: z.enum(applicationStatuses).optional(),
  contentId: z.string().uuid().optional(),
  sortBy: z.enum(['submittedAt', 'updatedAt', 'status']).default('submittedAt'),
}).strict()
const applicationStatusInput = z.object({
  status: z.enum(['UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED']),
  reason: z.string().trim().max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === 'REJECTED' && (!value.reason || value.reason.length < 3)) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'Татгалзах шалтгаан хамгийн багадаа 3 тэмдэгт байна.' })
  }
})
const attendanceInput = z.object({ attended: z.literal(true) }).strict()

const actorName = user => [
  user?.studentProfile?.lastName ?? user?.staffProfile?.lastName,
  user?.studentProfile?.firstName ?? user?.staffProfile?.firstName,
].filter(Boolean).join(' ') || user?.email || '—'

async function audit(req, data, client = prisma) {
  return client.auditLog.create({
    data: {
      actorId: req.auth.user.id,
      universityId: req.auth.user.universityId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      ...data,
    },
  })
}

function registrationSearch(search) {
  if (!search) return {}
  return {
    OR: [
      { registrationCode: { contains: search, mode: 'insensitive' } },
      { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
      { user: { is: { studentProfile: { is: { firstName: { contains: search, mode: 'insensitive' } } } } } },
      { user: { is: { studentProfile: { is: { lastName: { contains: search, mode: 'insensitive' } } } } } },
      { user: { is: { studentProfile: { is: { studentId: { contains: search, mode: 'insensitive' } } } } } },
      { content: { is: { title: { contains: search, mode: 'insensitive' } } } },
    ],
  }
}

function applicationSearch(search) {
  if (!search) return {}
  return {
    OR: [
      { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
      { user: { is: { studentProfile: { is: { firstName: { contains: search, mode: 'insensitive' } } } } } },
      { user: { is: { studentProfile: { is: { lastName: { contains: search, mode: 'insensitive' } } } } } },
      { user: { is: { studentProfile: { is: { studentId: { contains: search, mode: 'insensitive' } } } } } },
      { content: { is: { title: { contains: search, mode: 'insensitive' } } } },
    ],
  }
}

function serializeRegistration(item) {
  return {
    id: item.id,
    eventId: item.contentId,
    registrationCode: item.registrationCode,
    status: toRegistrationApiStatus(item.status),
    waitlistPosition: item.waitlistPosition,
    attendedAt: item.attendedAt?.toISOString() ?? null,
    cancelledAt: item.cancelledAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    student: {
      id: item.user.id,
      name: actorName(item.user),
      email: item.user.email,
      studentId: item.user.studentProfile?.studentId ?? null,
      major: item.user.studentProfile?.major ?? null,
      university: item.user.university?.shortName ?? 'UniNet',
    },
    event: {
      id: item.content.id,
      title: item.content.title,
      startsAt: item.content.startsAt?.toISOString() ?? null,
      capacity: item.content.capacity,
      universityId: item.content.universityId,
    },
  }
}

function serializeApplication(item, includeHistory = false) {
  return {
    id: item.id,
    status: item.status,
    submittedAt: item.submittedAt.toISOString(),
    reviewedAt: item.reviewedAt?.toISOString() ?? null,
    coverNote: item.coverNote,
    consentGranted: item.consentGranted,
    student: {
      id: item.user.id,
      name: actorName(item.user),
      email: item.user.email,
      studentId: item.user.studentProfile?.studentId ?? null,
      major: item.user.studentProfile?.major ?? null,
      department: item.user.studentProfile?.department ?? null,
      university: item.user.university?.shortName ?? 'UniNet',
    },
    opportunity: {
      id: item.content.id,
      title: item.content.title,
      type: item.content.type,
      organization: item.content.organization,
      universityId: item.content.universityId,
    },
    cv: item.cvAsset?.status === 'AVAILABLE' && item.cvAsset.scanStatus === 'CLEAN'
      ? { assetId: item.cvAsset.id, fileName: item.cvAsset.originalName, downloadUrl: `/api/files/${item.cvAsset.id}/download` }
      : item.cvUrl
        ? { assetId: null, fileName: null, downloadUrl: item.cvUrl }
        : null,
    ...(includeHistory ? {
      history: item.statusHistory.map(entry => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        reason: entry.reason,
        createdAt: entry.createdAt.toISOString(),
        actor: actorName(entry.actor),
      })),
    } : {}),
  }
}

router.use(authenticate, requireRole('STAFF', 'UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'))
router.use(operationsMutationLimiter)

router.get('/registrations', searchReadLimiter, async (req, res, next) => {
  try {
    const input = registrationListQuery.parse(req.query)
    const contentScope = managedContentScope(req.auth.user, 'canManageRegistrations', ['EVENT'])
    const where = {
      content: { is: { ...contentScope, ...(input.eventId ? { id: input.eventId } : {}) } },
      ...(input.status ? { status: toRegistrationDatabaseStatus(input.status) } : {}),
      ...registrationSearch(input.search),
    }
    const [total, items, events] = await Promise.all([
      prisma.eventRegistration.count({ where }),
      prisma.eventRegistration.findMany({
        where,
        include: {
          user: { include: { studentProfile: true, university: { select: { shortName: true } } } },
          content: { select: { id: true, title: true, startsAt: true, capacity: true, universityId: true, createdById: true } },
        },
        orderBy: { [input.sortBy]: input.sortOrder },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.content.findMany({
        where: contentScope,
        select: { id: true, title: true },
        orderBy: { startsAt: 'desc' },
        take: 200,
      }),
    ])
    res.json({
      items: items.map(serializeRegistration),
      events,
      meta: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.max(1, Math.ceil(total / input.pageSize)) },
    })
  } catch (error) { next(error) }
})

router.get('/registrations/:id', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const item = await prisma.eventRegistration.findUnique({
      where: { id },
      include: {
        user: { include: { studentProfile: true, university: { select: { shortName: true } } } },
        content: { select: { id: true, title: true, startsAt: true, capacity: true, universityId: true, createdById: true, type: true } },
      },
    })
    if (!item) throw new AppError('Бүртгэл олдсонгүй.', 404, 'EVENT_REGISTRATION_NOT_FOUND')
    assertManagedContentAccess(req.auth.user, item.content, 'canManageRegistrations')
    res.json({ registration: serializeRegistration(item) })
  } catch (error) { next(error) }
})

router.patch('/registrations/:id/attendance', requireIdempotency, async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    attendanceInput.parse(req.body)
    const existing = await prisma.eventRegistration.findUnique({
      where: { id },
      include: {
        user: { include: { studentProfile: true, university: { select: { shortName: true } } } },
        content: { select: { id: true, title: true, startsAt: true, capacity: true, universityId: true, createdById: true, type: true } },
      },
    })
    if (!existing) throw new AppError('Бүртгэл олдсонгүй.', 404, 'EVENT_REGISTRATION_NOT_FOUND')
    assertManagedContentAccess(req.auth.user, existing.content, 'canManageRegistrations')
    if (existing.status === 'ATTENDED') return res.json({ registration: serializeRegistration(existing), alreadyRecorded: true })
    if (existing.status !== 'CONFIRMED') {
      throw new AppError('Зөвхөн REGISTERED төлөвтэй бүртгэлд ирц батална.', 409, 'ATTENDANCE_STATUS_INVALID')
    }
    const attendedAt = new Date()
    const updated = await prisma.$transaction(async tx => {
      const result = await tx.eventRegistration.updateMany({
        where: { id: existing.id, status: 'CONFIRMED' },
        data: { status: 'ATTENDED', attendedAt },
      })
      if (!result.count) throw new AppError('Бүртгэлийн төлөв зэрэг өөрчлөгдсөн байна.', 409, 'ATTENDANCE_CONFLICT')
      await createNotification(tx, {
        userId: existing.userId,
        universityId: existing.content.universityId,
        contentId: existing.contentId,
        type: 'EVENT_ATTENDANCE',
        title: 'Арга хэмжээний ирц баталгаажлаа',
        description: existing.content.title,
        actionUrl: '/student/registrations',
      })
      await audit(req, {
        action: 'EVENT_ATTENDANCE_RECORDED',
        resourceType: 'EVENT_REGISTRATION',
        resourceId: existing.id,
        resourceName: existing.content.title,
        previousData: { status: existing.status },
        nextData: { status: 'ATTENDED', attendedAt: attendedAt.toISOString(), method: 'MANUAL_UI' },
      }, tx)
      return tx.eventRegistration.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          user: { include: { studentProfile: true, university: { select: { shortName: true } } } },
          content: { select: { id: true, title: true, startsAt: true, capacity: true, universityId: true, createdById: true } },
        },
      })
    })
    await emailService.sendEventAttendance({
      to: existing.user.email,
      studentName: actorName(existing.user),
      eventTitle: existing.content.title,
      attendedAt,
    }).catch(error => console.error('[email:event-attendance] delivery failed', error))
    res.json({ registration: serializeRegistration(updated), alreadyRecorded: false })
  } catch (error) { next(error) }
})

router.get('/applications', searchReadLimiter, async (req, res, next) => {
  try {
    const input = applicationListQuery.parse(req.query)
    const contentScope = managedContentScope(req.auth.user, 'canManageApplications', ['INTERNSHIP', 'JOB', 'RESEARCH'])
    const where = {
      content: { is: { ...contentScope, ...(input.contentId ? { id: input.contentId } : {}) } },
      ...(input.status ? { status: input.status } : {}),
      ...applicationSearch(input.search),
    }
    const [total, items, opportunities] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        include: {
          user: { include: { studentProfile: true, university: { select: { shortName: true } } } },
          content: { select: { id: true, title: true, type: true, organization: true, universityId: true, createdById: true } },
          cvAsset: { select: { id: true, originalName: true, status: true, scanStatus: true } },
        },
        orderBy: { [input.sortBy]: input.sortOrder },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.content.findMany({
        where: contentScope,
        select: { id: true, title: true, type: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])
    res.json({
      items: items.map(item => serializeApplication(item)),
      opportunities,
      meta: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.max(1, Math.ceil(total / input.pageSize)) },
    })
  } catch (error) { next(error) }
})

router.get('/applications/:id', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const item = await prisma.application.findUnique({
      where: { id },
      include: {
        user: { include: { studentProfile: true, university: { select: { shortName: true } } } },
        content: { select: { id: true, title: true, type: true, organization: true, universityId: true, createdById: true } },
        cvAsset: { select: { id: true, originalName: true, status: true, scanStatus: true } },
        statusHistory: {
          include: { actor: { include: { studentProfile: true, staffProfile: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!item) throw new AppError('Өргөдөл олдсонгүй.', 404, 'APPLICATION_NOT_FOUND')
    assertManagedContentAccess(req.auth.user, item.content, 'canManageApplications')
    res.json({ application: serializeApplication(item, true) })
  } catch (error) { next(error) }
})

router.patch('/applications/:id/status', requireIdempotency, async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const input = applicationStatusInput.parse(req.body)
    const existing = await prisma.application.findUnique({
      where: { id },
      include: {
        user: { include: { studentProfile: true, university: { select: { shortName: true } } } },
        content: { select: { id: true, title: true, type: true, organization: true, universityId: true, createdById: true } },
        cvAsset: { select: { id: true, originalName: true, status: true, scanStatus: true } },
      },
    })
    if (!existing) throw new AppError('Өргөдөл олдсонгүй.', 404, 'APPLICATION_NOT_FOUND')
    assertManagedContentAccess(req.auth.user, existing.content, 'canManageApplications')
    assertApplicationTransition(existing.status, input.status)
    if (existing.status === input.status) return res.json({ application: serializeApplication(existing), alreadyUpdated: true })

    const updated = await prisma.$transaction(async tx => {
      const result = await tx.application.updateMany({
        where: { id: existing.id, status: existing.status },
        data: { status: input.status, reviewedAt: new Date() },
      })
      if (!result.count) throw new AppError('Өргөдлийн төлөв зэрэг өөрчлөгдсөн байна.', 409, 'APPLICATION_STATUS_CONFLICT')
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: existing.id,
          actorId: req.auth.user.id,
          fromStatus: existing.status,
          toStatus: input.status,
          reason: input.reason,
        },
      })
      await createNotification(tx, {
        userId: existing.userId,
        universityId: existing.content.universityId,
        contentId: existing.contentId,
        type: 'APPLICATION_STATUS',
        title: 'Өргөдлийн төлөв шинэчлэгдлээ',
        description: `${existing.content.title}: ${input.status}`,
        actionUrl: '/student/applications',
      })
      await audit(req, {
        action: `APPLICATION_${input.status}`,
        resourceType: 'APPLICATION',
        resourceId: existing.id,
        resourceName: existing.content.title,
        previousData: { status: existing.status },
        nextData: { status: input.status, reason: input.reason },
        severity: input.status === 'REJECTED' ? 'MEDIUM' : 'INFO',
      }, tx)
      return tx.application.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          user: { include: { studentProfile: true, university: { select: { shortName: true } } } },
          content: { select: { id: true, title: true, type: true, organization: true, universityId: true, createdById: true } },
          cvAsset: { select: { id: true, originalName: true, status: true, scanStatus: true } },
        },
      })
    })
    await emailService.sendApplicationStatus({
      to: existing.user.email,
      studentName: actorName(existing.user),
      opportunityTitle: existing.content.title,
      status: input.status,
      reason: input.reason,
    }).catch(error => console.error('[email:application-status] delivery failed', error))
    res.json({ application: serializeApplication(updated), alreadyUpdated: false })
  } catch (error) { next(error) }
})

export { router as workflowRouter }
