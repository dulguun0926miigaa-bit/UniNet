import { Router } from 'express'
import { authService } from './auth.service.js'
import { passwordResetOtpVerifySchema } from './validation.js'
import { passwordPolicy } from '../utils/password.js'
import { googleOAuthService } from './google-oauth.service.js'
import { mfaService } from './mfa.service.js'
import { emailChangeService } from './email-change.service.js'
import { requireStepUp } from '../middleware/step-up.js'
import { authenticate, requireRole } from '../middleware/authenticate.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import { AppError } from '../utils/app-error.js'
import { env } from '../config/env.js'
import { createHttpUrlSchema, optionalHttpUrl } from '../validation/safe-url.js'
import { authAccountLimiter, authChallengeLimiter, authIpLimiter, registrationAccountLimiter, registrationIpLimiter } from '../middleware/rate-limits.js'

const router = Router()
const context = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') })
const refreshCookieName = 'uninet.refresh'
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
}

function assertTrustedOrigin(req) {
  const origin = req.get('origin')
  if (origin && !env.corsOrigins.includes(origin)) {
    throw new AppError('Хүсэлтийн origin зөвшөөрөгдөөгүй.', 403, 'ORIGIN_NOT_ALLOWED')
  }
}

function sessionCookieOptions(result = {}) {
  return result.rememberMe ? { ...refreshCookieOptions, maxAge: env.REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000 } : refreshCookieOptions
}

function sendSession(res, status, result) {
  const { refreshToken, ...payload } = result
  res.cookie(refreshCookieName, refreshToken, sessionCookieOptions(result))
  return res.status(status).json(payload)
}

function sendAuthResult(res, status, result) {
  if (result?.refreshToken) return sendSession(res, status, result)
  return res.status(status).json(result)
}

function clearRefreshCookie(res) {
  res.clearCookie(refreshCookieName, refreshCookieOptions)
}

const oauthStateCookie = 'uninet.oauth.state'
const oauthVerifierCookie = 'uninet.oauth.verifier'
const oauthPendingCookie = 'uninet.oauth.pending'
const oauthMfaCookie = 'uninet.oauth.mfa'
const oauthCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth/google',
  maxAge: 10 * 60 * 1000,
}

const schoolEmailSchema = z.string().trim().email().transform(value => value.toLowerCase())
const googleOnboardingSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('LINK_EXISTING'),
    schoolEmail: schoolEmailSchema,
    password: z.string().min(1).max(200),
  }).strict(),
  z.object({
    mode: z.literal('REGISTER_NEW'),
    schoolEmail: schoolEmailSchema,
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    branchSchool: z.string().trim().min(1).max(160),
    major: z.string().trim().min(1).max(160),
    enrollmentYear: z.coerce.number().int().min(new Date().getUTCFullYear() - 15).max(new Date().getUTCFullYear()),
    password: z.string().min(passwordPolicy.minLength).regex(
      passwordPolicy.pattern,
      'Нууц үг том, жижиг үсэг, тоо болон тусгай тэмдэг агуулсан байна.',
    ),
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true),
  }).strict().refine(data => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Нууц үг таарахгүй байна.',
  }),
])

router.get('/google/start', authIpLimiter, (req, res, next) => {
  try {
    const rememberMe = String(req.query.rememberMe || '').toLowerCase() === 'true'
    const { state, verifierToken, url } = googleOAuthService.start(req.query.intent, rememberMe)
    res.cookie(oauthStateCookie, state, { ...oauthCookieOptions, maxAge: 5 * 60 * 1000 })
    res.cookie(oauthVerifierCookie, verifierToken, { ...oauthCookieOptions, maxAge: 5 * 60 * 1000 })
    res.redirect(302, url)
  } catch (error) { next(error) }
})

router.get('/google/callback', authIpLimiter, async (req, res) => {
  const clearOAuthCookies = () => {
    res.clearCookie(oauthStateCookie, oauthCookieOptions)
    res.clearCookie(oauthVerifierCookie, oauthCookieOptions)
  }
  if (req.query.error) {
    clearOAuthCookies()
    const code = req.query.error === 'access_denied' ? 'GOOGLE_AUTH_CANCELLED' : 'GOOGLE_AUTH_FAILED'
    return res.redirect(302, `${env.APP_URL}/?oauth=error&code=${encodeURIComponent(code)}`)
  }
  try {
    const result = await googleOAuthService.callback({
      code: req.query.code,
      state: req.query.state,
      stateCookie: req.cookies[oauthStateCookie],
      verifierCookie: req.cookies[oauthVerifierCookie],
    }, context(req))
    clearOAuthCookies()
    if (result.type === 'session') {
      const { refreshToken } = result
      res.cookie(refreshCookieName, refreshToken, sessionCookieOptions(result))
      return res.redirect(302, `${env.APP_URL}/?oauth=success`)
    }
    if (result.type === 'verification') {
      return res.redirect(302, `${env.APP_URL}/?oauth=verify&email=${encodeURIComponent(result.user?.email || '')}`)
    }
    if (result.type === 'mfa') {
      res.cookie(oauthMfaCookie, result.challengeToken, { ...oauthCookieOptions, path: '/api/auth' })
      return res.redirect(302, `${env.APP_URL}/?oauth=mfa`)
    }
    if (result.type === 'mfa-enrollment') {
      res.cookie(oauthMfaCookie, result.enrollmentToken, { ...oauthCookieOptions, path: '/api/auth' })
      return res.redirect(302, `${env.APP_URL}/?oauth=mfa-enroll`)
    }
    res.cookie(oauthPendingCookie, result.pendingToken, oauthCookieOptions)
    return res.redirect(302, `${env.APP_URL}/?oauth=onboarding`)
  } catch (error) {
    clearOAuthCookies()
    const code = error instanceof AppError ? error.code : 'GOOGLE_AUTH_FAILED'
    return res.redirect(302, `${env.APP_URL}/?oauth=error&code=${encodeURIComponent(code || 'GOOGLE_AUTH_FAILED')}`)
  }
})

router.get('/google/onboarding', authIpLimiter, (req, res, next) => {
  try { res.json({ profile: googleOAuthService.pending(req.cookies[oauthPendingCookie]) }) } catch (error) { next(error) }
})

router.post('/google/complete', registrationIpLimiter, registrationAccountLimiter, authIpLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = googleOnboardingSchema.parse(req.body)
    const result = await googleOAuthService.complete(req.cookies[oauthPendingCookie], input, context(req))
    res.clearCookie(oauthPendingCookie, oauthCookieOptions)
    sendAuthResult(res, 201, result)
  } catch (error) { next(error) }
})

router.post('/google/unlink', authenticate, authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ currentPassword: z.string().min(1).max(200) }).strict().parse(req.body)
    const result = await googleOAuthService.unlink(req.auth.user.id, input.currentPassword, context(req))
    clearRefreshCookie(res)
    res.json(result)
  } catch (error) { next(error) }
})

router.post('/register', registrationIpLimiter, registrationAccountLimiter, authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    sendAuthResult(res, 201, await authService.register(req.body, context(req)))
  } catch (error) { next(error) }
})

router.post('/verify-email', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    sendAuthResult(res, 200, await authService.verifyEmail(req.body, context(req)))
  } catch (error) { next(error) }
})

router.post('/resend-verification', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    res.status(202).json(await authService.resendEmailVerification(req.body, context(req)))
  } catch (error) { next(error) }
})

router.post('/login', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    sendAuthResult(res, 200, await authService.login(req.body, context(req)))
  } catch (error) { next(error) }
})


const mfaCodeSchema = z.string().trim().min(6).max(32)

router.post('/mfa/login/verify', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ challengeToken: z.string().min(20), code: mfaCodeSchema }).strict().parse(req.body)
    sendSession(res, 200, await mfaService.verifyLogin(input.challengeToken, input.code, context(req)))
  } catch (error) { next(error) }
})

router.post('/mfa/oauth/verify', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ code: mfaCodeSchema }).strict().parse(req.body)
    const challengeToken = req.cookies[oauthMfaCookie]
    if (!challengeToken) throw new AppError('Google MFA challenge олдсонгүй.', 401, 'OAUTH_MFA_CHALLENGE_MISSING')
    const result = await mfaService.verifyLogin(challengeToken, input.code, context(req))
    res.clearCookie(oauthMfaCookie, { ...oauthCookieOptions, path: '/api/auth' })
    sendSession(res, 200, result)
  } catch (error) { next(error) }
})

router.post('/mfa/oauth/bootstrap/start', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const enrollmentToken = req.cookies[oauthMfaCookie]
    if (!enrollmentToken) throw new AppError('Google MFA enrollment олдсонгүй.', 401, 'OAUTH_MFA_ENROLLMENT_MISSING')
    res.json(await mfaService.startBootstrapEnrollment(enrollmentToken))
  } catch (error) { next(error) }
})

router.post('/mfa/oauth/bootstrap/confirm', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ setupToken: z.string().min(20), code: mfaCodeSchema }).strict().parse(req.body)
    const enrollmentToken = req.cookies[oauthMfaCookie]
    if (!enrollmentToken) throw new AppError('Google MFA enrollment олдсонгүй.', 401, 'OAUTH_MFA_ENROLLMENT_MISSING')
    const result = await mfaService.confirmBootstrapEnrollment(enrollmentToken, input.setupToken, input.code, context(req))
    res.clearCookie(oauthMfaCookie, { ...oauthCookieOptions, path: '/api/auth' })
    sendSession(res, 200, result)
  } catch (error) { next(error) }
})

router.post('/mfa/bootstrap/start', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ enrollmentToken: z.string().min(20) }).strict().parse(req.body)
    res.json(await mfaService.startBootstrapEnrollment(input.enrollmentToken))
  } catch (error) { next(error) }
})

router.post('/mfa/bootstrap/confirm', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ enrollmentToken: z.string().min(20), setupToken: z.string().min(20), code: mfaCodeSchema }).strict().parse(req.body)
    sendSession(res, 200, await mfaService.confirmBootstrapEnrollment(input.enrollmentToken, input.setupToken, input.code, context(req)))
  } catch (error) { next(error) }
})

router.get('/mfa/status', authenticate, requireRole('UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'), async (req, res, next) => {
  try { res.json(await mfaService.status(req.auth.user.id, req.auth.user.role)) } catch (error) { next(error) }
})

router.post('/mfa/enroll/start', authenticate, requireRole('UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'), authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ currentPassword: z.string().min(1).max(200) }).strict().parse(req.body)
    res.json(await mfaService.startEnrollment(req.auth.user, input.currentPassword))
  } catch (error) { next(error) }
})

router.post('/mfa/enroll/confirm', authenticate, requireRole('UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'), authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ setupToken: z.string().min(20), code: mfaCodeSchema }).strict().parse(req.body)
    res.json(await mfaService.confirmEnrollment({ userId: req.auth.user.id, setupToken: input.setupToken, code: input.code, context: context(req) }))
  } catch (error) { next(error) }
})

router.post('/mfa/recovery-codes/regenerate', authenticate, requireRole('UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'), authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ currentPassword: z.string().min(1).max(200), code: mfaCodeSchema }).strict().parse(req.body)
    res.json(await mfaService.regenerateRecoveryCodes(req.auth.user, input.currentPassword, input.code, context(req)))
  } catch (error) { next(error) }
})

router.delete('/mfa', authenticate, requireRole('UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'), authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ currentPassword: z.string().min(1).max(200), code: mfaCodeSchema }).strict().parse(req.body)
    const result = await mfaService.disable(req.auth.user, input.currentPassword, input.code, context(req))
    clearRefreshCookie(res)
    res.json(result)
  } catch (error) { next(error) }
})

router.post('/step-up', authenticate, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ currentPassword: z.string().min(1).max(200), code: z.string().trim().max(32).optional() }).strict().parse(req.body)
    res.json(await mfaService.createStepUp(req.auth.user, req.auth.session.id, input.currentPassword, input.code, context(req)))
  } catch (error) { next(error) }
})

router.post('/email-change/request', authenticate, requireStepUp(), authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ newEmail: schoolEmailSchema }).strict().parse(req.body)
    res.status(202).json(await emailChangeService.request(req.auth.user, input.newEmail, context(req)))
  } catch (error) { next(error) }
})

router.post('/email-change/confirm', authIpLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = z.object({ token: z.string().min(20) }).strict().parse(req.body)
    clearRefreshCookie(res)
    res.json(await emailChangeService.confirm(input.token, context(req)))
  } catch (error) { next(error) }
})

router.post('/refresh', authIpLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const refreshToken = req.cookies[refreshCookieName]
    if (!refreshToken) throw new AppError('Нэвтрэх session олдсонгүй.', 401, 'REFRESH_SESSION_MISSING')
    sendSession(res, 200, await authService.refresh(refreshToken, context(req)))
  } catch (error) {
    clearRefreshCookie(res)
    next(error)
  }
})

router.post('/password-reset/verify-otp', authIpLimiter, authChallengeLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    const input = passwordResetOtpVerifySchema.parse(req.body)
    res.json(await authService.verifyPasswordResetOtp(input, context(req)))
  } catch (error) { next(error) }
})

router.post('/password-reset/request', authIpLimiter, authAccountLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    res.status(202).json(await authService.requestPasswordReset(req.body, context(req)))
  } catch (error) { next(error) }
})

router.post('/password-reset/confirm', authIpLimiter, async (req, res, next) => {
  try {
    assertTrustedOrigin(req)
    res.json(await authService.confirmPasswordReset(req.body, context(req)))
  } catch (error) { next(error) }
})

router.get('/me', authenticate, (req, res) => {
  const user = { ...req.auth.user }
  delete user.passwordHash
  res.json({ user })
})

router.patch('/me/profile', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const input = z.object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      email: z.string().trim().email().transform(value => value.toLowerCase()),
      phone: z.string().trim().max(30).optional(),
      university: z.string().trim().max(160).optional(),
      department: z.string().trim().max(160).optional(),
      major: z.string().trim().max(160).optional(),
      studentId: z.string().trim().max(60).optional(),
      enrollmentYear: z.union([z.coerce.number().int().min(1950).max(new Date().getUTCFullYear()), z.literal('')]).optional(),
      graduationYear: z.union([z.coerce.number().int().min(1900).max(2100), z.literal('')]).optional(),
      about: z.string().trim().max(4000).optional(),
      cv: optionalHttpUrl.optional(),
      portfolio: optionalHttpUrl.optional(),
      github: createHttpUrlSchema({ hosts: ['github.com'] }).or(z.literal('')).optional(),
      linkedin: createHttpUrlSchema({ hosts: ['linkedin.com'] }).or(z.literal('')).optional(),
    }).strict().parse(req.body)
    if (input.email !== req.auth.user.normalizedEmail) {
      throw new AppError('Баталгаажсан university email-ийг профайлаас өөрчлөх боломжгүй.', 409, 'VERIFIED_EMAIL_LOCKED')
    }
    if (input.university && ![req.auth.user.university?.shortName, req.auth.user.university?.name].includes(input.university)) {
      throw new AppError('Баталгаажсан сургуулийг профайлаас өөрчлөх боломжгүй.', 409, 'VERIFIED_UNIVERSITY_LOCKED')
    }
    const result = await prisma.studentProfile.update({
      where: { userId: req.auth.user.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        department: input.department,
        major: input.major,
        studentId: input.studentId,
        enrollmentYear: input.enrollmentYear === '' ? null : input.enrollmentYear,
        graduationYear: input.graduationYear === '' ? null : input.graduationYear,
        bio: input.about,
        cvUrl: input.cv,
        portfolioUrl: input.portfolio,
        githubUrl: input.github,
        linkedinUrl: input.linkedin,
      },
    })
    res.json({ profile: result })
  } catch (error) { next(error) }
})

router.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    await authService.logoutAll(req.auth.user.id, req.auth.user, context(req))
    clearRefreshCookie(res)
    res.status(204).end()
  } catch (error) { next(error) }
})

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await authService.logout(req.auth.session.id, req.auth.user, context(req))
    clearRefreshCookie(res)
    res.status(204).end()
  } catch (error) { next(error) }
})

export { assertTrustedOrigin, refreshCookieName, refreshCookieOptions, router as authRouter }
