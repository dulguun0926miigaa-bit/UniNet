import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/authenticate.js'
import { AppError } from '../utils/app-error.js'
import { sensitiveReadLimiter, supportMutationLimiter } from '../middleware/rate-limits.js'
import { hashPassword, passwordPolicy, verifyPassword } from '../utils/password.js'
import { deactivateAccount, requestAccountDeletion } from '../privacy/account-lifecycle.service.js'
import { requireIdempotency } from '../middleware/idempotency.js'
import { requireStepUp } from '../middleware/step-up.js'
import { mfaService } from '../auth/mfa.service.js'
import { assertPasswordHistory } from '../auth/password-security.js'
import { env } from '../config/env.js'

const router = Router()
const sections = ['account', 'security', 'notifications', 'privacy', 'appearance', 'locale', 'accessibility']
const sectionName = z.enum(sections)
const jsonObject = z.record(z.string(), z.unknown())
const patchInput = z.object({ section: sectionName, value: jsonObject })
const feedbackInput = z.object({
  category: z.string().trim().min(2).max(80).default('GENERAL'),
  subject: z.string().trim().min(2).max(200).default('UniNet feedback'),
  message: z.string().trim().min(3).max(5000),
})

const defaults = {
  security: { twoFactor: false },
  notifications: {
    inApp: true, email: true, push: false, opportunities: true, eventReminder: true,
    applicationStatus: true, waitlist: true, surveyDeadline: true, announcements: true,
    system: true, frequency: 'Шууд',
  },
  privacy: { profileVisibility: 'Миний сургууль', cvSharing: 'Зөвхөн зөвшөөрсөн өргөдөл', recommendations: true },
  appearance: { theme: 'system', density: 'comfortable', reducedMotion: false },
  locale: { language: 'Монгол', timezone: 'Asia/Ulaanbaatar', dateFormat: 'YYYY.MM.DD', hourFormat: '24' },
  accessibility: { fontSize: 'normal', highContrast: false, reducedMotion: false, focusIndicator: true, underlineLinks: false },
}

const dateOnly = value => value.toISOString().slice(0, 10).replaceAll('-', '.')

function mergeSection(name, value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return { ...defaults[name], ...source }
}

function deviceName(userAgent = '') {
  if (/iphone/i.test(userAgent)) return 'iPhone'
  if (/ipad/i.test(userAgent)) return 'iPad'
  if (/android/i.test(userAgent)) return 'Android төхөөрөмж'
  if (/windows/i.test(userAgent)) return 'Windows PC'
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac'
  return 'Төхөөрөмж'
}

function browserName(userAgent = '') {
  if (/edg/i.test(userAgent)) return 'Microsoft Edge'
  if (/chrome/i.test(userAgent)) return 'Chrome'
  if (/firefox/i.test(userAgent)) return 'Firefox'
  if (/safari/i.test(userAgent)) return 'Safari'
  return 'Browser'
}

function accountFromUser(user) {
  const profile = user.studentProfile ?? user.staffProfile
  return {
    avatar: user.studentProfile?.avatarUrl ?? '',
    lastName: profile?.lastName ?? '',
    firstName: profile?.firstName ?? '',
    email: user.email,
    phone: user.studentProfile?.phone ?? '',
    university: user.university?.shortName ?? 'UniNet',
    department: profile?.department ?? '',
    major: user.studentProfile?.major ?? '—',
    enrollmentYear: user.studentProfile?.enrollmentYear ?? '',
    graduationYear: user.studentProfile?.graduationYear ?? '',
    timezone: 'Asia/Ulaanbaatar',
    emailLocked: false,
    emailChangeRequiresVerification: true,
    universityLocked: Boolean(user.universityId),
  }
}

async function getSettings(user, currentSessionId) {
  const [stored, sessions, consentRecords, accountRequests, mfaCredential, recoveryCodesRemaining] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    prisma.session.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } }),
    prisma.consentRecord.findMany({ where: { userId: user.id }, orderBy: { grantedAt: 'desc' }, take: 100 }),
    prisma.accountActionRequest.findMany({ where: { userId: user.id }, orderBy: { requestedAt: 'desc' }, take: 20 }),
    prisma.mfaTotpCredential.findUnique({ where: { userId: user.id } }),
    prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } }),
  ])
  return {
    account: accountFromUser(user),
    security: {
      ...mergeSection('security', stored?.security),
      twoFactor: Boolean(mfaCredential?.enabledAt),
      mfaEnabled: Boolean(mfaCredential?.enabledAt),
      mfaEnrolledAt: mfaCredential?.enabledAt ?? null,
      mfaRequiredByRole: ['UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'].includes(user.role),
      recoveryCodesRemaining,
    },
    notifications: mergeSection('notifications', stored?.notifications),
    privacy: mergeSection('privacy', stored?.privacy),
    appearance: mergeSection('appearance', stored?.appearance),
    locale: mergeSection('locale', stored?.locale),
    accessibility: mergeSection('accessibility', stored?.accessibility),
    devices: sessions.map(session => ({
      id: session.id,
      device: deviceName(session.userAgent),
      browser: browserName(session.userAgent),
      location: session.ipAddress || 'Тодорхойгүй',
      lastActive: dateOnly(session.lastUsedAt ?? session.createdAt),
      current: session.id === currentSessionId,
    })),
    consentHistory: consentRecords.map(record => ({
      id: record.id,
      date: dateOnly(record.grantedAt),
      recipient: record.recipientName,
      purpose: record.purpose,
      data: Array.isArray(record.dataFields) ? record.dataFields.join(', ') : JSON.stringify(record.dataFields),
      action: record.action,
      active: record.action === 'GRANTED' && !record.revokedAt,
      revokedAt: record.revokedAt,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
    })),
    accountRequests: accountRequests.map(request => ({
      id: request.id,
      type: request.type,
      status: request.status,
      requestedAt: request.requestedAt,
      scheduledFor: request.scheduledFor,
      completedAt: request.completedAt,
      cancelledAt: request.cancelledAt,
      legalHold: Boolean(request.legalHoldUntil && request.legalHoldUntil > new Date()),
      legalHoldUntil: request.legalHoldUntil,
    })),
  }
}

async function updateAccount(user, value) {
  const input = z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(30).optional(),
    department: z.string().trim().max(160).optional(),
    major: z.string().trim().max(160).optional(),
    enrollmentYear: z.union([z.coerce.number().int().min(1950).max(new Date().getUTCFullYear()), z.literal('—'), z.literal('')]).optional(),
    graduationYear: z.union([z.coerce.number().int().min(1900).max(2100), z.literal('—'), z.literal('')]).optional(),
    timezone: z.string().trim().max(80).optional(),
    avatar: z.string().trim().max(2000).optional(),
    email: z.string().email().optional(),
    university: z.string().max(160).optional(),
  }).parse(value)
  if (input.email && input.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError('Баталгаажсан university email-ийг эндээс өөрчлөх боломжгүй.', 409, 'VERIFIED_EMAIL_LOCKED')
  }
  if (input.university && ![user.university?.name, user.university?.shortName, 'UniNet'].includes(input.university)) {
    throw new AppError('Баталгаажсан сургуулийг эндээс өөрчлөх боломжгүй.', 409, 'VERIFIED_UNIVERSITY_LOCKED')
  }
  if (user.role === 'STUDENT') {
    return prisma.studentProfile.update({
      where: { userId: user.id },
      data: {
        firstName: input.firstName, lastName: input.lastName, phone: input.phone,
        department: input.department, major: input.major,
        enrollmentYear: typeof input.enrollmentYear === 'number' ? input.enrollmentYear : null,
        graduationYear: typeof input.graduationYear === 'number' ? input.graduationYear : null,
        avatarUrl: input.avatar,
      },
    })
  }
  if (user.staffProfile) {
    return prisma.staffProfile.update({
      where: { userId: user.id },
      data: { firstName: input.firstName, lastName: input.lastName, department: input.department },
    })
  }
  return { id: user.id, firstName: input.firstName, lastName: input.lastName }
}

async function updateSection(req, section, value) {
  if (JSON.stringify(value).length > 20000) throw new AppError('Тохиргооны өгөгдөл хэт том байна.', 413, 'SETTINGS_TOO_LARGE')
  if (section === 'account') return updateAccount(req.auth.user, value)
  let storedValue = value
  if (section === 'security') {
    const security = z.object({
      twoFactor: z.boolean().optional(),
      current: z.string().max(200).optional(),
      next: z.string().min(passwordPolicy.minLength).max(200).regex(passwordPolicy.pattern, 'Нууц үг том, жижиг үсэг, тоо болон тусгай тэмдэг агуулсан байна.').optional(),
      repeat: z.string().max(200).optional(),
    }).passthrough().parse(value)
    if (security.next) {
      if (!security.current || !(await verifyPassword(req.auth.user.passwordHash, security.current))) {
        throw new AppError('Одоогийн нууц үг буруу байна.', 422, 'CURRENT_PASSWORD_INVALID')
      }
      if (security.next !== security.repeat) throw new AppError('Шинэ нууц үг таарахгүй байна.', 422, 'PASSWORD_CONFIRMATION_MISMATCH')
      if (await verifyPassword(req.auth.user.passwordHash, security.next)) {
        throw new AppError('Шинэ нууц үг одоогийн нууц үгээс өөр байх ёстой.', 422, 'PASSWORD_REUSE_FORBIDDEN')
      }
      mfaService.verifyStepUp(req.get('x-step-up-token'), req.auth.user, req.auth.session.id)
      await assertPasswordHistory(req.auth.user.id, security.next, req.auth.user.passwordHash)
      const changedAt = new Date()
      const passwordHash = await hashPassword(security.next)
      await prisma.$transaction(async transaction => {
        await transaction.passwordHistory.create({ data: { userId: req.auth.user.id, passwordHash: req.auth.user.passwordHash } })
        const oldHistory = await transaction.passwordHistory.findMany({
          where: { userId: req.auth.user.id }, orderBy: { createdAt: 'desc' }, skip: env.PASSWORD_HISTORY_COUNT,
          select: { id: true },
        })
        if (oldHistory.length) await transaction.passwordHistory.deleteMany({ where: { id: { in: oldHistory.map(item => item.id) } } })
        await transaction.user.update({ where: { id: req.auth.user.id }, data: { passwordHash } })
        await transaction.session.updateMany({
          where: { userId: req.auth.user.id, id: { not: req.auth.token.sid }, revokedAt: null },
          data: { revokedAt: changedAt },
        })
        await transaction.passwordResetToken.updateMany({
          where: { userId: req.auth.user.id, usedAt: null },
          data: { usedAt: changedAt },
        })
        await transaction.auditLog.create({
          data: {
            actorId: req.auth.user.id,
            universityId: req.auth.user.universityId,
            action: 'PASSWORD_CHANGED',
            resourceType: 'USER_SECURITY',
            resourceId: req.auth.user.id,
            resourceName: req.auth.user.email,
            nextData: { otherSessionsRevoked: true },
            severity: 'MEDIUM',
            ipAddress: req.ip,
            userAgent: req.get('user-agent')?.slice(0, 500),
          },
        })
      })
    }
    storedValue = { twoFactor: Boolean((await prisma.mfaTotpCredential.findUnique({ where: { userId: req.auth.user.id } }))?.enabledAt) }
  }
  return prisma.userSettings.upsert({
    where: { userId: req.auth.user.id },
    update: { [section]: storedValue },
    create: { userId: req.auth.user.id, [section]: storedValue },
  })
}

router.use(authenticate)

router.get('/', async (req, res, next) => {
  try { res.json(await getSettings(req.auth.user, req.auth.token.sid)) } catch (error) { next(error) }
})

router.patch('/', async (req, res, next) => {
  try {
    const input = patchInput.parse(req.body)
    await updateSection(req, input.section, input.value)
    res.json({ ok: true, section: input.section, settings: await getSettings(req.auth.user, req.auth.token.sid) })
  } catch (error) { next(error) }
})

router.patch('/:section', async (req, res, next) => {
  try {
    const section = sectionName.parse(req.params.section)
    const value = jsonObject.parse(req.body?.value ?? req.body)
    await updateSection(req, section, value)
    res.json({ ok: true, section, settings: await getSettings(req.auth.user, req.auth.token.sid) })
  } catch (error) { next(error) }
})

router.post('/feedback', supportMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    const input = feedbackInput.parse(req.body)
    const feedback = await prisma.feedback.create({ data: { ...input, userId: req.auth.user.id } })
    res.status(201).json({ feedback: { id: feedback.id, status: feedback.status, createdAt: feedback.createdAt } })
  } catch (error) { next(error) }
})

router.get('/export/:kind', sensitiveReadLimiter, requireStepUp(), async (req, res, next) => {
  try {
    const kind = z.enum(['personal-data', 'registration-history', 'application-history']).parse(req.params.kind)
    let data
    if (kind === 'registration-history') {
      data = await prisma.eventRegistration.findMany({ where: { userId: req.auth.user.id }, include: { content: { select: { title: true } } }, orderBy: { createdAt: 'desc' } })
    } else if (kind === 'application-history') {
      data = await prisma.application.findMany({ where: { userId: req.auth.user.id }, include: { content: { select: { title: true } } }, orderBy: { submittedAt: 'desc' } })
    } else {
      const settings = await getSettings(req.auth.user, req.auth.token.sid)
      data = { user: { id: req.auth.user.id, email: req.auth.user.email, role: req.auth.user.role, status: req.auth.user.status, createdAt: req.auth.user.createdAt }, settings }
    }
    const filename = `uninet-${kind}-${new Date().toISOString().slice(0, 10)}.json`
    await prisma.auditLog.create({
      data: {
        actorId: req.auth.user.id,
        universityId: req.auth.user.universityId,
        action: 'PERSONAL_DATA_EXPORTED',
        resourceType: 'USER_DATA_EXPORT',
        resourceId: req.auth.user.id,
        resourceName: kind,
        nextData: { kind, generatedAt: new Date().toISOString() },
        severity: 'MEDIUM',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 500),
      },
    })
    res.json({ ok: true, filename, data, generatedAt: new Date().toISOString() })
  } catch (error) { next(error) }
})

router.delete('/devices/:id', requireStepUp(), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const updated = await prisma.session.updateMany({ where: { id, userId: req.auth.user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    if (!updated.count) throw new AppError('Session олдсонгүй.', 404, 'SESSION_NOT_FOUND')
    res.json({ ok: true, id })
  } catch (error) { next(error) }
})

router.post('/account/deactivate', supportMutationLimiter, requireStepUp(), requireIdempotency, async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(3).max(2000).optional() }).parse(req.body ?? {})
    const request = await deactivateAccount({
      user: req.auth.user,
      reason: input.reason,
      context: { ipAddress: req.ip, userAgent: req.get('user-agent') },
    })
    res.json({ ok: true, status: 'DEACTIVATED', request })
  } catch (error) { next(error) }
})

router.post('/account/delete-request', supportMutationLimiter, requireStepUp(), requireIdempotency, async (req, res, next) => {
  try {
    const message = z.object({ reason: z.string().trim().min(3).max(2000) }).parse(req.body)
    const request = await requestAccountDeletion({
      user: req.auth.user,
      reason: message.reason,
      context: { ipAddress: req.ip, userAgent: req.get('user-agent') },
    })
    res.status(202).json({ ok: true, requestId: request.id, status: request.status, request })
  } catch (error) { next(error) }
})

export { router as settingsRouter }
