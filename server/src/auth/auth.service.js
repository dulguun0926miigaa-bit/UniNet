import crypto from 'node:crypto'
import { hashPassword, verifyPassword } from '../utils/password.js'
import {
  createOpaqueToken,
  expiryFromToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js'
import { AppError } from '../utils/app-error.js'
import { sessionIdleExpired } from './session-policy.js'
import { env } from '../config/env.js'
import { authRepository } from './auth.repository.js'
import { emailService } from './email.service.js'
import {
  emailVerificationResendSchema,
  emailVerificationSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetOtpVerifySchema,
  passwordResetRequestSchema,
  registerSchema,
  validate,
} from './validation.js'
import { buildPolicyAcceptanceData, requireRegistrationPolicies } from '../privacy/policy.js'
import { prisma } from '../lib/prisma.js'
import { loginSecurityService } from './login-security.service.js'
import { mfaService } from './mfa.service.js'
import { assertPasswordHistory, assertNotCommonBreachedPassword } from './password-security.js'

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  firstName: user.studentProfile?.firstName
    ?? user.staffProfile?.firstName
    ?? (user.role === 'PLATFORM_SUPER_ADMIN' ? 'Platform' : ''),
  lastName: user.studentProfile?.lastName
    ?? user.staffProfile?.lastName
    ?? (user.role === 'PLATFORM_SUPER_ADMIN' ? 'Admin' : ''),
  name: [
    user.studentProfile?.firstName ?? user.staffProfile?.firstName,
    user.studentProfile?.lastName ?? user.staffProfile?.lastName,
  ].filter(Boolean).join(' ') || (user.role === 'PLATFORM_SUPER_ADMIN' ? 'Platform Admin' : ''),
  role: user.role,
  status: user.status,
  emailVerifiedAt: user.emailVerifiedAt,
  universityId: user.universityId,
  university: user.university && {
    id: user.university.id,
    name: user.university.name,
    shortName: user.university.shortName,
    slug: user.university.slug,
    logoUrl: user.university.logoUrl,
    primaryColor: user.university.primaryColor,
    secondaryColor: user.university.secondaryColor,
  },
  studentProfile: user.studentProfile,
  staffProfile: user.staffProfile,
})

const authError = (message = 'Имэйл эсвэл нууц үг буруу байна.') => (
  new AppError(message, 401, 'AUTHENTICATION_FAILED')
)

const durationToMs = (value) => {
  const [, amount, unit] = /^(\d+)([mhd])$/.exec(value)
  return Number(amount) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]
}

const createVerificationCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
const hashVerificationCode = (userId, code) => crypto
  .createHmac('sha256', env.emailVerificationSecret)
  .update(`${userId}:${code}`)
  .digest('hex')

const hashPasswordResetOtp = (userId, challengeTokenHash, code) => crypto
  .createHmac('sha256', env.emailVerificationSecret)
  .update(`${userId}:${challengeTokenHash}:${code}`)
  .digest('hex')

const maskEmail = value => {
  const [local = '', domain = ''] = String(value || '').split('@')
  if (!domain) return ''
  const visible = local.slice(0, Math.min(3, local.length))
  return `${visible}${'*'.repeat(Math.max(4, local.length - visible.length))}@${domain}`
}

const verificationRequestResponse = {
  message: 'Баталгаажуулах боломжтой бүртгэл байвал шинэ код имэйлээр илгээгдэнэ.',
}

const resetRequestResponse = {
  message: 'Student account тохирсон бол бүртгэлтэй Gmail эсвэл баталгаажсан сургуулийн имэйл рүү 6 оронтой OTP илгээгдэнэ.',
}

const emailReference = email => email
  ? crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24)
  : 'unknown'


/**
 * @param {any} repository
 * @param {{action: string, user?: any, email?: string | null, context?: {ipAddress?: string, userAgent?: string}, severity?: any, nextData?: Record<string, unknown>}} event
 */
async function auditAuth(repository, { action, user = null, email = null, context = {}, severity = 'INFO', nextData = {} }) {
  if (typeof repository.createAuditLog !== 'function') return
  await repository.createAuditLog({
    actorId: user?.id,
    universityId: user?.universityId,
    action,
    resourceType: 'AUTH_SECURITY_EVENT',
    resourceId: user?.id,
    resourceName: `email-sha256:${emailReference(email ?? user?.email)}`,
    severity,
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent?.slice(0, 500),
    nextData: nextData ?? {},
  })
}

export function createAuthService(repository = authRepository, mailer = emailService, dependencies = {}) {
  const loginSecurity = dependencies.loginSecurity ?? {
    assertNotBlocked: async () => {}, recordFailure: async () => ({ retryAfterSeconds: 0 }), recordSuccess: async () => {},
  }
  const mfa = dependencies.mfa ?? { loginRequirement: async () => null }
  const passwordSecurity = dependencies.passwordSecurity ?? {
    assertNotCommon: () => {}, assertHistory: async () => {},
  }
  async function issueTokens(user, context = {}, { mfaVerified = false, remembered = false } = {}) {
    const provisional = createOpaqueToken()
    const session = await repository.createSession({
      userId: user.id,
      refreshTokenHash: hashToken(provisional),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      mfaVerifiedAt: mfaVerified ? new Date() : null,
      remembered,
    })
    const accessToken = signAccessToken(user, session.id, { mfaVerified })
    const refreshToken = signRefreshToken(user, session.id)
    await repository.updateSessionToken(
      session.id,
      hashToken(refreshToken),
      expiryFromToken(refreshToken),
    )
    return { accessToken, refreshToken, rememberMe: remembered }
  }

  async function sendVerificationCode(user, context = {}, { enforceCooldown = true } = {}) {
    if (enforceCooldown) {
      const latest = await repository.findLatestEmailVerificationToken(user.id)
      if (latest) {
        const elapsedSeconds = Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 1000)
        const retryAfterSeconds = Math.max(0, env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS - elapsedSeconds)
        if (retryAfterSeconds > 0) {
          throw new AppError(
            `Шинэ код авахын өмнө ${retryAfterSeconds} секунд хүлээнэ үү.`,
            429,
            'VERIFICATION_RESEND_COOLDOWN',
            { retryAfterSeconds },
          )
        }
      }
    }

    const code = createVerificationCode()
    const tokenHash = hashVerificationCode(user.id, code)
    const expiresAt = new Date(Date.now() + durationToMs(env.EMAIL_VERIFICATION_CODE_EXPIRES_IN))
    await repository.invalidateEmailVerificationTokens(user.id)
    await repository.createEmailVerificationToken({ userId: user.id, tokenHash, expiresAt })

    try {
      const delivery = await mailer.sendEmailVerification({
        to: user.email,
        code,
        expiresInMinutes: Math.ceil(durationToMs(env.EMAIL_VERIFICATION_CODE_EXPIRES_IN) / 60_000),
      })
      if (!delivery?.delivered) throw new Error('Email verification delivery is disabled')
    } catch (error) {
      await repository.deleteEmailVerificationToken(tokenHash)
      await auditAuth(repository, {
        action: 'EMAIL_VERIFICATION_DELIVERY_FAILED',
        user,
        context,
        severity: 'MEDIUM',
      })
      if (env.NODE_ENV !== 'test') console.error('Email verification delivery failed', error)
      throw new AppError(
        'Баталгаажуулах код илгээж чадсангүй. Түр хүлээгээд дахин оролдоно уу.',
        503,
        'EMAIL_VERIFICATION_DELIVERY_FAILED',
      )
    }

    await auditAuth(repository, {
      action: 'EMAIL_VERIFICATION_CODE_SENT',
      user,
      context,
      nextData: { expiresAt },
    })
    return { expiresAt }
  }

  return {
    async register(payload, context) {
      const input = validate(registerSchema, payload)
      passwordSecurity.assertNotCommon(input.password)
      if (await repository.findUserByEmail(input.email)) {
        throw new AppError('Энэ имэйлээр бүртгэл үүссэн байна.', 409, 'EMAIL_ALREADY_REGISTERED')
      }

      const domain = input.email.split('@')[1]
      const domainRecord = await repository.findUniversityDomain(domain)
      const university = domainRecord?.isActive
        && domainRecord.isVerified
        && domainRecord.university.status === 'ACTIVE'
        ? domainRecord.university
        : null
      if (!university) {
        throw new AppError('Энэ сургуулийн домэйн UniNet-д баталгаажаагүй байна.', 422, 'UNIVERSITY_DOMAIN_NOT_VERIFIED')
      }
      const policies = requireRegistrationPolicies(await repository.findCurrentRequiredPolicies('mn'))
      const acceptedAt = new Date()

      const user = await repository.registerStudent({
        user: {
          universityId: university?.id,
          email: input.email,
          normalizedEmail: input.email,
          passwordHash: await hashPassword(input.password),
          role: 'STUDENT',
          status: 'PENDING_VERIFICATION',
          emailVerifiedAt: null,
        },
        profile: {
          universityId: university?.id,
          studentId: input.studentId,
          firstName: input.firstName,
          lastName: input.lastName,
          department: input.branchSchool,
          major: input.major,
          enrollmentYear: input.enrollmentYear,
          graduationYear: input.graduationYear,
        },
        policyAcceptances: buildPolicyAcceptanceData(undefined, policies, {
          acceptedAt,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
          source: 'REGISTRATION',
          route: '/api/auth/register',
        }),
      })
      await auditAuth(repository, { action: 'ACCOUNT_REGISTERED', user, context })
      if (!env.emailVerificationEnabled) {
        const completion = /** @type {any} */ (await repository.completeRegistrationWithoutEmailVerification(user.id))
        if (completion.status !== 'completed' && completion.status !== 'alreadyCompleted') {
          throw new AppError('Бүртгэлийн төлөвийг шинэчилж чадсангүй.', 500, 'REGISTRATION_COMPLETION_FAILED')
        }
        const completedUser = completion.user
        await auditAuth(repository, {
          action: 'EMAIL_VERIFICATION_BYPASSED_DEVELOPMENT',
          user: completedUser,
          context,
          severity: 'MEDIUM',
          nextData: { rosterMatched: completion.rosterMatched, status: completedUser.status },
        })
        if (completedUser.status !== 'ACTIVE') {
          throw new AppError('Бүртгэлийг идэвхжүүлж чадсангүй.', 500, 'REGISTRATION_ACTIVATION_FAILED')
        }
        const tokens = await issueTokens(completedUser, context)
        await repository.markLogin(completedUser.id)
        return {
          user: publicUser(completedUser),
          verificationRequired: false,
          reviewRequired: false,
          redirectTo: '/student',
          message: 'Бүртгэл амжилттай үүслээ.',
          ...tokens,
        }
      }

      const verification = await sendVerificationCode(user, context, { enforceCooldown: false })
      return {
        user: publicUser(user),
        verificationRequired: true,
        reviewRequired: false,
        redirectTo: '/verify-email',
        message: 'Бүртгэл үүслээ. Имэйлээр ирсэн 6 оронтой кодыг оруулна уу.',
        verificationExpiresAt: verification.expiresAt,
      }
    },

    async verifyEmail(payload, context) {
      if (!env.emailVerificationEnabled) {
        throw new AppError('Email verification түр идэвхгүй байна.', 409, 'EMAIL_VERIFICATION_DISABLED')
      }
      const input = validate(emailVerificationSchema, payload)
      const user = await repository.findUserByEmail(input.email)
      if (!user || user.role !== 'STUDENT') {
        throw new AppError('Баталгаажуулах код хүчингүй эсвэл хугацаа дууссан байна.', 400, 'EMAIL_VERIFICATION_INVALID')
      }
      if (user.emailVerifiedAt) {
        throw new AppError('Энэ имэйл аль хэдийн баталгаажсан байна.', 409, 'EMAIL_ALREADY_VERIFIED')
      }

      const result = await repository.finalizeEmailVerification({
        userId: user.id,
        tokenHash: hashVerificationCode(user.id, input.code),
        maxAttempts: env.EMAIL_VERIFICATION_MAX_ATTEMPTS,
      })
      if (result.status === 'attemptsExceeded') {
        await auditAuth(repository, { action: 'EMAIL_VERIFICATION_BLOCKED', user, context, severity: 'MEDIUM', nextData: { reason: 'MAX_ATTEMPTS' } })
        throw new AppError('Кодыг олон удаа буруу оруулсан. Шинэ код авна уу.', 429, 'EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED')
      }
      if (result.status === 'expired') {
        throw new AppError('Баталгаажуулах кодын хугацаа дууссан. Шинэ код авна уу.', 400, 'EMAIL_VERIFICATION_EXPIRED')
      }
      if (result.status === 'alreadyVerified') {
        throw new AppError('Энэ имэйл аль хэдийн баталгаажсан байна.', 409, 'EMAIL_ALREADY_VERIFIED')
      }
      if (result.status !== 'verified') {
        await auditAuth(repository, { action: 'EMAIL_VERIFICATION_FAILED', user, context, severity: 'MEDIUM' })
        throw new AppError('Баталгаажуулах код хүчингүй эсвэл хугацаа дууссан байна.', 400, 'EMAIL_VERIFICATION_INVALID')
      }

      const verifiedUser = result.user
      await auditAuth(repository, {
        action: 'EMAIL_VERIFIED',
        user: verifiedUser,
        context,
        nextData: { rosterMatched: result.rosterMatched, status: verifiedUser.status },
      })

      if (verifiedUser.status !== 'ACTIVE') {
        throw new AppError('Имэйл баталгаажсан ч Student account-ийг идэвхжүүлж чадсангүй.', 500, 'REGISTRATION_ACTIVATION_FAILED')
      }

      const tokens = await issueTokens(verifiedUser, context)
      await repository.markLogin(verifiedUser.id)
      return {
        user: publicUser(verifiedUser),
        verificationRequired: false,
        reviewRequired: false,
        redirectTo: '/student',
        ...tokens,
      }
    },

    async resendEmailVerification(payload, context) {
      if (!env.emailVerificationEnabled) return { message: 'Email verification түр идэвхгүй байна.' }
      const input = validate(emailVerificationResendSchema, payload)
      const user = await repository.findUserByEmail(input.email)
      if (!user || user.role !== 'STUDENT' || user.emailVerifiedAt) {
        return verificationRequestResponse
      }
      await sendVerificationCode(user, context)
      return verificationRequestResponse
    },

    async login(payload, context) {
      const input = validate(loginSchema, payload)
      await loginSecurity.assertNotBlocked(input.email, context?.ipAddress)
      let user = await repository.findUserByEmail(input.email)
      if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
        const failure = await loginSecurity.recordFailure(input.email, context?.ipAddress, user, context)
        await auditAuth(repository, { action: 'LOGIN_FAILED', user, email: input.email, context, severity: 'MEDIUM', nextData: { reason: 'INVALID_CREDENTIALS', failureCount: failure.failureCount, retryAfterSeconds: failure.retryAfterSeconds } })
        if (failure.retryAfterSeconds > 0) {
          throw new AppError('Олон удаагийн амжилтгүй оролдлогын улмаас түр хүлээнэ үү.', 429, 'LOGIN_BACKOFF_ACTIVE', { retryAfterSeconds: failure.retryAfterSeconds })
        }
        throw authError()
      }
      await loginSecurity.recordSuccess(input.email, context?.ipAddress)
      if (user.status === 'PENDING_VERIFICATION' && !env.emailVerificationEnabled) {
        const completion = /** @type {any} */ (await repository.completeRegistrationWithoutEmailVerification(user.id))
        if (completion.status === 'completed' || completion.status === 'alreadyCompleted') user = completion.user
      }
      if (user.status === 'PENDING_VERIFICATION') {
        await auditAuth(repository, { action: 'LOGIN_BLOCKED', user, context, severity: 'MEDIUM', nextData: { reason: 'EMAIL_NOT_VERIFIED' } })
        throw new AppError('Имэйлээ баталгаажуулна уу.', 403, 'EMAIL_VERIFICATION_REQUIRED')
      }
      if (user.status === 'PENDING_REVIEW' && user.role === 'STUDENT' && user.emailVerifiedAt) {
        const completion = /** @type {any} */ (await repository.completeRegistrationWithoutEmailVerification(user.id))
        if (completion.status === 'completed' || completion.status === 'alreadyCompleted') user = completion.user
      }
      if (user.status === 'PENDING_REVIEW') {
        await auditAuth(repository, { action: 'LOGIN_BLOCKED', user, context, severity: 'MEDIUM', nextData: { reason: 'ACCOUNT_INCOMPLETE' } })
        throw new AppError('Student бүртгэлийг идэвхжүүлж чадсангүй. Сургуулийн домэйн болон email баталгаажуулалтыг шалгана уу.', 403, 'ACCOUNT_INCOMPLETE')
      }
      if (user.status !== 'ACTIVE') {
        await auditAuth(repository, { action: 'LOGIN_BLOCKED', user, context, severity: 'MEDIUM', nextData: { reason: 'USER_INACTIVE' } })
        throw authError('Таны бүртгэл идэвхгүй байна. Админтай холбогдоно уу.')
      }
      if (user.university && user.university.status !== 'ACTIVE') {
        await auditAuth(repository, { action: 'LOGIN_BLOCKED', user, context, severity: 'MEDIUM', nextData: { reason: 'UNIVERSITY_INACTIVE' } })
        throw authError('Таны сургуулийн workspace идэвхгүй байна.')
      }

      const mfaRequirement = await mfa.loginRequirement(user)
      if (mfaRequirement) {
        await auditAuth(repository, {
          action: mfaRequirement.mfaEnrollmentRequired ? 'LOGIN_MFA_ENROLLMENT_REQUIRED' : 'LOGIN_MFA_CHALLENGE_REQUIRED',
          user, context, severity: 'MEDIUM',
        })
        return { user: publicUser(user), redirectTo: null, ...mfaRequirement }
      }
      const rememberMe = user.role === 'STUDENT' && input.rememberMe === true
      const tokens = await issueTokens(user, context, { remembered: rememberMe })
      await repository.markLogin(user.id)
      await auditAuth(repository, { action: 'LOGIN_SUCCEEDED', user, context })
      return {
        user: publicUser(user),
        redirectTo: {
          PLATFORM_SUPER_ADMIN: '/platform',
          UNIVERSITY_ADMIN: '/admin',
          STAFF: '/staff',
          STUDENT: '/student',
        }[user.role],
        ...tokens,
      }
    },

    async refresh(refreshToken, context) {
      let payload
      try {
        payload = verifyRefreshToken(refreshToken)
      } catch {
        throw authError('Session хүчингүй эсвэл хугацаа дууссан байна.')
      }
      if (typeof payload === 'string') throw authError()
      if (payload.type !== 'refresh') throw authError()
      const session = await repository.findSession(payload.sid)
      const refreshTokenHash = hashToken(refreshToken)
      if (
        !session ||
        session.userId !== payload.sub ||
        session.refreshTokenHash !== refreshTokenHash
      ) throw authError('Session хүчингүй эсвэл хугацаа дууссан байна.')

      if (session.revokedAt) {
        await repository.compromiseSessionFamily(session.familyId ?? session.id)
        await auditAuth(repository, { action: 'REFRESH_TOKEN_REUSE_DETECTED', user: session.user, context, severity: 'HIGH', nextData: { familyRevoked: true } })
        throw new AppError('Session хүчингүй болсон байна.', 401, 'REFRESH_TOKEN_REUSED')
      }
      if (session.compromisedAt || session.expiresAt <= new Date() || sessionIdleExpired(session)) {
        throw authError('Session хүчингүй эсвэл хугацаа дууссан байна.')
      }

      const user = await repository.findUserById(session.userId)
      if (!user || user.status !== 'ACTIVE') throw authError('Бүртгэл идэвхгүй байна.')
      if (user.university && user.university.status !== 'ACTIVE') {
        throw authError('Таны сургуулийн workspace идэвхгүй байна.')
      }

      const nextSessionId = crypto.randomUUID()
      const nextRefreshToken = signRefreshToken(user, nextSessionId)
      const rotation = await repository.rotateSessionAtomic({
        currentSessionId: session.id,
        userId: session.userId,
        expectedRefreshTokenHash: refreshTokenHash,
        nextSession: {
          id: nextSessionId,
          userId: session.userId,
          familyId: session.familyId ?? session.id,
          rotatedFromId: session.id,
          refreshTokenHash: hashToken(nextRefreshToken),
          expiresAt: expiryFromToken(nextRefreshToken),
          userAgent: context?.userAgent,
          ipAddress: context?.ipAddress,
          mfaVerifiedAt: session.mfaVerifiedAt,
          remembered: Boolean(session.remembered),
        },
      })
      if (rotation.status === 'reused') {
        await auditAuth(repository, { action: 'REFRESH_TOKEN_REUSE_DETECTED', user, context, severity: 'HIGH', nextData: { familyRevoked: true } })
        throw new AppError('Session хүчингүй болсон байна.', 401, 'REFRESH_TOKEN_REUSED')
      }
      if (rotation.status !== 'rotated') {
        throw authError('Session хүчингүй эсвэл хугацаа дууссан байна.')
      }
      await auditAuth(repository, { action: 'SESSION_REFRESHED', user, context })
      return {
        user: publicUser(user),
        accessToken: signAccessToken(user, nextSessionId, { mfaVerified: Boolean(session.mfaVerifiedAt) }),
        refreshToken: nextRefreshToken,
        rememberMe: Boolean(session.remembered),
      }
    },

    async requestPasswordReset(payload, context) {
      const input = validate(passwordResetRequestSchema, payload)
      const user = await repository.findUserByEmail(input.email)
      if (!user || user.status !== 'ACTIVE' || user.role !== 'STUDENT') {
        await auditAuth(repository, { action: 'PASSWORD_RESET_OTP_REQUESTED', user, email: input.email, context, nextData: { eligible: false } })
        return resetRequestResponse
      }

      const latest = await repository.findLatestPasswordResetOtpChallenge(user.id)
      if (latest) {
        const elapsedSeconds = Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 1000)
        const retryAfterSeconds = Math.max(0, env.PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds)
        if (retryAfterSeconds > 0) {
          throw new AppError(`Шинэ OTP авахын өмнө ${retryAfterSeconds} секунд хүлээнэ үү.`, 429, 'PASSWORD_RESET_OTP_COOLDOWN', { retryAfterSeconds })
        }
      }

      const googleIdentity = user.oauthAccounts?.find(account => account.provider === 'GOOGLE' && account.providerEmail && account.providerEmailVerified)
      const destination = googleIdentity?.providerEmail || user.gmail || (user.emailVerifiedAt ? user.email : null)
      if (!destination) {
        await auditAuth(repository, { action: 'PASSWORD_RESET_OTP_BLOCKED', user, context, severity: 'MEDIUM', nextData: { reason: 'NO_VERIFIED_DESTINATION' } })
        throw new AppError('Нууц үг сэргээх баталгаажсан имэйл олдсонгүй. Google account холбоно уу эсвэл сургуулийн имэйлээ баталгаажуулна уу.', 409, 'PASSWORD_RESET_DESTINATION_MISSING')
      }

      const challengeToken = createOpaqueToken()
      const challengeTokenHash = hashToken(challengeToken)
      const code = createVerificationCode()
      const codeHash = hashPasswordResetOtp(user.id, challengeTokenHash, code)
      const expiresAt = new Date(Date.now() + durationToMs(env.PASSWORD_RESET_OTP_EXPIRES_IN))
      await repository.invalidatePasswordResetOtpChallenges(user.id)
      await repository.createPasswordResetOtpChallenge({
        userId: user.id, challengeTokenHash, codeHash, destination, expiresAt,
      })
      try {
        const delivery = await mailer.sendPasswordResetOtp({
          to: destination, code,
          expiresInMinutes: Math.ceil(durationToMs(env.PASSWORD_RESET_OTP_EXPIRES_IN) / 60_000),
        })
        if (!delivery?.delivered) throw new Error('OTP delivery is disabled')
      } catch (error) {
        await repository.deletePasswordResetOtpChallenge(challengeTokenHash)
        if (env.NODE_ENV !== 'test') console.error('Password reset OTP delivery failed', error)
        throw new AppError('OTP код илгээж чадсангүй. Resend/имэйл тохиргоогоо шалгаад дахин оролдоно уу.', 503, 'PASSWORD_RESET_OTP_DELIVERY_FAILED')
      }
      await auditAuth(repository, { action: 'PASSWORD_RESET_OTP_SENT', user, context, nextData: { destination: maskEmail(destination), expiresAt } })
      return { ...resetRequestResponse, challengeToken, destination: maskEmail(destination), expiresAt: expiresAt.toISOString() }
    },

    async verifyPasswordResetOtp(payload, context) {
      const input = validate(passwordResetOtpVerifySchema, payload)
      const challengeTokenHash = hashToken(input.challengeToken)
      const candidate = await prisma.passwordResetOtpChallenge.findUnique({ where: { challengeTokenHash }, select: { userId: true } })
      const codeHash = candidate ? hashPasswordResetOtp(candidate.userId, challengeTokenHash, input.code) : 'invalid'
      const result = await repository.consumePasswordResetOtpChallenge({
        challengeTokenHash, codeHash, maxAttempts: env.PASSWORD_RESET_OTP_MAX_ATTEMPTS,
      })
      if (result.status !== 'verified') {
        await auditAuth(repository, { action: 'PASSWORD_RESET_OTP_FAILED', user: result.user, context, severity: 'MEDIUM', nextData: { reason: result.status } })
        const message = result.status === 'attemptsExceeded' ? 'OTP кодын оролдлогын хязгаар дууссан. Шинэ код авна уу.' : 'OTP код буруу эсвэл хугацаа дууссан байна.'
        throw new AppError(message, 400, 'PASSWORD_RESET_OTP_INVALID')
      }
      const resetToken = createOpaqueToken()
      const resetTokenHash = hashToken(resetToken)
      await repository.invalidatePasswordResetTokens(result.user.id)
      await repository.createPasswordResetToken({
        userId: result.user.id, tokenHash: resetTokenHash,
        expiresAt: new Date(Date.now() + durationToMs(env.PASSWORD_RESET_TOKEN_EXPIRES_IN)),
      })
      await auditAuth(repository, { action: 'PASSWORD_RESET_OTP_VERIFIED', user: result.user, context, severity: 'MEDIUM' })
      return { resetToken, expiresIn: env.PASSWORD_RESET_TOKEN_EXPIRES_IN }
    },

    async confirmPasswordReset(payload, context) {
      const input = validate(passwordResetConfirmSchema, payload)
      const tokenHash = hashToken(input.token)
      if (typeof repository.findPasswordResetToken === 'function') {
        const candidate = await repository.findPasswordResetToken(tokenHash)
        if (candidate?.user) await passwordSecurity.assertHistory(candidate.user.id, input.password, candidate.user.passwordHash)
      } else {
        passwordSecurity.assertNotCommon(input.password)
      }
      const result = await repository.consumePasswordResetToken({
        tokenHash,
        passwordHash: await hashPassword(input.password),
      })
      if (result.status !== 'reset') {
        await auditAuth(repository, { action: 'PASSWORD_RESET_FAILED', context, severity: 'MEDIUM', nextData: { reason: 'TOKEN_INVALID' } })
        throw new AppError(
          'Нууц үг сэргээх холбоос хүчингүй эсвэл хугацаа дууссан байна.',
          400,
          'PASSWORD_RESET_TOKEN_INVALID',
        )
      }
      await auditAuth(repository, { action: 'PASSWORD_RESET_COMPLETED', user: { id: result.userId }, context, severity: 'MEDIUM', nextData: { sessionsRevoked: true } })
      return { message: 'Нууц үг амжилттай шинэчлэгдлээ. Дахин нэвтэрнэ үү.' }
    },

    async logout(sessionId, user, context) {
      const result = await repository.revokeSession(sessionId)
      await auditAuth(repository, { action: 'LOGOUT_CURRENT_SESSION', user, context })
      return result
    },
    async logoutAll(userId, user, context) {
      const result = await repository.revokeAllSessions(userId)
      await auditAuth(repository, { action: 'LOGOUT_ALL_SESSIONS', user, context, severity: 'MEDIUM' })
      return result
    },
  }
}

export const authService = createAuthService(authRepository, emailService, {
  loginSecurity: loginSecurityService,
  mfa: mfaService,
  passwordSecurity: {
    assertNotCommon: assertNotCommonBreachedPassword,
    assertHistory: assertPasswordHistory,
  },
})
