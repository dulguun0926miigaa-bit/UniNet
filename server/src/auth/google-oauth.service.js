import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { createOpaqueToken, expiryFromToken, hashToken, signAccessToken, signRefreshToken } from '../utils/tokens.js'
import { authRepository } from './auth.repository.js'
import { buildPolicyAcceptanceData, requireRegistrationPolicies } from '../privacy/policy.js'
import { prisma } from '../lib/prisma.js'
import { CANONICAL_GOOGLE_ISSUER, validateGoogleIdentityClaims } from './google-oauth.security.js'
import { resolveGoogleAccountPrelink, resolveGoogleAccountPrelinkConfig, resolveLegacyGoogleAccountPrelink } from './google-account-prelinks.js'
import { mfaService } from './mfa.service.js'
import { emailService } from './email.service.js'
import { assertNotCommonBreachedPassword } from './password-security.js'

const stateAudience = 'uninet-google-state'
const pendingAudience = 'uninet-google-onboarding'
const verifierAudience = 'uninet-google-pkce'


const durationToMs = value => {
  const match = /^(\d+)(s|m|h|d)$/u.exec(String(value || ''))
  if (!match) return 10 * 60 * 1000
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]
  return Number(match[1]) * unit
}

const createVerificationCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
const hashVerificationCode = (userId, code) => crypto
  .createHmac('sha256', env.emailVerificationSecret)
  .update(`${userId}:${code}`)
  .digest('hex')

async function sendGoogleRegistrationVerification(user, context = {}) {
  const code = createVerificationCode()
  const tokenHash = hashVerificationCode(user.id, code)
  const expiresAt = new Date(Date.now() + durationToMs(env.EMAIL_VERIFICATION_CODE_EXPIRES_IN))
  await authRepository.invalidateEmailVerificationTokens(user.id)
  await authRepository.createEmailVerificationToken({ userId: user.id, tokenHash, expiresAt })
  try {
    const delivery = await emailService.sendEmailVerification({
      to: user.email,
      code,
      expiresInMinutes: Math.ceil(durationToMs(env.EMAIL_VERIFICATION_CODE_EXPIRES_IN) / 60_000),
    })
    if (!delivery?.delivered) throw new Error('Email verification delivery is disabled')
  } catch (error) {
    await authRepository.deleteEmailVerificationToken(tokenHash)
    await audit('GOOGLE_OAUTH_EMAIL_VERIFICATION_DELIVERY_FAILED', user, context, {}, 'MEDIUM')
    if (env.NODE_ENV !== 'test') console.error('Google registration verification delivery failed', error)
    throw new AppError(
      'Сургуулийн имэйл рүү баталгаажуулах код илгээж чадсангүй. Түр хүлээгээд дахин оролдоно уу.',
      503,
      'EMAIL_VERIFICATION_DELIVERY_FAILED',
    )
  }
  await audit('GOOGLE_OAUTH_EMAIL_VERIFICATION_SENT', user, context, { expiresAt }, 'INFO')
  return { expiresAt }
}

const publicUser = user => ({
  id: user.id,
  email: user.email,
  gmail: user.gmail,
  studentEmail: user.studentEmail,
  authProvider: user.authProvider,
  googleIssuer: user.googleIssuer,
  googleId: user.googleId,
  googleLinkedAt: user.googleLinkedAt,
  firstName: user.studentProfile?.firstName ?? user.staffProfile?.firstName ?? '',
  lastName: user.studentProfile?.lastName ?? user.staffProfile?.lastName ?? '',
  name: [user.studentProfile?.firstName ?? user.staffProfile?.firstName, user.studentProfile?.lastName ?? user.staffProfile?.lastName].filter(Boolean).join(' '),
  role: user.role,
  status: user.status,
  universityId: user.universityId,
  university: user.university && {
    id: user.university.id,
    name: user.university.name,
    shortName: user.university.shortName,
    slug: user.university.slug,
    logoUrl: user.university.logoUrl,
  },
  studentProfile: user.studentProfile,
  staffProfile: user.staffProfile,
})

async function issueTokens(user, context = {}, { remembered = false } = {}) {
  const provisional = createOpaqueToken()
  const session = await authRepository.createSession({
    userId: user.id,
    refreshTokenHash: hashToken(provisional),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    remembered,
  })
  const accessToken = signAccessToken(user, session.id)
  const refreshToken = signRefreshToken(user, session.id)
  await authRepository.updateSessionToken(session.id, hashToken(refreshToken), expiryFromToken(refreshToken))
  return { accessToken, refreshToken, rememberMe: remembered }
}

function signState(payload, audience, expiresIn) {
  return jwt.sign(payload, env.oauthStateSecret, {
    algorithm: 'HS256', issuer: 'uninet-api', audience, expiresIn,
  })
}

function verifyState(token, audience) {
  return jwt.verify(token, env.oauthStateSecret, {
    algorithms: ['HS256'], issuer: 'uninet-api', audience,
  })
}

async function exchangeCode(code, codeVerifier) {
  const response = await fetch(env.GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(12_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.id_token) {
    throw new AppError('Google нэвтрэлтийн кодыг шалгаж чадсангүй.', 502, 'GOOGLE_TOKEN_EXCHANGE_FAILED')
  }
  return payload
}

async function verifyGoogleIdentity(idToken, expectedNonce) {
  const response = await fetch(`${env.GOOGLE_OAUTH_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  const rawIdentity = await response.json().catch(() => null)
  if (!response.ok) throw new AppError('Google identity баталгаажаагүй байна.', 401, 'GOOGLE_IDENTITY_INVALID')
  const identity = validateGoogleIdentityClaims(rawIdentity, {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    expectedNonce,
  })
  return {
    googleIssuer: identity.issuer,
    googleId: identity.subject,
    gmail: identity.email,
    firstName: identity.firstName,
    lastName: identity.lastName,
    picture: identity.picture,
  }
}

async function audit(action, user, context, nextData = {}, severity = 'INFO') {
  await prisma.auditLog.create({
    data: {
      actorId: user?.id ?? null,
      universityId: user?.universityId ?? null,
      action,
      resourceType: 'OAUTH_SECURITY_EVENT',
      resourceId: user?.id ?? null,
      resourceName: user?.gmail ? `google:${crypto.createHash('sha256').update(user.gmail).digest('hex').slice(0, 20)}` : 'google-oauth',
      nextData,
      severity,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent?.slice(0, 500),
    },
  })
}

export const googleOAuthService = {
  enabled() { return Boolean(env.GOOGLE_OAUTH_ENABLED) },

  start(intent = 'login', rememberMe = false) {
    if (!env.GOOGLE_OAUTH_ENABLED) throw new AppError('Google OAuth одоогоор тохируулагдаагүй.', 503, 'GOOGLE_OAUTH_DISABLED')
    const nonce = crypto.randomBytes(24).toString('base64url')
    const codeVerifier = crypto.randomBytes(48).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    const state = signState({ nonce, intent: intent === 'register' ? 'register' : 'login', rememberMe: Boolean(rememberMe) }, stateAudience, '5m')
    const verifierToken = signState({ nonce, codeVerifier }, verifierAudience, '5m')
    const url = new URL(env.GOOGLE_OAUTH_AUTH_URL)
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
      access_type: 'online',
    }).toString()
    return { state, verifierToken, url: url.toString() }
  },

  async callback({ code, state, stateCookie, verifierCookie }, context) {
    if (!env.GOOGLE_OAUTH_ENABLED) throw new AppError('Google OAuth одоогоор тохируулагдаагүй.', 503, 'GOOGLE_OAUTH_DISABLED')
    if (!code || !state || !stateCookie || state !== stateCookie) throw new AppError('OAuth state тохирохгүй байна.', 400, 'OAUTH_STATE_MISMATCH')
    if (!verifierCookie) throw new AppError('OAuth PKCE verifier олдсонгүй.', 400, 'OAUTH_PKCE_MISSING')
    const statePayload = verifyState(state, stateAudience)
    const verifierPayload = verifyState(verifierCookie, verifierAudience)
    if (verifierPayload.nonce !== statePayload.nonce) throw new AppError('OAuth nonce тохирохгүй байна.', 400, 'OAUTH_NONCE_MISMATCH')
    const tokens = await exchangeCode(code, verifierPayload.codeVerifier)
    const identity = await verifyGoogleIdentity(tokens.id_token, statePayload.nonce)
    const oauthAccount = await prisma.oAuthAccount.findUnique({
      where: { issuer_providerSubject: { issuer: identity.googleIssuer, providerSubject: identity.googleId } },
      include: { user: { include: { university: true, studentProfile: true, staffProfile: true } } },
    })
    let user = oauthAccount?.user ?? await prisma.user.findFirst({
      where: { googleIssuer: identity.googleIssuer, googleId: identity.googleId },
      include: { university: true, studentProfile: true, staffProfile: true },
    })
    if (!user) {
      const prelinkedAccountEmail = resolveGoogleAccountPrelink(identity.gmail)
      if (prelinkedAccountEmail) {
        user = await prisma.user.findUnique({
          where: { normalizedEmail: prelinkedAccountEmail },
          include: { university: true, studentProfile: true, staffProfile: true },
        })
        if (!user) {
          const legacyAccountEmail = resolveLegacyGoogleAccountPrelink(identity.gmail)
          const legacyUser = legacyAccountEmail
            ? await prisma.user.findUnique({
                where: { normalizedEmail: legacyAccountEmail },
                include: { university: true, studentProfile: true, staffProfile: true },
              })
            : null
          if (legacyUser && (legacyUser.role !== 'STAFF' || legacyUser.status !== 'ACTIVE')) {
            throw new AppError('Google account-д холбосон legacy Staff бүртгэл идэвхгүй эсвэл role тохирохгүй байна.', 409, 'GOOGLE_PRELINK_TARGET_INVALID')
          }
          if (legacyUser?.googleId && (legacyUser.googleId !== identity.googleId || legacyUser.googleIssuer !== identity.googleIssuer)) {
            throw new AppError('Legacy Staff account өөр Google account-тай аль хэдийн холбогдсон байна.', 409, 'OAUTH_ACCOUNT_ALREADY_LINKED')
          }
          if (legacyUser) {
            user = await prisma.$transaction(async tx => {
              const targetRosterMember = legacyUser.universityId
                ? await tx.universityMember.findUnique({
                    where: {
                      universityId_normalizedEmail: {
                        universityId: legacyUser.universityId,
                        normalizedEmail: prelinkedAccountEmail,
                      },
                    },
                  })
                : null
              if (legacyUser.universityId) {
                await tx.universityMember.updateMany({
                  where: {
                    universityId: legacyUser.universityId,
                    normalizedEmail: legacyAccountEmail,
                  },
                  data: targetRosterMember
                    ? { employeeCode: null }
                    : { email: prelinkedAccountEmail, normalizedEmail: prelinkedAccountEmail },
                })
              }
              return tx.user.update({
                where: { id: legacyUser.id },
                data: { email: prelinkedAccountEmail, normalizedEmail: prelinkedAccountEmail },
                include: { university: true, studentProfile: true, staffProfile: true },
              })
            })
            await audit('GOOGLE_PRELINK_LEGACY_STAFF_EMAIL_MIGRATED', user, context, {
              previousEmail: legacyAccountEmail,
              nextEmail: prelinkedAccountEmail,
            }, 'MEDIUM')
          }
        }
        if (!user) {
          const prelinkConfig = resolveGoogleAccountPrelinkConfig(identity.gmail)
          const university = prelinkConfig?.universitySlug
            ? await prisma.university.findUnique({ where: { slug: prelinkConfig.universitySlug } })
            : null
          if (prelinkConfig && university?.status === 'ACTIVE') {
            const passwordHash = await hashPassword(crypto.randomBytes(48).toString('base64url'))
            user = await prisma.$transaction(async tx => {
              const provisionedUser = await tx.user.upsert({
                where: { normalizedEmail: prelinkedAccountEmail },
                update: {},
                create: {
                  email: prelinkedAccountEmail,
                  normalizedEmail: prelinkedAccountEmail,
                  passwordHash,
                  gmail: identity.gmail,
                  authProvider: 'GOOGLE',
                  role: 'STAFF',
                  status: 'ACTIVE',
                  universityId: university.id,
                  emailVerifiedAt: new Date(),
                },
              })
              if (provisionedUser.role !== 'STAFF' || provisionedUser.status !== 'ACTIVE' || provisionedUser.universityId !== university.id) {
                throw new AppError('Google prelink account-ийн role, status эсвэл сургууль тохирохгүй байна.', 409, 'GOOGLE_PRELINK_TARGET_INVALID')
              }
              await tx.universityMember.upsert({
                where: {
                  universityId_normalizedEmail: {
                    universityId: university.id,
                    normalizedEmail: prelinkedAccountEmail,
                  },
                },
                update: {
                  email: prelinkedAccountEmail,
                  firstName: identity.firstName || prelinkConfig.firstName,
                  lastName: identity.lastName || prelinkConfig.lastName,
                  memberType: 'STAFF',
                  enrollmentStatus: 'ACTIVE',
                },
                create: {
                  universityId: university.id,
                  email: prelinkedAccountEmail,
                  normalizedEmail: prelinkedAccountEmail,
                  firstName: identity.firstName || prelinkConfig.firstName,
                  lastName: identity.lastName || prelinkConfig.lastName,
                  memberType: 'STAFF',
                  enrollmentStatus: 'ACTIVE',
                },
              })
              await tx.staffProfile.upsert({
                where: { userId: provisionedUser.id },
                update: {},
                create: {
                  userId: provisionedUser.id,
                  universityId: university.id,
                  firstName: identity.firstName || prelinkConfig.firstName,
                  lastName: identity.lastName || prelinkConfig.lastName,
                  department: 'Карьер хөгжлийн төв',
                  jobTitle: 'Staff',
                  canCreateContent: true,
                  canManageRegistrations: true,
                  canManageApplications: true,
                  canManageSurveys: true,
                  canViewReports: true,
                },
              })
              return tx.user.findUnique({
                where: { id: provisionedUser.id },
                include: { university: true, studentProfile: true, staffProfile: true },
              })
            })
            await audit('GOOGLE_PRELINK_STAFF_PROVISIONED', user, context, {
              accountEmail: prelinkedAccountEmail,
              universitySlug: prelinkConfig.universitySlug,
            }, 'HIGH')
          }
        }
        if (!user) {
          throw new AppError(
            `Google account-д холбох Staff бүртгэл олдсонгүй: ${prelinkedAccountEmail}`,
            409,
            'GOOGLE_PRELINK_TARGET_NOT_FOUND',
          )
        }
        if (user.role !== 'STAFF' || user.status !== 'ACTIVE') {
          throw new AppError('Google account-д холбосон Staff бүртгэл идэвхгүй эсвэл role тохирохгүй байна.', 409, 'GOOGLE_PRELINK_TARGET_INVALID')
        }
        if (user.googleId && (user.googleId !== identity.googleId || user.googleIssuer !== identity.googleIssuer)) {
          throw new AppError('Энэ Staff account өөр Google account-тай аль хэдийн холбогдсон байна.', 409, 'OAUTH_ACCOUNT_ALREADY_LINKED')
        }
      }
    }
    if (!user) {
      const prelinkedUsers = await prisma.user.findMany({
        where: {
          gmail: { equals: identity.gmail, mode: 'insensitive' },
          googleId: null,
          status: 'ACTIVE',
        },
        include: { university: true, studentProfile: true, staffProfile: true },
        take: 2,
      })
      if (prelinkedUsers.length > 1) {
        throw new AppError('Энэ Google email олон account-д урьдчилан холбогдсон байна.', 409, 'GOOGLE_PRELINK_AMBIGUOUS')
      }
      user = prelinkedUsers[0] ?? null
    }
    if (user) {
      const linkedAt = user.googleLinkedAt ?? new Date()
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            gmail: identity.gmail,
            googleId: user.googleId ?? identity.googleId,
            googleIssuer: user.googleIssuer ?? identity.googleIssuer,
            googleLinkedAt: linkedAt,
            authProvider: user.authProvider === 'PASSWORD' ? 'PASSWORD_GOOGLE' : user.authProvider,
            lastLoginAt: new Date(),
          },
        }),
        prisma.oAuthAccount.upsert({
          where: { issuer_providerSubject: { issuer: identity.googleIssuer, providerSubject: identity.googleId } },
          update: { providerEmail: identity.gmail, providerEmailVerified: true, lastUsedAt: new Date() },
          create: { userId: user.id, provider: 'GOOGLE', issuer: identity.googleIssuer, providerSubject: identity.googleId, providerEmail: identity.gmail, providerEmailVerified: true, linkedAt, lastUsedAt: new Date() },
        }),
      ])
      if (user.status === 'PENDING_REVIEW' && user.role === 'STUDENT' && user.emailVerifiedAt) {
        const completion = await authRepository.completeRegistrationWithoutEmailVerification(user.id)
        if (completion.status === 'completed' || completion.status === 'alreadyCompleted') user = completion.user
      }
      if (user.status === 'PENDING_VERIFICATION') {
        await audit('GOOGLE_OAUTH_LOGIN_EMAIL_VERIFICATION_REQUIRED', user, context, { status: user.status }, 'LOW')
        return { type: 'verification', user: publicUser(user) }
      }
      if (user.status === 'PENDING_REVIEW') {
        throw new AppError('Student бүртгэлийг идэвхжүүлж чадсангүй. Сургуулийн email баталгаажуулалтыг шалгана уу.', 403, 'ACCOUNT_INCOMPLETE')
      }
      if (user.status !== 'ACTIVE') throw new AppError('Таны бүртгэл идэвхгүй байна.', 403, 'ACCOUNT_NOT_ACTIVE')
      const mfaRequirement = await mfaService.loginRequirement(user)
      if (mfaRequirement?.mfaRequired) {
        await audit('GOOGLE_OAUTH_MFA_CHALLENGE_REQUIRED', user, context, {}, 'MEDIUM')
        return { type: 'mfa', user: publicUser(user), challengeToken: mfaRequirement.challengeToken }
      }
      if (mfaRequirement?.mfaEnrollmentRequired) {
        await audit('GOOGLE_OAUTH_MFA_ENROLLMENT_REQUIRED', user, context, {}, 'MEDIUM')
        return { type: 'mfa-enrollment', user: publicUser(user), enrollmentToken: mfaRequirement.enrollmentToken }
      }
      const session = await issueTokens(user, context, { remembered: user.role === 'STUDENT' && statePayload.rememberMe === true })
      await audit('GOOGLE_OAUTH_LOGIN_SUCCEEDED', user, context)
      return { type: 'session', user: publicUser(user), ...session }
    }
    const pendingToken = signState({ ...identity, intent: statePayload.intent || 'login', rememberMe: statePayload.rememberMe === true }, pendingAudience, '10m')
    await audit('GOOGLE_OAUTH_ONBOARDING_STARTED', null, context, {
      gmailHash: crypto.createHash('sha256').update(identity.gmail).digest('hex').slice(0, 20),
      intent: statePayload.intent || 'login',
    })
    return { type: 'onboarding', pendingToken }
  },

  pending(token) {
    if (!token) throw new AppError('Google onboarding session олдсонгүй.', 401, 'GOOGLE_ONBOARDING_MISSING')
    const identity = verifyState(token, pendingAudience)
    return {
      gmail: identity.gmail,
      firstName: identity.firstName,
      lastName: identity.lastName,
      picture: identity.picture,
      intent: identity.intent === 'register' ? 'register' : 'login',
      rememberMe: identity.rememberMe === true,
    }
  },

  async complete(token, payload, context) {
    if (!token) throw new AppError('Google onboarding session олдсонгүй.', 401, 'GOOGLE_ONBOARDING_MISSING')
    const identity = verifyState(token, pendingAudience)
    const mode = payload.mode === 'LINK_EXISTING' ? 'LINK_EXISTING' : 'REGISTER_NEW'
    const schoolEmail = String(payload.schoolEmail || '').trim().toLowerCase()
    const firstName = String(payload.firstName || identity.firstName || '').trim()
    const lastName = String(payload.lastName || identity.lastName || '').trim()
    const branchSchool = String(payload.branchSchool || '').trim()
    const major = String(payload.major || '').trim()
    const enrollmentYear = Number(payload.enrollmentYear)
    const password = String(payload.password || '')
    const confirmPassword = String(payload.confirmPassword || '')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(schoolEmail)) throw new AppError('Сургуулийн имэйл буруу байна.', 422, 'SCHOOL_EMAIL_INVALID')
    const domainName = schoolEmail.split('@')[1]
    const domain = await authRepository.findUniversityDomain(domainName)
    if (!domain?.isActive || !domain.isVerified || domain.university.status !== 'ACTIVE') {
      throw new AppError('Энэ сургуулийн домэйн UniNet-д баталгаажаагүй байна.', 422, 'UNIVERSITY_DOMAIN_NOT_VERIFIED')
    }

    if (mode === 'LINK_EXISTING') {
      const password = String(payload.password || '')
      if (!password) throw new AppError('Одоогийн Student account-ийн нууц үгийг оруулна уу.', 422, 'PASSWORD_REQUIRED')
      const existing = await authRepository.findUserByEmail(schoolEmail)
      const validPassword = existing ? await verifyPassword(existing.passwordHash, password).catch(() => false) : false
      if (!existing || !validPassword || existing.role !== 'STUDENT') {
        throw new AppError('Сургуулийн имэйл эсвэл нууц үг буруу байна.', 401, 'OAUTH_LINK_CREDENTIALS_INVALID')
      }
      if (existing.universityId !== domain.university.id) {
        throw new AppError('Student account болон сургуулийн домэйн тохирохгүй байна.', 409, 'OAUTH_LINK_TENANT_MISMATCH')
      }
      if (existing.googleId && (existing.googleId !== identity.googleId || (existing.googleIssuer || CANONICAL_GOOGLE_ISSUER) !== identity.googleIssuer)) {
        throw new AppError('Энэ Student account өөр Google account-той аль хэдийн холбогдсон байна.', 409, 'OAUTH_ACCOUNT_ALREADY_LINKED')
      }
      const googleAccountOwner = await prisma.oAuthAccount.findUnique({
        where: { issuer_providerSubject: { issuer: identity.googleIssuer, providerSubject: identity.googleId } },
      })
      const googleOwner = googleAccountOwner ? { id: googleAccountOwner.userId } : await authRepository.findUserByGoogleIdentity(identity.googleIssuer, identity.googleId)
      if (googleOwner && googleOwner.id !== existing.id) {
        throw new AppError('Энэ Google account өөр UniNet бүртгэлтэй холбогдсон байна.', 409, 'GOOGLE_ACCOUNT_ALREADY_USED')
      }
      const linkedAt = new Date()
      let linked = await prisma.$transaction(async tx => {
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            googleId: identity.googleId,
            googleIssuer: identity.googleIssuer,
            gmail: identity.gmail,
            studentEmail: existing.studentEmail || schoolEmail,
            authProvider: 'PASSWORD_GOOGLE',
            googleLinkedAt: linkedAt,
            lastLoginAt: existing.status === 'ACTIVE' ? linkedAt : existing.lastLoginAt,
          },
          include: { university: true, studentProfile: true, staffProfile: true },
        })
        await tx.oAuthAccount.upsert({
          where: { userId_provider: { userId: existing.id, provider: 'GOOGLE' } },
          update: { issuer: identity.googleIssuer, providerSubject: identity.googleId, providerEmail: identity.gmail, providerEmailVerified: true, linkedAt, lastUsedAt: linkedAt },
          create: { userId: existing.id, provider: 'GOOGLE', issuer: identity.googleIssuer, providerSubject: identity.googleId, providerEmail: identity.gmail, providerEmailVerified: true, linkedAt, lastUsedAt: linkedAt },
        })
        return updated
      })
      if (linked.status === 'PENDING_REVIEW' && linked.emailVerifiedAt) {
        const completion = await authRepository.completeRegistrationWithoutEmailVerification(linked.id)
        if (completion.status === 'completed' || completion.status === 'alreadyCompleted') linked = completion.user
      }
      await audit('GOOGLE_OAUTH_EXISTING_STUDENT_LINKED', linked, context, { status: linked.status }, 'MEDIUM')
      if (linked.status !== 'ACTIVE') {
        throw new AppError('Student account идэвхгүй байна. Email баталгаажуулалт болон account төлвийг шалгана уу.', 403, 'ACCOUNT_NOT_ACTIVE')
      }
      const mfaRequirement = await mfaService.loginRequirement(linked)
      if (mfaRequirement) return { user: publicUser(linked), reviewRequired: false, redirectTo: null, ...mfaRequirement }
      const session = await issueTokens(linked, context, { remembered: identity.rememberMe === true })
      return { user: publicUser(linked), reviewRequired: false, redirectTo: '/student', ...session }
    }

    if (!firstName || !lastName || !branchSchool || !major) throw new AppError('Профайлын шаардлагатай мэдээллийг бүрэн оруулна уу.', 422, 'OAUTH_PROFILE_INCOMPLETE')
    if (!password || password !== confirmPassword) throw new AppError('Нууц үг таарахгүй байна.', 422, 'PASSWORD_CONFIRMATION_MISMATCH')
    assertNotCommonBreachedPassword(password)
    const year = new Date().getFullYear()
    if (!Number.isInteger(enrollmentYear) || enrollmentYear < year - 15 || enrollmentYear > year) throw new AppError('Элссэн он буруу байна.', 422, 'ENROLLMENT_YEAR_INVALID')
    if (payload.acceptedTerms !== true) throw new AppError('Үйлчилгээний нөхцөлийг зөвшөөрнө үү.', 422, 'POLICY_ACCEPTANCE_REQUIRED')
    const duplicate = await prisma.user.findFirst({ where: { OR: [{ googleIssuer: identity.googleIssuer, googleId: identity.googleId }, { normalizedEmail: schoolEmail }, { studentEmail: schoolEmail }] } })
    if (duplicate) throw new AppError('Google эсвэл сургуулийн имэйл өмнө нь бүртгэгдсэн байна.', 409, 'OAUTH_ACCOUNT_ALREADY_EXISTS')
    const policies = requireRegistrationPolicies(await authRepository.findCurrentRequiredPolicies('mn'))
    const acceptedAt = new Date()
    const user = await authRepository.registerStudent({
      user: {
        universityId: domain.university.id,
        email: schoolEmail,
        normalizedEmail: schoolEmail,
        studentEmail: schoolEmail,
        gmail: identity.gmail,
        googleId: identity.googleId,
        googleIssuer: identity.googleIssuer,
        authProvider: 'PASSWORD_GOOGLE',
        googleLinkedAt: new Date(),
        passwordHash: await hashPassword(password),
        role: 'STUDENT',
        status: 'PENDING_VERIFICATION',
        emailVerifiedAt: null,
      },
      profile: {
        universityId: domain.university.id,
        firstName,
        lastName,
        department: branchSchool,
        major,
        enrollmentYear,
      },
      policyAcceptances: buildPolicyAcceptanceData(undefined, policies, {
        acceptedAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        source: 'GOOGLE_OAUTH_REGISTRATION',
        route: '/api/auth/google/complete',
      }),
    })
    await prisma.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: 'GOOGLE',
        issuer: identity.googleIssuer,
        providerSubject: identity.googleId,
        providerEmail: identity.gmail,
        providerEmailVerified: true,
        linkedAt: user.googleLinkedAt ?? new Date(),
        lastUsedAt: new Date(),
      },
    })
    if (env.emailVerificationEnabled) {
      const verification = await sendGoogleRegistrationVerification(user, context)
      await audit('GOOGLE_OAUTH_ACCOUNT_CREATED_PENDING_EMAIL', user, context, { status: user.status }, 'MEDIUM')
      return {
        user: publicUser(user),
        verificationRequired: true,
        reviewRequired: false,
        redirectTo: '/verify-email',
        message: 'Google account холбогдлоо. Сургуулийн имэйлээр ирсэн 6 оронтой кодыг оруулна уу.',
        verificationExpiresAt: verification.expiresAt,
      }
    }

    const completion = await authRepository.completeRegistrationWithoutEmailVerification(user.id)
    if (completion.status !== 'completed' && completion.status !== 'alreadyCompleted') {
      throw new AppError('Бүртгэлийн төлөвийг шинэчилж чадсангүй.', 500, 'REGISTRATION_COMPLETION_FAILED')
    }
    const completedUser = completion.user
    await audit('GOOGLE_OAUTH_ACCOUNT_CREATED', completedUser, context, {
      status: completedUser.status,
      rosterMatched: completion.rosterMatched,
      emailVerificationBypassed: true,
    }, 'MEDIUM')
    const session = await issueTokens(completedUser, context, { remembered: identity.rememberMe === true })
    await authRepository.markLogin(completedUser.id)
    return { user: publicUser(completedUser), verificationRequired: false, reviewRequired: false, redirectTo: '/student', ...session }
  },

  async unlink(userId, currentPassword, context) {
    const user = await authRepository.findUserById(userId)
    const oauthAccount = user ? await prisma.oAuthAccount.findUnique({ where: { userId_provider: { userId: user.id, provider: 'GOOGLE' } } }) : null
    if (!user?.googleId && !oauthAccount) throw new AppError('Google account холбогдоогүй байна.', 409, 'GOOGLE_ACCOUNT_NOT_LINKED')
    if (user.authProvider !== 'PASSWORD_GOOGLE') {
      throw new AppError('Google холбоос салгахаас өмнө local нууц үгтэй account шаардлагатай.', 409, 'LOCAL_PASSWORD_REQUIRED_BEFORE_UNLINK')
    }
    const validPassword = await verifyPassword(user.passwordHash, String(currentPassword || '')).catch(() => false)
    if (!validPassword) throw new AppError('Одоогийн нууц үг буруу байна.', 401, 'CURRENT_PASSWORD_INVALID')
    const result = await prisma.$transaction(async tx => {
      await tx.oAuthAccount.deleteMany({ where: { userId: user.id, provider: 'GOOGLE' } })
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          googleId: null,
          googleIssuer: null,
          gmail: null,
          googleLinkedAt: null,
          authProvider: 'PASSWORD',
        },
      })
      const revoked = await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
      return { updated, sessionsRevoked: revoked.count }
    })
    await audit('GOOGLE_OAUTH_ACCOUNT_UNLINKED', user, context, { sessionsRevoked: result.sessionsRevoked }, 'MEDIUM')
    return { unlinked: true, sessionsRevoked: result.sessionsRevoked }
  },
}
