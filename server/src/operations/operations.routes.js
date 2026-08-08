import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/authenticate.js'
import { AppError } from '../utils/app-error.js'
import { operationsMutationLimiter } from '../middleware/rate-limits.js'
import { verifyEventTicket } from '../tickets/event-ticket.js'
import { requireIdempotency } from '../middleware/idempotency.js'
import { createNotification, createNotifications } from '../notifications/notification.service.js'
import { universityService } from '../universities/university.service.js'
import { checkRedis, redisClient } from '../lib/redis.js'
import os from 'node:os'
import { assertApplicationTransition, assertManagedContentAccess } from './workflow.policy.js'
import {
  assertContentManagement,
  assertPermission,
  assertTenantAccess,
  contentManagementScope,
  hasPermission,
  surveyManagementScope,
  tenantScope,
} from '../authorization/policy.js'

const router = Router()
const uuid = z.string().uuid()
const contentInput = z.object({
  title: z.string().trim().min(3).max(200),
  shortDescription: z.string().trim().min(3).max(500),
  description: z.string().trim().min(3).max(10000),
  type: z.enum(['EVENT', 'INTERNSHIP', 'JOB', 'RESEARCH', 'ANNOUNCEMENT']),
  visibility: z.enum(['PRIVATE', 'NETWORK', 'PARTNERS', 'PUBLIC']).default('PRIVATE'),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED']).default('DRAFT'),
  category: z.string().trim().max(100).optional(),
  organization: z.string().trim().max(200).optional(),
  location: z.string().trim().max(300).optional(),
  mode: z.string().trim().max(80).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  deadlineAt: z.coerce.date().optional(),
  capacity: z.coerce.number().int().positive().max(100000).optional(),
  pricingType: z.enum(['FREE', 'PAID']).default('FREE'),
  priceAmount: z.coerce.number().int().min(0).max(1000000000).default(0),
  currency: z.string().trim().toUpperCase().length(3).default('MNT'),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict()
const contentUpdateInput = contentInput
  .omit({ status: true })
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict()
const statusInput = z.object({
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'CHANGES_REQUESTED', 'REJECTED', 'ARCHIVED', 'EXPIRED']),
  reason: z.string().trim().max(1000).optional(),
}).strict()
const actionInput = z.object({
  action: z.string().trim().min(1).max(80),
  id: z.string().uuid().optional(),
  resourceType: z.enum(['CONTENT', 'APPLICATION', 'PARTNERSHIP', 'USER']).optional(),
  value: z.string().trim().max(80).optional(),
  reason: z.string().trim().max(1000).optional(),
}).strict()
const universityInput = z.object({
  name: z.string().trim().min(3).max(200),
  shortName: z.string().trim().min(2).max(40),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).optional(),
  domain: z.string().trim().toLowerCase().min(3).max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
  status: z.enum(['PENDING', 'ACTIVE']).default('PENDING'),
}).strict()
const universityStatusInput = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict()
const attendanceScanInput = z.object({ ticket: z.string().trim().min(100).max(4096) }).strict()

const dateOnly = value => value ? value.toISOString().slice(0, 10).replaceAll('-', '.') : '—'
const actorName = actor => [actor?.studentProfile?.firstName ?? actor?.staffProfile?.firstName, actor?.studentProfile?.lastName ?? actor?.staffProfile?.lastName].filter(Boolean).join(' ') || actor?.email || 'System'

function tenantWhere(user) {
  return tenantScope(user)
}

function assertTenant(user, universityId) {
  assertTenantAccess(user, universityId)
}

function canPublish(user) {
  return hasPermission(user, 'canPublish')
}

function permissionNames(user) {
  const profile = user.staffProfile
  if (!profile) return []
  return [
    profile.canCreateContent && 'CREATE_CONTENT',
    profile.canPublish && 'PUBLISH_CONTENT',
    profile.canManageRegistrations && 'MANAGE_REGISTRATIONS',
    profile.canManageApplications && 'MANAGE_APPLICATIONS',
    profile.canManageSurveys && 'MANAGE_SURVEYS',
    profile.canViewReports && 'VIEW_REPORTS',
  ].filter(Boolean)
}

function slugify(title) {
  const normalized = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `${normalized || 'content'}-${randomBytes(4).toString('hex')}`
}

function normalizedPricing(input, existingType = null) {
  const type = input.type ?? existingType
  if (type !== 'EVENT') return { pricingType: 'FREE', priceAmount: 0, currency: 'MNT' }
  const pricingType = input.pricingType ?? 'FREE'
  const priceAmount = Number(input.priceAmount ?? 0)
  const currency = String(input.currency || 'MNT').toUpperCase()
  if (pricingType === 'FREE') return { pricingType: 'FREE', priceAmount: 0, currency }
  if (!Number.isInteger(priceAmount) || priceAmount <= 0) {
    throw new AppError('Төлбөртэй арга хэмжээний үнэ 0-ээс их бүхэл тоо байна.', 422, 'EVENT_PRICE_INVALID')
  }
  return { pricingType: 'PAID', priceAmount, currency }
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient | typeof prisma} [client]
 */
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

function assertContentTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return
  const allowed = {
    DRAFT: ['PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED'],
    PENDING_APPROVAL: ['APPROVED', 'PUBLISHED', 'CHANGES_REQUESTED', 'REJECTED', 'DRAFT'],
    APPROVED: ['PUBLISHED', 'ARCHIVED'],
    PUBLISHED: ['ARCHIVED', 'EXPIRED'],
    CHANGES_REQUESTED: ['DRAFT', 'PENDING_APPROVAL', 'ARCHIVED'],
    REJECTED: ['DRAFT', 'ARCHIVED'],
    ARCHIVED: [],
    EXPIRED: ['ARCHIVED'],
  }
  if (!allowed[fromStatus]?.includes(toStatus)) {
    throw new AppError(`${fromStatus} төлвөөс ${toStatus} төлөв рүү шилжих боломжгүй.`, 409, 'CONTENT_STATUS_TRANSITION_INVALID')
  }
}


async function changeContentStatus(req, existing, status, reason) {
  assertContentTransition(existing.status, status)
  if (existing.status === status) return existing
  return prisma.$transaction(async tx => {
    const result = await tx.content.updateMany({
      where: { id: existing.id, version: existing.version },
      data: {
        status,
        version: { increment: 1 },
        ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
        ...(['APPROVED', 'PUBLISHED'].includes(status) && canPublish(req.auth.user)
          ? { approvedAt: new Date(), approvedById: req.auth.user.id }
          : {}),
      },
    })
    if (!result.count) throw new AppError('Контент өөр хэрэглэгчээр шинэчлэгдсэн байна. Дахин ачаална уу.', 409, 'CONTENT_VERSION_CONFLICT')
    const updated = await tx.content.findUniqueOrThrow({ where: { id: existing.id } })
    await tx.contentStatusHistory.create({
      data: { contentId: existing.id, actorId: req.auth.user.id, fromStatus: existing.status, toStatus: status, reason },
    })
    await audit(req, {
      action: `CONTENT_${status}`, resourceType: 'CONTENT', resourceId: existing.id,
      resourceName: existing.title, previousData: { status: existing.status, version: existing.version },
      nextData: { status: updated.status, version: updated.version, reason },
      severity: status === 'REJECTED' ? 'MEDIUM' : 'INFO',
    }, tx)
    return updated
  })
}

async function notifyPublishedContent(content) {
  let universityIds = null
  if (content.visibility === 'PRIVATE') {
    universityIds = content.universityId ? [content.universityId] : []
  } else if (content.visibility === 'PARTNERS') {
    if (!content.universityId) universityIds = []
    else {
      const partnerships = await prisma.partnership.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { requesterUniversityId: content.universityId },
            { partnerUniversityId: content.universityId },
          ],
        },
        select: { requesterUniversityId: true, partnerUniversityId: true },
      })
      universityIds = [...new Set([
        content.universityId,
        ...partnerships.map(item => item.requesterUniversityId === content.universityId
          ? item.partnerUniversityId
          : item.requesterUniversityId),
      ])]
    }
  }
  const userWhere = /** @type {import('@prisma/client').Prisma.UserWhereInput} */ ({
    role: 'STUDENT',
    status: 'ACTIVE',
    ...(universityIds ? { universityId: { in: universityIds } } : {}),
  })
  const users = await prisma.user.findMany({ where: userWhere, select: { id: true, universityId: true } })
  if (!users.length) return
  await createNotifications(prisma, users.map(user => ({
      userId: user.id,
      universityId: content.universityId ?? user.universityId,
      contentId: content.id,
      type: content.type,
      title: 'Шинэ боломж нийтлэгдлээ',
      description: content.title,
      actionUrl: `/student/content/${content.id}`,
    })))
}

async function notifyApprovers(content, actorId) {
  if (content.status !== 'PENDING_APPROVAL' || !content.universityId) return
  const approvers = await prisma.user.findMany({
    where: {
      id: { not: actorId },
      universityId: content.universityId,
      status: 'ACTIVE',
      OR: [
        { role: 'UNIVERSITY_ADMIN' },
        { role: 'STAFF', staffProfile: { is: { canPublish: true } } },
      ],
    },
    select: { id: true },
  })
  if (!approvers.length) return
  await createNotifications(prisma, approvers.map(approver => ({
      userId: approver.id,
      universityId: content.universityId,
      contentId: content.id,
      type: 'CONTENT_APPROVAL',
      title: 'Шинэ баталгаажуулалтын хүсэлт',
      description: content.title,
      actionUrl: '/admin/approvals',
    })))
}

router.use(authenticate, requireRole('STAFF', 'UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'))
router.use(operationsMutationLimiter)

router.get('/bootstrap', async (req, res, next) => {
  try {
    const scope = tenantWhere(req.auth.user)
    const isStaff = req.auth.user.role === 'STAFF'
    const canManageRegistrations = hasPermission(req.auth.user, 'canManageRegistrations')
    const canManageApplications = hasPermission(req.auth.user, 'canManageApplications')
    const canManageSurveys = hasPermission(req.auth.user, 'canManageSurveys')
    const canViewReports = hasPermission(req.auth.user, 'canViewReports')
    const databaseStarted = performance.now()
    await prisma.user.count({ where: scope })
    const databaseResponse = Math.max(1, Math.round(performance.now() - databaseStarted))
    const [contents, surveys, users, registrations, applications, partnerships, universities, auditLogs, notifications] = await Promise.all([
      prisma.content.findMany({
        where: contentManagementScope(req.auth.user),
        include: {
          university: { select: { shortName: true } },
          createdBy: { include: { studentProfile: true, staffProfile: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      canManageSurveys ? prisma.survey.findMany({
        where: surveyManagementScope(req.auth.user),
        include: { createdBy: { include: { studentProfile: true, staffProfile: true } }, _count: { select: { responses: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }) : Promise.resolve([]),
      isStaff ? Promise.resolve([]) : prisma.user.findMany({
        where: scope,
        include: { university: { select: { shortName: true } }, studentProfile: true, staffProfile: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      canManageRegistrations ? prisma.eventRegistration.findMany({
        where: { content: scope },
        include: {
          user: { include: { university: { select: { shortName: true } }, studentProfile: true } },
          content: { select: { title: true, pricingType: true, priceAmount: true, currency: true } },
          payment: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }) : Promise.resolve([]),
      canManageApplications ? prisma.application.findMany({
        where: { content: scope },
        include: {
          user: { include: { university: { select: { shortName: true } }, studentProfile: true } },
          content: { select: { title: true } },
          cvAsset: { select: { id: true, originalName: true, status: true, scanStatus: true } },
        },
        orderBy: { submittedAt: 'desc' },
        take: 500,
      }) : Promise.resolve([]),
      isStaff ? Promise.resolve([]) : prisma.partnership.findMany({
        where: req.auth.user.role === 'PLATFORM_SUPER_ADMIN' ? {} : {
          OR: [{ requesterUniversityId: req.auth.user.universityId }, { partnerUniversityId: req.auth.user.universityId }],
        },
        include: { requesterUniversity: true, partnerUniversity: true },
        orderBy: { requestedAt: 'desc' },
        take: 200,
      }),
      prisma.university.findMany({
        where: req.auth.user.role === 'PLATFORM_SUPER_ADMIN'
          ? {}
          : { id: req.auth.user.universityId },
        include: {
          domains: { where: { isVerified: true, isActive: true }, orderBy: { isPrimary: 'desc' }, take: 1 },
          users: { where: { role: 'UNIVERSITY_ADMIN' }, include: { staffProfile: true }, take: 1 },
          _count: { select: { users: true, contents: true, partnershipsRequested: true, partnershipsReceived: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      canViewReports ? prisma.auditLog.findMany({
        where: scope,
        include: { actor: { include: { studentProfile: true, staffProfile: true } }, university: { select: { shortName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }) : Promise.resolve([]),
      prisma.notification.findMany({
        where: { userId: req.auth.user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    const analyticsScope = req.auth.user.role === 'PLATFORM_SUPER_ADMIN' ? {} : { universityId: req.auth.user.universityId }
    const contentScope = req.auth.user.role === 'PLATFORM_SUPER_ADMIN' ? {} : { universityId: req.auth.user.universityId }
    const [userByRole, userByStatus, contentByStatus, contentByVisibility, registrationByStatus, applicationByStatus, partnershipByStatus, surveyCount, surveyResponseCount, activeSessionCount, sqlInjectionBlockedCount, criticalAuditCount] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], where: analyticsScope, _count: { _all: true } }),
      prisma.user.groupBy({ by: ['status'], where: analyticsScope, _count: { _all: true } }),
      prisma.content.groupBy({ by: ['status'], where: contentScope, _count: { _all: true } }),
      prisma.content.groupBy({ by: ['visibility'], where: contentScope, _count: { _all: true } }),
      prisma.eventRegistration.groupBy({ by: ['status'], where: { content: contentScope }, _count: { _all: true } }),
      prisma.application.groupBy({ by: ['status'], where: { content: contentScope }, _count: { _all: true } }),
      isStaff ? Promise.resolve([]) : prisma.partnership.groupBy({ by: ['status'], where: req.auth.user.role === 'PLATFORM_SUPER_ADMIN' ? {} : { OR: [{ requesterUniversityId: req.auth.user.universityId }, { partnerUniversityId: req.auth.user.universityId }] }, _count: { _all: true } }),
      prisma.survey.count({ where: surveyManagementScope(req.auth.user) }),
      prisma.surveyResponse.count({ where: req.auth.user.role === 'PLATFORM_SUPER_ADMIN' ? {} : { survey: { universityId: req.auth.user.universityId } } }),
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() }, ...(req.auth.user.role === 'PLATFORM_SUPER_ADMIN' ? {} : { user: { universityId: req.auth.user.universityId } }) } }),
      prisma.auditLog.count({ where: { ...scope, action: 'SECURITY_SQL_INJECTION_BLOCKED' } }),
      prisma.auditLog.count({ where: { ...scope, severity: 'CRITICAL' } }),
    ])
    const redisStarted = performance.now()
    const redisHealthy = redisClient ? await checkRedis().then(() => true).catch(() => false) : null
    const redisResponse = Math.max(1, Math.round(performance.now() - redisStarted))
    const memory = process.memoryUsage()
    const realSystemHealth = [
      { service: 'API Server', status: 'OPERATIONAL', response: `${Math.max(1, Math.round(performance.now() - databaseStarted))} ms`, uptime: `${Math.floor(process.uptime())} sec`, detail: `Node ${process.version} · ${os.cpus().length} CPU` },
      { service: 'PostgreSQL', status: 'OPERATIONAL', response: `${databaseResponse} ms`, uptime: 'Connected', detail: `${activeSessionCount} active sessions` },
      { service: 'Redis', status: redisHealthy === null ? 'NOT_CONFIGURED' : redisHealthy ? 'OPERATIONAL' : 'DEGRADED', response: redisHealthy === null ? '—' : `${redisResponse} ms`, uptime: redisHealthy === null ? 'Optional in local' : 'Health checked', detail: redisHealthy === null ? 'REDIS_URL not configured' : 'Rate-limit/cache connectivity' },
      { service: 'Runtime memory', status: 'OPERATIONAL', response: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`, uptime: `${Math.round(memory.rss / 1024 / 1024)} MB RSS`, detail: `${Math.round(memory.heapTotal / 1024 / 1024)} MB heap allocated` },
    ]
    const analytics = {
      generatedAt: new Date().toISOString(),
      source: 'POSTGRESQL_LIVE_AGGREGATES',
      usersByRole: Object.fromEntries(userByRole.map(row => [row.role, row._count._all])),
      usersByStatus: Object.fromEntries(userByStatus.map(row => [row.status, row._count._all])),
      contentByStatus: Object.fromEntries(contentByStatus.map(row => [row.status, row._count._all])),
      contentByVisibility: Object.fromEntries(contentByVisibility.map(row => [row.visibility, row._count._all])),
      registrationsByStatus: Object.fromEntries(registrationByStatus.map(row => [row.status, row._count._all])),
      applicationsByStatus: Object.fromEntries(applicationByStatus.map(row => [row.status, row._count._all])),
      partnershipsByStatus: Object.fromEntries(partnershipByStatus.map(row => [row.status, row._count._all])),
      surveyCount,
      surveyResponseCount,
      security: { activeSessionCount, sqlInjectionBlockedCount, criticalAuditCount },
    }

    const mappedContent = /** @type {Array<Record<string, unknown>>} */ (contents.map(content => ({
      id: content.id,
      title: content.title,
      type: content.type,
      creator: actorName(content.createdBy),
      visibility: content.visibility,
      status: content.status,
      created: dateOnly(content.createdAt),
      closes: dateOnly(content.deadlineAt),
      views: content.viewCount,
      engagement: content.engagementCount,
      university: content.university?.shortName || 'UniNet',
      pricingType: content.pricingType,
      priceAmount: content.priceAmount,
      currency: content.currency,
    })))
    mappedContent.push(...(canManageSurveys ? surveys : []).map(survey => ({
      id: survey.id,
      title: survey.title,
      type: 'SURVEY',
      creator: actorName(survey.createdBy),
      visibility: survey.visibility,
      status: survey.status,
      created: dateOnly(survey.createdAt),
      closes: '—',
      views: survey._count.responses,
      engagement: survey._count.responses,
      university: universities.find(university => university.id === survey.universityId)?.shortName || 'UniNet',
    })))

    res.json({
      role: req.auth.user.role,
      staffContent: mappedContent,
      users: (isStaff ? [] : users).map(user => ({
        id: user.id,
        name: actorName(user),
        email: user.email,
        role: user.role,
        department: user.studentProfile?.department ?? user.staffProfile?.department ?? '—',
        status: user.status,
        joined: dateOnly(user.createdAt),
        lastActive: user.lastLoginAt ? dateOnly(user.lastLoginAt) : '—',
        university: user.university?.shortName || 'UniNet',
        permissions: permissionNames(user),
      })),
      registrations: (canManageRegistrations ? registrations : []).map(registration => ({
        id: registration.id,
        eventId: registration.contentId,
        registrationCode: registration.registrationCode,
        student: actorName(registration.user),
        university: registration.user.university?.shortName || 'UniNet',
        major: registration.user.studentProfile?.major ?? '—',
        event: registration.content.title,
        date: dateOnly(registration.createdAt),
        status: registration.status,
        attendance: registration.attendedAt ? 'ATTENDED' : 'PENDING',
        consent: registration.consentGranted ? 'YES' : 'NO',
        pricingType: registration.content.pricingType,
        priceAmount: registration.content.priceAmount,
        currency: registration.content.currency,
        paymentStatus: registration.payment?.status ?? null,
      })),
      applications: (canManageApplications ? applications : []).map(application => ({
        id: application.id,
        student: actorName(application.user),
        university: application.user.university?.shortName || 'UniNet',
        major: application.user.studentProfile?.major ?? '—',
        opportunity: application.content.title,
        date: dateOnly(application.submittedAt),
        status: application.status,
        cv: application.cvAsset?.status === 'AVAILABLE' && application.cvAsset.scanStatus === 'CLEAN'
          ? `/api/files/${application.cvAsset.id}/download`
          : application.cvUrl ?? '—',
        cvFileName: application.cvAsset?.originalName ?? null,
        consent: application.consentGranted ? 'YES' : 'NO',
      })),
      partnerships: (isStaff ? [] : partnerships).map(partnership => {
        const ownId = req.auth.user.universityId
        const other = ownId === partnership.requesterUniversityId ? partnership.partnerUniversity : partnership.requesterUniversity
        return {
          id: partnership.id,
          university: other.shortName,
          status: partnership.status,
          requestedBy: partnership.requesterUniversity.shortName,
          requested: dateOnly(partnership.requestedAt),
          activated: dateOnly(partnership.activatedAt),
          shared: partnership.sharedContentCount,
        }
      }),
      universities: universities.map(university => ({
        id: university.id,
        name: university.shortName,
        fullName: university.name,
        domain: university.domains[0]?.domain ?? '—',
        admin: actorName(university.users[0]),
        users: university._count.users,
        content: university._count.contents,
        partnerships: university._count.partnershipsRequested + university._count.partnershipsReceived,
        status: university.status,
        created: dateOnly(university.createdAt),
      })),
      auditLogs: (canViewReports ? auditLogs : []).map(log => ({
        id: log.id,
        actor: actorName(log.actor),
        role: log.actor?.role || 'SYSTEM',
        university: log.university?.shortName || 'UniNet',
        action: log.action,
        resource: log.resourceName || log.resourceId || log.resourceType,
        previous: log.previousData == null ? '—' : JSON.stringify(log.previousData),
        next: log.nextData == null ? '—' : JSON.stringify(log.nextData),
        date: log.createdAt.toISOString().replace('T', ' ').slice(0, 16),
        severity: log.severity,
      })),
      notifications: notifications.map(notification => ({
        id: notification.id,
        title: notification.title,
        description: notification.description,
        time: dateOnly(notification.createdAt),
        read: Boolean(notification.readAt),
        actionUrl: notification.actionUrl,
      })),
      analytics,
      systemHealth: realSystemHealth,
      capabilities: {
        canManageRegistrations,
        canManageApplications,
        canManageSurveys,
        canViewReports,
      },
    })
  } catch (error) { next(error) }
})

router.post('/events/:id/attendance/scan', requireIdempotency, async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    const { ticket } = attendanceScanInput.parse(req.body)
    assertPermission(req.auth.user, 'canManageRegistrations', {
      code: 'ATTENDANCE_MANAGE_FORBIDDEN',
      message: 'Арга хэмжээний ирц бүртгэх зөвшөөрөл алга.',
    })
    const payload = verifyEventTicket(ticket)
    if (payload.contentId !== contentId) {
      throw new AppError('QR тасалбар өөр арга хэмжээнд хамаарч байна.', 409, 'EVENT_TICKET_CONTENT_MISMATCH')
    }
    const registration = await prisma.eventRegistration.findUnique({
      where: { id: payload.registrationId },
      include: {
        content: true,
        payment: true,
        user: { include: { studentProfile: true, staffProfile: true, university: { select: { shortName: true } } } },
      },
    })
    if (!registration) throw new AppError('Тасалбарт харгалзах бүртгэл олдсонгүй.', 404, 'EVENT_REGISTRATION_NOT_FOUND')
    assertTenant(req.auth.user, registration.content.universityId)
    if (
      registration.contentId !== payload.contentId
      || registration.userId !== payload.userId
      || registration.registrationCode !== payload.registrationCode
    ) {
      throw new AppError('QR тасалбарын бүртгэлийн мэдээлэл таарахгүй байна.', 409, 'EVENT_TICKET_REGISTRATION_MISMATCH')
    }
    if (registration.status === 'ATTENDED') {
      return res.json({
        attendance: {
          registrationId: registration.id,
          status: registration.status,
          attendedAt: registration.attendedAt?.toISOString() ?? null,
          student: actorName(registration.user),
          university: registration.user.university?.shortName || 'UniNet',
          event: registration.content.title,
          alreadyRecorded: true,
        },
      })
    }
    if (registration.status !== 'CONFIRMED') {
      throw new AppError('Зөвхөн баталгаажсан бүртгэлийн ирцийг бүртгэнэ.', 409, 'ATTENDANCE_STATUS_INVALID')
    }
    if (registration.content.pricingType === 'PAID' && registration.payment?.status !== 'PAID') {
      throw new AppError('Энэ төлбөртэй тасалбарын Stripe төлбөр баталгаажаагүй байна.', 409, 'EVENT_PAYMENT_REQUIRED')
    }
    const attendedAt = new Date()
    const updated = await prisma.$transaction(async tx => {
      const changed = await tx.eventRegistration.updateMany({
        where: { id: registration.id, status: 'CONFIRMED' },
        data: { status: 'ATTENDED', attendedAt },
      })
      if (!changed.count) throw new AppError('Бүртгэлийн төлөв зэрэг өөрчлөгдсөн байна. Дахин уншуулна уу.', 409, 'ATTENDANCE_CONFLICT')
      await audit(req, {
        action: 'EVENT_ATTENDANCE_RECORDED',
        resourceType: 'EVENT_REGISTRATION',
        resourceId: registration.id,
        resourceName: registration.content.title,
        previousData: { status: registration.status },
        nextData: { status: 'ATTENDED', attendedAt: attendedAt.toISOString(), ticketId: payload.jti },
      }, tx)
      await createNotification(tx, {
          userId: registration.userId,
          universityId: registration.content.universityId,
          contentId: registration.contentId,
          type: 'EVENT_ATTENDANCE',
          title: 'Арга хэмжээний ирц бүртгэгдлээ',
          description: registration.content.title,
          actionUrl: '/student/registrations',
      })
      return tx.eventRegistration.findUniqueOrThrow({ where: { id: registration.id } })
    })
    res.json({
      attendance: {
        registrationId: updated.id,
        status: updated.status,
        attendedAt: updated.attendedAt?.toISOString() ?? null,
        student: actorName(registration.user),
        university: registration.user.university?.shortName || 'UniNet',
        event: registration.content.title,
        alreadyRecorded: false,
      },
    })
  } catch (error) { next(error) }
})

router.patch('/notifications/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.auth.user.id, readAt: null },
      data: { readAt: new Date() },
    })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const result = await prisma.notification.updateMany({
      where: { id, userId: req.auth.user.id },
      data: { readAt: new Date() },
    })
    if (!result.count) throw new AppError('Мэдэгдэл олдсонгүй.', 404, 'NOTIFICATION_NOT_FOUND')
    res.json({ ok: true, id })
  } catch (error) { next(error) }
})

router.post('/universities', requireIdempotency, async (req, res, next) => {
  try {
    if (req.auth.user.role !== 'PLATFORM_SUPER_ADMIN') throw new AppError('Зөвхөн Platform Super Admin сургууль үүсгэнэ.', 403, 'FORBIDDEN')
    const input = universityInput.parse(req.body)
    res.status(201).json(await universityService.create(
      req.auth.user,
      { ...input, status: 'PENDING' },
      { ipAddress: req.ip, userAgent: req.get('user-agent') },
    ))
  } catch (error) { next(error) }
})

router.patch('/universities/:id/status', async (req, res, next) => {
  try {
    if (req.auth.user.role !== 'PLATFORM_SUPER_ADMIN') throw new AppError('Зөвхөн Platform Super Admin сургуулийн төлөв өөрчилнө.', 403, 'FORBIDDEN')
    const input = universityStatusInput.parse(req.body)
    res.json(await universityService.updateStatus(
      req.auth.user,
      req.params.id,
      { ...input, reason: input.reason ?? 'Platform university status update' },
      { ipAddress: req.ip, userAgent: req.get('user-agent') },
    ))
  } catch (error) { next(error) }
})

router.post('/content', requireIdempotency, async (req, res, next) => {
  try {
    assertPermission(req.auth.user, 'canCreateContent', {
      code: 'CONTENT_CREATE_FORBIDDEN',
      message: 'Контент үүсгэх зөвшөөрөл алга.',
    })
    let input = contentInput.parse(req.body)
    input = { ...input, ...normalizedPricing(input) }
    if (req.auth.user.role === 'STAFF' && input.type === 'EVENT' && input.status !== 'DRAFT') {
      input = { ...input, status: 'PENDING_APPROVAL' }
    }
    if (input.status === 'PUBLISHED') {
      assertPermission(req.auth.user, 'canPublish', {
        code: 'CONTENT_PUBLISH_FORBIDDEN',
        message: 'Контент шууд нийтлэх зөвшөөрөл алга.',
      })
    }
    if (req.auth.user.role !== 'PLATFORM_SUPER_ADMIN' && !req.auth.user.universityId) {
      throw new AppError('Хэрэглэгч university workspace-т холбогдоогүй.', 422, 'UNIVERSITY_REQUIRED')
    }
    const content = await prisma.$transaction(async tx => {
      const created = await tx.content.create({
        data: /** @type {any} */ ({
          ...input,
          slug: slugify(input.title),
          universityId: req.auth.user.universityId,
          createdById: req.auth.user.id,
          publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
        }),
      })
      await tx.contentStatusHistory.create({
        data: { contentId: created.id, actorId: req.auth.user.id, toStatus: created.status, reason: 'Initial state' },
      })
      await audit(req, {
        action: 'CONTENT_CREATED', resourceType: 'CONTENT', resourceId: created.id,
        resourceName: created.title, nextData: { status: created.status, version: created.version },
      }, tx)
      return created
    })
    await notifyApprovers(content, req.auth.user.id)
    if (content.status === 'PUBLISHED') await notifyPublishedContent(content)
    res.status(201).json({ content })
  } catch (error) { next(error) }
})

router.get('/content/:id', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const content = await prisma.content.findUnique({
      where: { id },
      include: {
        statusHistory: {
          include: { actor: { select: { email: true, studentProfile: true, staffProfile: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { registrations: true, applications: true, savedBy: true } },
      },
    })
    if (!content) throw new AppError('Контент олдсонгүй.', 404, 'CONTENT_NOT_FOUND')
    assertContentManagement(req.auth.user, content, 'read')
    res.json({ content })
  } catch (error) { next(error) }
})

router.patch('/content/:id', async (req, res, next) => {
  try {
    assertPermission(req.auth.user, 'canCreateContent', {
      code: 'CONTENT_UPDATE_FORBIDDEN',
      message: 'Контент засах зөвшөөрөл алга.',
    })
    const id = uuid.parse(req.params.id)
    const input = contentUpdateInput.parse(req.body)
    const existing = await prisma.content.findUnique({
      where: { id },
      include: { _count: { select: { registrations: true, applications: true } } },
    })
    if (!existing) throw new AppError('Контент олдсонгүй.', 404, 'CONTENT_NOT_FOUND')
    assertContentManagement(req.auth.user, existing, 'edit')
    if (!['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'].includes(existing.status)) {
      throw new AppError('Энэ төлөвтэй контентыг засах боломжгүй.', 409, 'CONTENT_NOT_EDITABLE')
    }
    if (input.type && input.type !== existing.type && (existing._count.registrations || existing._count.applications)) {
      throw new AppError('Бүртгэл эсвэл өргөдөлтэй контентын төрлийг сольж болохгүй.', 409, 'CONTENT_TYPE_LOCKED')
    }
    const mergedPricing = normalizedPricing({
      type: input.type ?? existing.type,
      pricingType: input.pricingType ?? existing.pricingType,
      priceAmount: input.priceAmount ?? existing.priceAmount,
      currency: input.currency ?? existing.currency,
    }, existing.type)
    const mergedStartsAt = input.startsAt ?? existing.startsAt
    const mergedEndsAt = input.endsAt ?? existing.endsAt
    if (mergedStartsAt && mergedEndsAt && mergedEndsAt <= mergedStartsAt) {
      throw new AppError('Дуусах хугацаа эхлэх хугацаанаас хойш байна.', 422, 'CONTENT_DATE_INVALID')
    }
    const { version, ...changes } = input
    Object.assign(changes, mergedPricing)
    const content = await prisma.$transaction(async tx => {
      const result = await tx.content.updateMany({
        where: { id, version },
        data: /** @type {any} */ ({ ...changes, version: { increment: 1 } }),
      })
      if (!result.count) throw new AppError('Контент өөр хэрэглэгчээр шинэчлэгдсэн байна. Дахин ачаална уу.', 409, 'CONTENT_VERSION_CONFLICT')
      const updated = await tx.content.findUniqueOrThrow({ where: { id } })
      await audit(req, {
        action: 'CONTENT_UPDATED', resourceType: 'CONTENT', resourceId: id, resourceName: updated.title,
        previousData: { version: existing.version }, nextData: { version: updated.version, fields: Object.keys(changes) },
      }, tx)
      return updated
    })
    res.json({ content })
  } catch (error) { next(error) }
})

router.delete('/content/:id', async (req, res, next) => {
  try {
    assertPermission(req.auth.user, 'canCreateContent', {
      code: 'CONTENT_DELETE_FORBIDDEN',
      message: 'Контент устгах зөвшөөрөл алга.',
    })
    const id = uuid.parse(req.params.id)
    const existing = await prisma.content.findUnique({
      where: { id },
      include: { _count: { select: { registrations: true, applications: true, savedBy: true } } },
    })
    if (!existing) throw new AppError('Контент олдсонгүй.', 404, 'CONTENT_NOT_FOUND')
    assertContentManagement(req.auth.user, existing, 'delete')
    if (!['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'].includes(existing.status)) {
      throw new AppError('Нийтлэгдсэн эсвэл батлагдсан контентыг устгахын оронд архивлана уу.', 409, 'CONTENT_NOT_DELETABLE')
    }
    if (existing._count.registrations || existing._count.applications || existing._count.savedBy) {
      throw new AppError('Хэрэглэгчийн өгөгдөлтэй контентыг устгаж болохгүй.', 409, 'CONTENT_HAS_ACTIVITY')
    }
    await prisma.$transaction(async tx => {
      await audit(req, {
        action: 'CONTENT_DELETED', resourceType: 'CONTENT', resourceId: id, resourceName: existing.title,
        previousData: { status: existing.status, version: existing.version }, severity: 'MEDIUM',
      }, tx)
      await tx.content.delete({ where: { id } })
    })
    res.status(204).end()
  } catch (error) { next(error) }
})

router.patch('/content/:id/status', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const input = statusInput.parse(req.body)
    const existing = await prisma.content.findUnique({ where: { id } })
    if (!existing) throw new AppError('Контент олдсонгүй.', 404, 'CONTENT_NOT_FOUND')
    assertContentManagement(req.auth.user, existing, 'status', input.status)
    const updated = await changeContentStatus(req, existing, input.status, input.reason)
    if (updated.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') await notifyPublishedContent(updated)
    res.json({ content: updated })
  } catch (error) { next(error) }
})

router.post('/action', requireIdempotency, async (req, res, next) => {
  try {
    const input = actionInput.parse(req.body)
    const action = input.action.toUpperCase()
    if (!input.id || !input.resourceType) throw new AppError('Үйлдлийн target id болон resourceType шаардлагатай.', 422, 'ACTION_TARGET_REQUIRED')

    if (input.resourceType === 'CONTENT') {
      const requestedStatus = ({ APPROVE: 'APPROVED', PUBLISH: 'PUBLISHED', REJECT: 'REJECTED', REQUEST_CHANGES: 'CHANGES_REQUESTED', ARCHIVE: 'ARCHIVED' })[action]
      if (!requestedStatus) throw new AppError('Дэмжигдээгүй контентын үйлдэл.', 422, 'UNSUPPORTED_ACTION')
      const content = await prisma.content.findUnique({ where: { id: input.id } })
      if (!content) throw new AppError('Контент олдсонгүй.', 404, 'CONTENT_NOT_FOUND')
      const status = action === 'APPROVE' && content.type === 'EVENT' ? 'PUBLISHED' : requestedStatus
      assertContentManagement(req.auth.user, content, 'status', status)
      const updated = await changeContentStatus(req, content, status, input.reason)
      if (status === 'PUBLISHED' && content.status !== 'PUBLISHED') await notifyPublishedContent(updated)
      return res.json({ ok: true, content: updated })
    }

    if (input.resourceType === 'APPLICATION') {
      assertPermission(req.auth.user, 'canManageApplications', {
        code: 'APPLICATION_MANAGE_FORBIDDEN',
        message: 'Өргөдөл удирдах зөвшөөрөл алга.',
      })
      const status = input.value?.toUpperCase() || ({ REVIEW: 'UNDER_REVIEW', SHORTLIST: 'SHORTLISTED', ACCEPT: 'ACCEPTED', REJECT: 'REJECTED' })[action]
      if (!['UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'].includes(status)) throw new AppError('Өргөдлийн төлөв буруу.', 422, 'INVALID_APPLICATION_STATUS')
      const application = await prisma.application.findUnique({ where: { id: input.id }, include: { content: true } })
      if (!application) throw new AppError('Өргөдөл олдсонгүй.', 404, 'APPLICATION_NOT_FOUND')
      assertManagedContentAccess(req.auth.user, application.content, 'canManageApplications')
      assertApplicationTransition(application.status, status)
      const updated = await prisma.$transaction(async tx => {
        const changed = await tx.application.update({ where: { id: application.id }, data: { status, reviewedAt: new Date() } })
        await tx.applicationStatusHistory.create({
          data: { applicationId: application.id, actorId: req.auth.user.id, fromStatus: application.status, toStatus: status, reason: input.reason },
        })
        await createNotification(tx, {
            userId: application.userId,
            universityId: application.content.universityId,
            contentId: application.contentId,
            type: 'APPLICATION_STATUS',
            title: 'Өргөдлийн төлөв шинэчлэгдлээ',
            description: `${application.content.title}: ${status}`,
            actionUrl: '/student/applications',
        })
        await audit(req, {
          action: `APPLICATION_${status}`, resourceType: 'APPLICATION', resourceId: application.id,
          resourceName: application.content.title, previousData: { status: application.status }, nextData: { status, reason: input.reason },
        }, tx)
        return changed
      })
      return res.json({ ok: true, application: updated })
    }

    if (input.resourceType === 'PARTNERSHIP') {
      if (!['UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'].includes(req.auth.user.role)) throw new AppError('Түншлэлийн эрх хүрэлцэхгүй.', 403, 'FORBIDDEN')
      const status = ({ APPROVE: 'ACTIVE', ACCEPT: 'ACTIVE', REJECT: 'REJECTED', END: 'ENDED' })[action]
      if (!status) throw new AppError('Түншлэлийн үйлдэл буруу.', 422, 'UNSUPPORTED_ACTION')
      const partnership = await prisma.partnership.findUnique({ where: { id: input.id } })
      if (!partnership) throw new AppError('Түншлэл олдсонгүй.', 404, 'PARTNERSHIP_NOT_FOUND')
      if (req.auth.user.role !== 'PLATFORM_SUPER_ADMIN' && ![partnership.requesterUniversityId, partnership.partnerUniversityId].includes(req.auth.user.universityId)) throw new AppError('Түншлэлд хандах эрхгүй.', 403, 'TENANT_ACCESS_DENIED')
      const updated = await prisma.partnership.update({ where: { id: input.id }, data: { status, activatedAt: status === 'ACTIVE' ? new Date() : undefined, endedAt: status === 'ENDED' ? new Date() : undefined } })
      await audit(req, { action: `PARTNERSHIP_${status}`, resourceType: 'PARTNERSHIP', resourceId: input.id, previousData: { status: partnership.status }, nextData: { status } })
      return res.json({ ok: true, partnership: updated })
    }

    if (input.resourceType === 'USER') {
      if (!['UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'].includes(req.auth.user.role)) throw new AppError('Хэрэглэгч удирдах эрх хүрэлцэхгүй.', 403, 'FORBIDDEN')
      const status = ({ ACTIVATE: 'ACTIVE', SUSPEND: 'SUSPENDED', DEACTIVATE: 'DEACTIVATED', REJECT: 'REJECTED' })[action]
      if (!status) throw new AppError('Хэрэглэгчийн үйлдэл буруу.', 422, 'UNSUPPORTED_ACTION')
      const user = await prisma.user.findUnique({ where: { id: input.id } })
      if (!user) throw new AppError('Хэрэглэгч олдсонгүй.', 404, 'USER_NOT_FOUND')
      assertTenant(req.auth.user, user.universityId)
      const updated = await prisma.user.update({ where: { id: user.id }, data: { status } })
      await audit(req, { action: `USER_${status}`, resourceType: 'USER', resourceId: user.id, resourceName: user.email, previousData: { status: user.status }, nextData: { status }, severity: status === 'SUSPENDED' ? 'HIGH' : 'MEDIUM' })
      return res.json({ ok: true, user: { id: updated.id, status: updated.status } })
    }

    throw new AppError('Дэмжигдээгүй үйлдэл.', 422, 'UNSUPPORTED_ACTION')
  } catch (error) { next(error) }
})

export { assertApplicationTransition, assertContentTransition, router as operationsRouter }
