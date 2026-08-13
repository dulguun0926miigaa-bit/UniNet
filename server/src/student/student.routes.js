import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/authenticate.js'
import { AppError } from '../utils/app-error.js'
import { studentMutationLimiter } from '../middleware/rate-limits.js'
import { optionalHttpUrl } from '../validation/safe-url.js'
import { createEventTicket, hashEventTicket } from '../tickets/event-ticket.js'
import { requireIdempotency } from '../middleware/idempotency.js'
import { createNotification } from '../notifications/notification.service.js'
import { emailService } from '../auth/email.service.js'
import { publishedSurveyAudienceScope } from '../authorization/policy.js'
import { createEventCheckoutSession, retrieveCheckoutSession } from '../payments/stripe.service.js'
import { activeContentWhere, eventTicketExpiresAt } from '../utils/event-expiry.js'

const router = Router()
const uuid = z.string().uuid()
const applicationInput = z.object({
  cvAssetId: z.string().uuid().optional(),
  cvUrl: optionalHttpUrl.optional(),
  coverNote: z.string().trim().max(4000).optional().default(''),
  consentGranted: z.literal(true),
}).strict()
const eventRegistrationInput = z.object({ consentGranted: z.literal(true) }).strict()

const seatHoldingRegistrationStatuses = /** @type {import('@prisma/client').RegistrationStatus[]} */ (['PAYMENT_PENDING', 'CONFIRMED', 'ATTENDED'])
const dateOnly = value => value ? value.toISOString().slice(0, 10).replaceAll('-', '.') : null
const timeOnly = value => value ? value.toISOString().slice(11, 16) : null

/**
 * @template T
 * @param {(transaction: import('@prisma/client').Prisma.TransactionClient) => Promise<T>} work
 * @param {number} [maximumAttempts]
 * @returns {Promise<T>}
 */
async function withSerializableRetry(work, maximumAttempts = 3) {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: 'Serializable' })
    } catch (error) {
      const isRetryable = error && typeof error === 'object' && 'code' in error && error.code === 'P2034'
      if (!isRetryable || attempt === maximumAttempts) throw error
    }
  }
  throw new AppError('Зэрэг хүсэлтүүдийг боловсруулж чадсангүй. Дахин оролдоно уу.', 409, 'TRANSACTION_RETRY_EXHAUSTED')
}

function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60000))
  if (minutes < 1) return 'Одоо'
  if (minutes < 60) return `${minutes} минутын өмнө`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} цагийн өмнө`
  return `${Math.floor(hours / 24)} хоногийн өмнө`
}

function serializeContent(item) {
  const details = item.details && typeof item.details === 'object' && !Array.isArray(item.details)
    ? item.details
    : {}
  const occupied = item.registrations?.filter(registration => seatHoldingRegistrationStatuses.includes(registration.status)).length ?? 0
  return {
    ...details,
    id: item.id,
    type: item.type,
    title: item.title,
    shortDescription: item.shortDescription,
    description: item.description,
    university: item.university?.shortName || 'UniNet',
    universityId: item.universityId,
    visibility: item.visibility,
    category: item.category,
    organization: item.organization,
    location: item.location,
    mode: item.mode,
    date: dateOnly(item.startsAt),
    time: timeOnly(item.startsAt),
    startsAt: item.startsAt?.toISOString() ?? null,
    endsAt: item.endsAt?.toISOString() ?? null,
    deadline: dateOnly(item.deadlineAt),
    capacity: item.capacity,
    pricingType: item.pricingType || 'FREE',
    priceAmount: item.priceAmount || 0,
    currency: item.currency || 'MNT',
    remainingSeats: item.capacity == null ? null : Math.max(0, item.capacity - occupied),
    isSaved: Boolean(item.savedBy?.length),
    status: item.status === 'PUBLISHED' ? 'ACTIVE' : item.status,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    popular: item.viewCount,
    views: item.viewCount,
    engagement: item.engagementCount,
  }
}

/** @returns {Promise<import('@prisma/client').Prisma.ContentWhereInput>} */
async function visibleContentFilter(user) {
  if (!user.universityId) return { status: 'PUBLISHED', visibility: 'PUBLIC', AND: [activeContentWhere()] }
  const partnerships = await prisma.partnership.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { requesterUniversityId: user.universityId },
        { partnerUniversityId: user.universityId },
      ],
    },
    select: { requesterUniversityId: true, partnerUniversityId: true },
  })
  const partnerIds = partnerships.map(partnership => (
    partnership.requesterUniversityId === user.universityId
      ? partnership.partnerUniversityId
      : partnership.requesterUniversityId
  ))
  return /** @type {import('@prisma/client').Prisma.ContentWhereInput} */ ({
    status: 'PUBLISHED',
    AND: [
      {
        OR: [
          { visibility: { in: ['PUBLIC', 'NETWORK'] } },
          { universityId: user.universityId },
          ...(partnerIds.length ? [{ visibility: 'PARTNERS', universityId: { in: partnerIds } }] : []),
        ],
      },
      activeContentWhere(),
    ],
  })
}

async function findVisibleContent(user, contentId) {
  const content = await prisma.content.findFirst({
    where: { id: contentId, ...(await visibleContentFilter(user)) },
    include: { university: { select: { name: true, shortName: true } } },
  })
  if (!content) throw new AppError('Контент олдсонгүй эсвэл харах эрхгүй байна.', 404, 'CONTENT_NOT_FOUND')
  return content
}

function consentRecordData(userId, content, kind, action, resourceId, options = {}) {
  const isEvent = kind === 'EVENT_REGISTRATION'
  return {
    userId,
    recipientUniversityId: content.universityId,
    resourceType: kind,
    resourceId,
    ...(options.supersedesId ? { supersedesId: options.supersedesId } : {}),
    recipientName: content.organization || content.university?.shortName || content.university?.name || 'UniNet',
    purpose: `${kind}: ${content.title}`,
    dataFields: isEvent
      ? ['firstName', 'lastName', 'email', 'university', 'major']
      : ['firstName', 'lastName', 'email', 'university', 'major', 'cvUrl', 'coverNote'],
    action,
    context: { contentId: content.id, ...(options.context ?? {}) },
    ...(action === 'REVOKED' ? {
      revokedAt: options.revokedAt ?? new Date(),
      revokedReason: options.reason ?? 'User cancelled the linked resource',
    } : {}),
  }
}

async function recordConsentRevocation(tx, userId, content, kind, resourceId, reason) {
  const now = new Date()
  const grant = await tx.consentRecord.findFirst({
    where: { userId, resourceType: kind, resourceId, action: 'GRANTED', revokedAt: null },
    orderBy: { grantedAt: 'desc' },
  })
  if (grant) {
    await tx.consentRecord.update({
      where: { id: grant.id },
      data: { revokedAt: now, revokedReason: reason },
    })
  }
  await tx.consentRecord.create({
    data: consentRecordData(userId, content, kind, 'REVOKED', resourceId, {
      supersedesId: grant?.id,
      revokedAt: now,
      reason,
      context: { downstreamOutcome: kind === 'EVENT_REGISTRATION' ? 'EVENT_REGISTRATION_CANCELLED' : 'APPLICATION_WITHDRAWN_AND_PII_CLEARED' },
    }),
  })
}

router.use(authenticate, requireRole('STUDENT'))

router.get('/bootstrap', async (req, res, next) => {
  try {
    const userId = req.auth.user.id
    const surveyAudience = await publishedSurveyAudienceScope(prisma, req.auth.user)
    const [universities, contents, surveys, registrations, applications, notifications, consentHistory, completedSurveyCount, profileAssets] = await Promise.all([
      prisma.university.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true, name: true, shortName: true, slug: true, description: true,
          domains: { where: { isActive: true, isVerified: true }, orderBy: { isPrimary: 'desc' }, take: 1, select: { domain: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.content.findMany({
        where: await visibleContentFilter(req.auth.user),
        include: {
          university: { select: { shortName: true } },
          savedBy: { where: { userId }, select: { id: true } },
          registrations: { where: { status: { in: seatHoldingRegistrationStatuses } }, select: { status: true } },
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      prisma.survey.findMany({
        where: {
          status: 'PUBLISHED',
          ...surveyAudience,
        },
        include: { university: { select: { shortName: true } }, _count: { select: { responses: true } } },
        orderBy: { publishedAt: 'desc' },
        take: 30,
      }),
      prisma.eventRegistration.findMany({
        where: {
          userId,
          status: { not: 'CANCELLED' },
          content: activeContentWhere(),
        },
        include: { content: { include: { university: { select: { shortName: true } } } }, payment: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.application.findMany({
        where: { userId, status: { not: 'WITHDRAWN' } },
        include: {
          content: { include: { university: { select: { shortName: true } } } },
          statusHistory: { orderBy: { createdAt: 'asc' }, select: { id: true, fromStatus: true, toStatus: true, reason: true, createdAt: true } },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.notification.findMany({
        where: { userId },
        include: { university: { select: { shortName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.consentRecord.findMany({
        where: { userId },
        orderBy: { grantedAt: 'desc' },
        take: 100,
      }),
      prisma.surveyResponse.count({ where: { userId } }),
      prisma.studentProfile.findUnique({
        where: { userId },
        select: {
          avatarAsset: { select: { id: true, originalName: true, detectedMime: true, sizeBytes: true, status: true, scanStatus: true } },
          cvAsset: { select: { id: true, originalName: true, detectedMime: true, sizeBytes: true, status: true, scanStatus: true } },
        },
      }),
    ])

    const profile = req.auth.user.studentProfile
    res.json({
      studentProfile: {
        id: profile?.id ?? userId,
        firstName: profile?.firstName ?? '',
        lastName: profile?.lastName ?? '',
        email: req.auth.user.email,
        phone: profile?.phone ?? '',
        university: req.auth.user.university?.shortName ?? 'UniNet',
        universityId: req.auth.user.universityId,
        department: profile?.department ?? '',
        major: profile?.major ?? '',
        studentId: profile?.studentId ?? '',
        enrollmentYear: profile?.enrollmentYear ?? '',
        graduationYear: profile?.graduationYear ?? '',
        about: profile?.bio ?? '',
        cv: profile?.cvUrl ?? '',
        cvFile: profileAssets?.cvAsset?.status === 'AVAILABLE' && profileAssets.cvAsset.scanStatus === 'CLEAN'
          ? {
            id: profileAssets.cvAsset.id,
            originalName: profileAssets.cvAsset.originalName,
            detectedMime: profileAssets.cvAsset.detectedMime,
            sizeBytes: Number(profileAssets.cvAsset.sizeBytes),
            downloadUrl: `/api/files/${profileAssets.cvAsset.id}/download`,
          }
          : null,
        avatarFile: profileAssets?.avatarAsset?.status === 'AVAILABLE' && profileAssets.avatarAsset.scanStatus === 'CLEAN'
          ? {
            id: profileAssets.avatarAsset.id,
            originalName: profileAssets.avatarAsset.originalName,
            detectedMime: profileAssets.avatarAsset.detectedMime,
            sizeBytes: Number(profileAssets.avatarAsset.sizeBytes),
            downloadUrl: `/api/files/${profileAssets.avatarAsset.id}/download`,
          }
          : null,
        portfolio: profile?.portfolioUrl ?? '',
        github: profile?.githubUrl ?? '',
        linkedin: profile?.linkedinUrl ?? '',
        interests: [],
        skills: [],
        completion: [profile?.firstName, profile?.lastName, profile?.major, profile?.phone, profile?.bio, profile?.cvUrl || profileAssets?.cvAsset]
          .filter(Boolean).length * 16,
      },
      universities: universities.map(university => ({
        id: university.id,
        name: university.shortName,
        fullName: university.name,
        slug: university.slug,
        domain: university.domains[0]?.domain ?? '',
        description: university.description ?? '',
      })),
      contentItems: [
        ...surveys.map(survey => ({
          id: survey.id,
          type: 'SURVEY',
          title: survey.title,
          shortDescription: survey.description,
          description: survey.description,
          questions: survey.questions,
          university: survey.university?.shortName || 'UniNet',
          visibility: survey.universityId ? 'PRIVATE' : 'NETWORK',
          status: 'ACTIVE',
          publishedAt: survey.publishedAt.toISOString(),
          responseCount: survey._count.responses,
          isSaved: false,
        })),
        ...contents.map(serializeContent),
      ],
      registrations: registrations.map(registration => ({
        id: registration.id,
        eventId: registration.contentId,
        title: registration.content.title,
        university: registration.content.university?.shortName || 'UniNet',
        date: dateOnly(registration.content.startsAt),
        time: timeOnly(registration.content.startsAt),
        location: registration.content.location,
        status: registration.status,
        attendance: registration.status === 'ATTENDED' ? 'Оролцсон' : 'Хүлээгдэж байна',
        waitlistPosition: registration.waitlistPosition,
        registrationId: registration.registrationCode,
        pricingType: registration.content.pricingType || 'FREE',
        priceAmount: registration.content.priceAmount || 0,
        currency: registration.content.currency || 'MNT',
        paymentStatus: registration.payment?.status || null,
        startsAt: registration.content.startsAt?.toISOString() ?? null,
        endsAt: registration.content.endsAt?.toISOString() ?? null,
        ticketExpiresAt: eventTicketExpiresAt(registration.content)?.toISOString() ?? null,
      })),
      applications: applications.map(application => ({
        id: application.id,
        opportunityId: application.contentId,
        kind: application.content.type,
        title: application.content.title,
        organization: application.content.organization,
        university: application.content.university?.shortName || 'UniNet',
        appliedAt: dateOnly(application.submittedAt),
        deadline: dateOnly(application.content.deadlineAt),
        status: application.status,
        cv: application.cvUrl ?? '',
        cvAssetId: application.cvAssetId,
        coverNote: application.coverNote ?? '',
        timeline: application.statusHistory.map(history => ({
          id: history.id,
          fromStatus: history.fromStatus,
          status: history.toStatus,
          reason: history.reason,
          date: history.createdAt.toISOString(),
        })),
      })),
      notifications: notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        description: notification.description,
        time: relativeTime(notification.createdAt),
        read: Boolean(notification.readAt),
        university: notification.university?.shortName || 'UniNet',
        actionUrl: notification.actionUrl,
      })),
      consentHistory: consentHistory.map(record => ({
        id: record.id,
        action: record.purpose,
        fields: Array.isArray(record.dataFields) ? record.dataFields.join(', ') : String(record.dataFields),
        date: dateOnly(record.grantedAt),
        recipient: record.recipientName,
      })),
      completedSurveyCount,
    })
  } catch (error) { next(error) }
})

router.post('/content/:id/save', studentMutationLimiter, async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    await findVisibleContent(req.auth.user, contentId)
    const saved = await prisma.savedContent.upsert({
      where: { userId_contentId: { userId: req.auth.user.id, contentId } },
      update: {},
      create: { userId: req.auth.user.id, contentId },
    })
    res.status(201).json({ saved, isSaved: true })
  } catch (error) { next(error) }
})

router.delete('/content/:id/save', studentMutationLimiter, async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    await prisma.savedContent.deleteMany({ where: { userId: req.auth.user.id, contentId } })
    res.json({ isSaved: false })
  } catch (error) { next(error) }
})

router.post('/events/:id/registration', studentMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    const input = eventRegistrationInput.parse(req.body ?? {})
    const visible = await findVisibleContent(req.auth.user, contentId)
    if (visible.type !== 'EVENT') throw new AppError('Энэ контент арга хэмжээ биш байна.', 422, 'NOT_AN_EVENT')
    if (visible.pricingType === 'PAID') throw new AppError('Төлбөртэй арга хэмжээний тасалбарыг Stripe Checkout-оор авна уу.', 409, 'PAID_EVENT_CHECKOUT_REQUIRED')
    if (visible.deadlineAt && visible.deadlineAt < new Date()) throw new AppError('Бүртгэлийн хугацаа дууссан байна.', 409, 'REGISTRATION_CLOSED')

    const registration = await withSerializableRetry(async tx => {
      const existing = await tx.eventRegistration.findUnique({ where: { userId_contentId: { userId: req.auth.user.id, contentId } } })
      if (existing && existing.status !== 'CANCELLED') {
        throw new AppError('Та энэ арга хэмжээнд бүртгүүлсэн байна.', 409, 'EVENT_ALREADY_REGISTERED')
      }
      const confirmedCount = await tx.eventRegistration.count({
        where: { contentId, status: { in: seatHoldingRegistrationStatuses } },
      })
      const waitlistedCount = await tx.eventRegistration.count({ where: { contentId, status: 'WAITLISTED' } })
      const status = visible.capacity == null || confirmedCount < visible.capacity ? 'CONFIRMED' : 'WAITLISTED'
      const savedRegistration = await tx.eventRegistration.upsert({
        where: { userId_contentId: { userId: req.auth.user.id, contentId } },
        update: {
          status,
          consentGranted: input.consentGranted,
          waitlistPosition: status === 'WAITLISTED' ? waitlistedCount + 1 : null,
          cancelledAt: null,
        },
        create: {
          userId: req.auth.user.id,
          contentId,
          status,
          consentGranted: input.consentGranted,
          waitlistPosition: status === 'WAITLISTED' ? waitlistedCount + 1 : null,
          registrationCode: `UNI-${randomBytes(16).toString('hex').toUpperCase()}`,
        },
      })
      await tx.consentRecord.create({
        data: consentRecordData(req.auth.user.id, visible, 'EVENT_REGISTRATION', 'GRANTED', savedRegistration.id),
      })
      await tx.auditLog.create({
        data: {
          actorId: req.auth.user.id,
          universityId: req.auth.user.universityId,
          action: existing ? 'EVENT_REGISTRATION_REACTIVATED' : 'EVENT_REGISTRATION_CREATED',
          resourceType: 'EVENT_REGISTRATION',
          resourceId: savedRegistration.id,
          resourceName: visible.title,
          previousData: existing ? { status: existing.status } : null,
          nextData: { status, waitlistPosition: savedRegistration.waitlistPosition },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      })
      return savedRegistration
    })
    res.status(201).json({
      id: registration.id,
      status: registration.status,
      registrationId: registration.registrationCode,
      waitlistPosition: registration.waitlistPosition,
    })
  } catch (error) { next(error) }
})

router.post('/events/:id/checkout', studentMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    const input = eventRegistrationInput.parse(req.body ?? {})
    const visible = await findVisibleContent(req.auth.user, contentId)
    if (visible.type !== 'EVENT') throw new AppError('Энэ контент арга хэмжээ биш байна.', 422, 'NOT_AN_EVENT')
    if (visible.pricingType !== 'PAID') throw new AppError('Энэ арга хэмжээ үнэгүй байна. Энгийн тасалбарын бүртгэл ашиглана уу.', 409, 'EVENT_NOT_PAID')
    if (visible.deadlineAt && visible.deadlineAt < new Date()) throw new AppError('Бүртгэлийн хугацаа дууссан байна.', 409, 'REGISTRATION_CLOSED')
    if (!Number.isInteger(visible.priceAmount) || visible.priceAmount <= 0) throw new AppError('Арга хэмжээний төлбөрийн үнэ буруу байна.', 422, 'EVENT_PRICE_INVALID')

    const prepared = await withSerializableRetry(async tx => {
      const existing = await tx.eventRegistration.findUnique({
        where: { userId_contentId: { userId: req.auth.user.id, contentId } },
        include: { payment: true },
      })
      if (existing?.payment?.status === 'PAID') {
        return { alreadyPaid: true, registration: existing, payment: existing.payment }
      }
      if (existing?.payment?.status === 'PENDING' && existing.payment.providerSessionId) {
        return { pendingExisting: true, registration: existing, payment: existing.payment }
      }
      const heldCount = await tx.eventRegistration.count({ where: { contentId, status: { in: seatHoldingRegistrationStatuses } } })
      const waitlistedCount = await tx.eventRegistration.count({ where: { contentId, status: 'WAITLISTED' } })
      const existingHoldsSeat = existing && seatHoldingRegistrationStatuses.includes(existing.status)
      if (visible.capacity != null && heldCount >= visible.capacity && !existingHoldsSeat) {
        const waitlisted = await tx.eventRegistration.upsert({
          where: { userId_contentId: { userId: req.auth.user.id, contentId } },
          update: { status: 'WAITLISTED', waitlistPosition: existing?.waitlistPosition || waitlistedCount + 1, consentGranted: input.consentGranted, cancelledAt: null },
          create: { userId: req.auth.user.id, contentId, status: 'WAITLISTED', waitlistPosition: waitlistedCount + 1, consentGranted: input.consentGranted, registrationCode: `UNI-${randomBytes(16).toString('hex').toUpperCase()}` },
        })
        return { waitlisted: true, registration: waitlisted }
      }
      const registration = await tx.eventRegistration.upsert({
        where: { userId_contentId: { userId: req.auth.user.id, contentId } },
        update: { status: 'PAYMENT_PENDING', waitlistPosition: null, consentGranted: input.consentGranted, cancelledAt: null },
        create: { userId: req.auth.user.id, contentId, status: 'PAYMENT_PENDING', consentGranted: input.consentGranted, registrationCode: `UNI-${randomBytes(16).toString('hex').toUpperCase()}` },
      })
      await tx.consentRecord.create({ data: consentRecordData(req.auth.user.id, visible, 'EVENT_REGISTRATION', 'GRANTED', registration.id) })
      if (existing?.payment && ['FAILED', 'CANCELED'].includes(existing.payment.status)) await tx.payment.delete({ where: { id: existing.payment.id } })
      const payment = await tx.payment.create({
        data: { userId: req.auth.user.id, contentId, registrationId: registration.id, provider: 'STRIPE', amount: visible.priceAmount, currency: visible.currency || 'MNT', status: 'PENDING' },
      })
      await tx.auditLog.create({
        data: { actorId: req.auth.user.id, universityId: req.auth.user.universityId, action: 'STRIPE_CHECKOUT_STARTED', resourceType: 'PAYMENT', resourceId: payment.id, resourceName: visible.title, nextData: { amount: payment.amount, currency: payment.currency }, ipAddress: req.ip, userAgent: req.get('user-agent') },
      })
      return { registration, payment }
    })

    if (prepared.waitlisted) return res.status(201).json({ status: 'WAITLISTED', registrationId: prepared.registration.registrationCode, waitlistPosition: prepared.registration.waitlistPosition })
    if (prepared.alreadyPaid) return res.json({ status: 'PAID', paymentStatus: 'PAID', eventId: contentId, ticketAvailable: true })
    if (prepared.pendingExisting) {
      const session = await retrieveCheckoutSession(prepared.payment.providerSessionId)
      if (session.payment_status === 'paid') {
        return res.json({ status: 'PAYMENT_PENDING', paymentStatus: 'PENDING', checkoutUrl: session.url || null, awaitingWebhook: true })
      }
      if (session.status === 'open' && session.url) {
        return res.json({ status: 'PAYMENT_PENDING', paymentStatus: 'PENDING', checkoutUrl: session.url, resumed: true })
      }
      await prisma.$transaction([
        prisma.payment.updateMany({ where: { id: prepared.payment.id, status: 'PENDING' }, data: { status: 'CANCELED' } }),
        prisma.eventRegistration.updateMany({ where: { id: prepared.registration.id, status: 'PAYMENT_PENDING' }, data: { status: 'CANCELLED', cancelledAt: new Date() } }),
      ])
      throw new AppError('Өмнөх Stripe Checkout дууссан байна. Тасалбар авах үйлдлийг дахин эхлүүлнэ үү.', 409, 'PAYMENT_SESSION_EXPIRED')
    }

    try {
      const session = await createEventCheckoutSession({ payment: prepared.payment, event: visible, user: req.auth.user })
      await prisma.payment.update({ where: { id: prepared.payment.id }, data: { providerSessionId: session.id } })
      return res.status(201).json({
        status: 'PAYMENT_PENDING', paymentId: prepared.payment.id, paymentStatus: 'PENDING', checkoutUrl: session.url,
        registrationId: prepared.registration.registrationCode,
      })
    } catch (error) {
      await prisma.$transaction([
        prisma.payment.updateMany({ where: { id: prepared.payment.id, status: 'PENDING' }, data: { status: 'FAILED' } }),
        prisma.eventRegistration.updateMany({ where: { id: prepared.registration.id, status: 'PAYMENT_PENDING' }, data: { status: 'CANCELLED', cancelledAt: new Date() } }),
      ])
      throw error
    }
  } catch (error) { next(error) }
})

router.get('/events/:id/payment', async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    const registration = await prisma.eventRegistration.findUnique({
      where: { userId_contentId: { userId: req.auth.user.id, contentId } },
      include: { payment: true, content: true },
    })
    if (!registration) throw new AppError('Арга хэмжээний бүртгэл олдсонгүй.', 404, 'REGISTRATION_NOT_FOUND')
    res.json({ payment: registration.payment ? { id: registration.payment.id, status: registration.payment.status, amount: registration.payment.amount, currency: registration.payment.currency, paidAt: registration.payment.paidAt?.toISOString() ?? null } : null, registration: { status: registration.status, ticketAvailable: registration.status === 'CONFIRMED' && registration.content.pricingType === 'PAID' && registration.payment?.status === 'PAID' } })
  } catch (error) { next(error) }
})

router.get('/events/:id/ticket', async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    const registration = await prisma.eventRegistration.findUnique({
      where: { userId_contentId: { userId: req.auth.user.id, contentId } },
      include: { content: { include: { university: { select: { shortName: true } } } }, payment: true },
    })
    if (!registration || !['CONFIRMED', 'ATTENDED'].includes(registration.status)) {
      throw new AppError('Баталгаажсан арга хэмжээний бүртгэл олдсонгүй.', 404, 'EVENT_TICKET_NOT_AVAILABLE')
    }
    if (registration.content.type !== 'EVENT') {
      throw new AppError('Энэ бүртгэл арга хэмжээнийх биш байна.', 422, 'NOT_AN_EVENT')
    }
    if (registration.content.pricingType !== 'PAID') {
      throw new AppError('QR тасалбар зөвхөн төлбөртэй арга хэмжээнд үүснэ.', 409, 'EVENT_PAID_TICKET_REQUIRED')
    }
    if (registration.payment?.status !== 'PAID') {
      throw new AppError('Төлбөр баталгаажаагүй тул QR тасалбар бэлэн болоогүй байна.', 409, 'EVENT_PAYMENT_REQUIRED')
    }
    const expiresAt = eventTicketExpiresAt(registration.content, new Date(Date.now() + 30 * 86_400_000))
    if (!expiresAt) throw new AppError('QR тасалбарын хугацааг тодорхойлж чадсангүй.', 422, 'EVENT_TICKET_EXPIRY_MISSING')
    if (expiresAt <= new Date()) {
      throw new AppError('Арга хэмжээ дууссан тул QR тасалбарын хугацаа дууссан байна.', 410, 'EVENT_TICKET_EXPIRED')
    }
    const token = createEventTicket({ registrationId: registration.id })
    const ticketTokenHash = hashEventTicket(token)
    if (registration.ticketTokenHash && registration.ticketTokenHash !== ticketTokenHash) {
      throw new AppError('QR тасалбарын серверийн түлхүүр өөрчлөгдсөн байна. Админтай холбогдоно уу.', 409, 'EVENT_TICKET_KEY_MISMATCH')
    }
    if (!registration.ticketTokenHash) {
      const issued = await prisma.eventRegistration.updateMany({
        where: { id: registration.id, ticketTokenHash: null, status: { in: ['CONFIRMED', 'ATTENDED'] } },
        data: { ticketTokenHash, ticketIssuedAt: new Date() },
      })
      if (!issued.count) {
        const current = await prisma.eventRegistration.findUnique({ where: { id: registration.id }, select: { ticketTokenHash: true } })
        if (current?.ticketTokenHash !== ticketTokenHash) {
          throw new AppError('QR тасалбарыг тогтвортой үүсгэж чадсангүй.', 409, 'EVENT_TICKET_ISSUE_CONFLICT')
        }
      }
    }
    res.json({
      ticket: {
        token,
        expiresAt: expiresAt.toISOString(),
        registrationId: registration.registrationCode,
        status: registration.status,
        event: {
          id: registration.content.id,
          title: registration.content.title,
          university: registration.content.university?.shortName || 'UniNet',
          date: dateOnly(registration.content.startsAt),
          time: timeOnly(registration.content.startsAt),
          location: registration.content.location,
        },
      },
    })
  } catch (error) { next(error) }
})

router.delete('/events/:id/registration', studentMutationLimiter, async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    const promoted = await withSerializableRetry(async tx => {
      const registration = await tx.eventRegistration.findUnique({
        where: { userId_contentId: { userId: req.auth.user.id, contentId } },
        include: { content: { include: { university: { select: { name: true, shortName: true } } } }, payment: true },
      })
      if (!registration || registration.status === 'CANCELLED') {
        throw new AppError('Идэвхтэй бүртгэл олдсонгүй.', 404, 'REGISTRATION_NOT_FOUND')
      }
      if (registration.content.pricingType === 'PAID' && registration.payment?.status === 'PAID') {
        throw new AppError('Төлбөр төлөгдсөн тасалбарыг эндээс цуцлах боломжгүй. Refund урсгал шаардлагатай.', 409, 'PAID_REGISTRATION_REFUND_REQUIRED')
      }
      if (!['PAYMENT_PENDING', 'CONFIRMED', 'WAITLISTED'].includes(registration.status)) {
        throw new AppError('Оролцоо бүртгэгдсэн арга хэмжээг цуцлах боломжгүй.', 409, 'REGISTRATION_CANCEL_FORBIDDEN')
      }
      const previousStatus = registration.status
      const previousPosition = registration.waitlistPosition
      await tx.eventRegistration.update({
        where: { id: registration.id },
        data: { status: 'CANCELLED', consentGranted: false, cancelledAt: new Date(), waitlistPosition: null },
      })
      if (registration.payment?.status === 'PENDING') {
        await tx.payment.update({ where: { id: registration.payment.id }, data: { status: 'CANCELED' } })
      }
      await recordConsentRevocation(
        tx,
        req.auth.user.id,
        registration.content,
        'EVENT_REGISTRATION',
        registration.id,
        'Student cancelled event registration',
      )
      await tx.auditLog.create({
        data: {
          actorId: req.auth.user.id,
          universityId: req.auth.user.universityId,
          action: 'EVENT_REGISTRATION_CANCELLED',
          resourceType: 'EVENT_REGISTRATION',
          resourceId: registration.id,
          resourceName: registration.content.title,
          previousData: { status: previousStatus, waitlistPosition: previousPosition },
          nextData: { status: 'CANCELLED' },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      })
      if (previousStatus === 'WAITLISTED' && previousPosition != null) {
        await tx.eventRegistration.updateMany({
          where: { contentId, status: 'WAITLISTED', waitlistPosition: { gt: previousPosition } },
          data: { waitlistPosition: { decrement: 1 } },
        })
        return null
      }
      if (!['CONFIRMED', 'PAYMENT_PENDING'].includes(previousStatus)) return null
      const firstWaitlisted = await tx.eventRegistration.findFirst({
        where: { contentId, status: 'WAITLISTED' },
        orderBy: [{ waitlistPosition: 'asc' }, { createdAt: 'asc' }],
        include: { user: { include: { studentProfile: true } } },
      })
      if (!firstWaitlisted) return null
      const promotedStatus = registration.content.pricingType === 'PAID' ? 'PAYMENT_PENDING' : 'CONFIRMED'
      await tx.eventRegistration.update({
        where: { id: firstWaitlisted.id },
        data: { status: promotedStatus, waitlistPosition: null },
      })
      await tx.eventRegistration.updateMany({
        where: { contentId, status: 'WAITLISTED', waitlistPosition: { gt: firstWaitlisted.waitlistPosition ?? 0 } },
        data: { waitlistPosition: { decrement: 1 } },
      })
      await createNotification(tx, {
          userId: firstWaitlisted.userId,
          universityId: registration.content.universityId,
          contentId,
          type: 'WAITLIST_PROMOTED',
          title: registration.content.pricingType === 'PAID' ? 'Төлбөр хийх суудал бэлэн боллоо' : 'Таны арга хэмжээний суудал баталгаажлаа',
          description: registration.content.pricingType === 'PAID' ? `${registration.content.title} · Тасалбарын төлбөрөө төлж QR тасалбараа баталгаажуулна уу.` : registration.content.title,
          actionUrl: '/student/registrations',
      })
      await tx.auditLog.create({
        data: {
          actorId: req.auth.user.id,
          universityId: registration.content.universityId,
          action: 'EVENT_WAITLIST_PROMOTED',
          resourceType: 'EVENT_REGISTRATION',
          resourceId: firstWaitlisted.id,
          resourceName: registration.content.title,
          previousData: { status: 'WAITLISTED', waitlistPosition: firstWaitlisted.waitlistPosition },
          nextData: { status: promotedStatus, waitlistPosition: null },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      })
      return {
        userId: firstWaitlisted.userId,
        email: firstWaitlisted.user.email,
        studentName: [firstWaitlisted.user.studentProfile?.lastName, firstWaitlisted.user.studentProfile?.firstName].filter(Boolean).join(' ') || firstWaitlisted.user.email,
        eventTitle: registration.content.title,
      }
    })
    if (promoted) {
      await emailService.sendWaitlistPromotion({
        to: promoted.email,
        studentName: promoted.studentName,
        eventTitle: promoted.eventTitle,
      }).catch(error => console.error('[email:waitlist-promotion] delivery failed', error))
    }
    res.json({ status: 'CANCELLED', waitlistPromoted: Boolean(promoted) })
  } catch (error) { next(error) }
})

router.post('/opportunities/:id/application', studentMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    const input = applicationInput.parse(req.body ?? {})
    const content = await findVisibleContent(req.auth.user, contentId)
    if (!['INTERNSHIP', 'JOB', 'RESEARCH'].includes(content.type)) {
      throw new AppError('Энэ контентод өргөдөл илгээх боломжгүй.', 422, 'NOT_AN_OPPORTUNITY')
    }
    if (content.deadlineAt && content.deadlineAt < new Date()) throw new AppError('Өргөдлийн хугацаа дууссан байна.', 409, 'APPLICATION_CLOSED')
    const application = await prisma.$transaction(async tx => {
      const existing = await tx.application.findUnique({ where: { userId_contentId: { userId: req.auth.user.id, contentId } } })
      if (existing && existing.status !== 'WITHDRAWN') {
        throw new AppError('Та энэ боломжид өргөдөл илгээсэн байна.', 409, 'APPLICATION_ALREADY_SUBMITTED')
      }
      const cvAssetId = input.cvAssetId || req.auth.user.studentProfile?.cvAssetId || null
      if (cvAssetId) {
        const cvAsset = await tx.fileAsset.findFirst({
          where: {
            id: cvAssetId,
            ownerId: req.auth.user.id,
            universityId: req.auth.user.universityId,
            purpose: 'STUDENT_CV',
            status: 'AVAILABLE',
            scanStatus: 'CLEAN',
          },
          select: { id: true },
        })
        if (!cvAsset) throw new AppError('Сонгосон CV олдсонгүй эсвэл аюулгүй байдлын шалгалт даваагүй.', 422, 'CV_FILE_INVALID')
      }
      if (!cvAssetId && !input.cvUrl && !req.auth.user.studentProfile?.cvUrl) {
        throw new AppError('CV файл эсвэл зөвшөөрөгдсөн CV холбоос шаардлагатай.', 422, 'CV_REQUIRED')
      }
      const savedApplication = existing
        ? await tx.application.update({
          where: { id: existing.id },
          data: {
            status: 'SUBMITTED',
            cvUrl: input.cvUrl || req.auth.user.studentProfile?.cvUrl,
            cvAssetId,
            coverNote: input.coverNote,
            consentGranted: input.consentGranted,
            submittedAt: new Date(),
            reviewedAt: null,
            withdrawnAt: null,
          },
        })
        : await tx.application.create({ data: {
          userId: req.auth.user.id,
          contentId,
          cvUrl: input.cvUrl || req.auth.user.studentProfile?.cvUrl,
          cvAssetId,
          coverNote: input.coverNote,
          consentGranted: input.consentGranted,
        } })
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: savedApplication.id,
          actorId: req.auth.user.id,
          fromStatus: existing?.status,
          toStatus: 'SUBMITTED',
          reason: existing ? 'Student resubmitted withdrawn application' : 'Initial submission',
        },
      })
      await tx.consentRecord.create({
        data: consentRecordData(req.auth.user.id, content, 'OPPORTUNITY_APPLICATION', 'GRANTED', savedApplication.id),
      })
      await tx.auditLog.create({
        data: {
          actorId: req.auth.user.id,
          universityId: req.auth.user.universityId,
          action: existing ? 'APPLICATION_RESUBMITTED' : 'APPLICATION_SUBMITTED',
          resourceType: 'APPLICATION',
          resourceId: savedApplication.id,
          resourceName: content.title,
          previousData: existing ? { status: existing.status } : null,
          nextData: { status: 'SUBMITTED', hasCvAsset: Boolean(cvAssetId), hasCvUrl: Boolean(savedApplication.cvUrl) },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      })
      return savedApplication
    })
    res.status(201).json({ application, id: application.id, status: application.status, submittedAt: application.submittedAt })
  } catch (error) { next(error) }
})

router.delete('/opportunities/:id/application', studentMutationLimiter, async (req, res, next) => {
  try {
    const contentId = uuid.parse(req.params.id)
    await prisma.$transaction(async tx => {
      const application = await tx.application.findUnique({
        where: { userId_contentId: { userId: req.auth.user.id, contentId } },
        include: { content: { include: { university: { select: { name: true, shortName: true } } } } },
      })
      if (!application || application.status === 'WITHDRAWN') {
        throw new AppError('Идэвхтэй өргөдөл олдсонгүй.', 404, 'APPLICATION_NOT_FOUND')
      }
      if (!['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'].includes(application.status)) {
        throw new AppError('Шийдвэрлэгдсэн өргөдлийг буцаах боломжгүй.', 409, 'APPLICATION_WITHDRAW_FORBIDDEN')
      }
      await tx.application.update({
        where: { id: application.id },
        data: {
          status: 'WITHDRAWN',
          consentGranted: false,
          cvUrl: null,
          cvAssetId: null,
          coverNote: null,
          withdrawnAt: new Date(),
        },
      })
      await recordConsentRevocation(
        tx,
        req.auth.user.id,
        application.content,
        'OPPORTUNITY_APPLICATION',
        application.id,
        'Student withdrew application',
      )
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: application.id,
          actorId: req.auth.user.id,
          fromStatus: application.status,
          toStatus: 'WITHDRAWN',
          reason: 'Student withdrew application',
        },
      })
      await tx.auditLog.create({
        data: {
          actorId: req.auth.user.id,
          universityId: req.auth.user.universityId,
          action: 'APPLICATION_WITHDRAWN',
          resourceType: 'APPLICATION',
          resourceId: application.id,
          resourceName: application.content.title,
          previousData: { status: application.status },
          nextData: { status: 'WITHDRAWN', cvAccessRevoked: true },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      })
    })
    res.json({ status: 'WITHDRAWN' })
  } catch (error) { next(error) }
})

router.patch('/notifications/read-all', async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.auth.user.id, readAt: null },
      data: { readAt: new Date() },
    })
    res.json({ updated: result.count })
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
    res.json({ id, read: true })
  } catch (error) { next(error) }
})

export { router as studentRouter }
