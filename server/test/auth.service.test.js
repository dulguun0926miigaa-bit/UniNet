import { beforeAll, describe, expect, it } from 'vitest'
import { hashPassword } from '../src/utils/password.js'

let createAuthService
let hashToken
let signRefreshToken
let verifyAccessToken
let env

beforeAll(async () => {
  ;({ createAuthService } = await import('../src/auth/auth.service.js'))
  ;({ hashToken, signRefreshToken, verifyAccessToken } = await import('../src/utils/tokens.js'))
  ;({ env } = await import('../src/config/env.js'))
})

const university = {
  id: 'a7ef7cda-8324-48a6-b08c-588d380f9158',
  name: 'Test University',
  shortName: 'TEST',
  slug: 'test',
  status: 'ACTIVE',
}

const requiredPolicies = [
  {
    id: '1f3a2e2e-6a0d-4b32-a41e-b6d1f27ed001',
    type: 'TERMS_OF_SERVICE',
    version: '1.0.0',
    locale: 'mn',
    checksum: 'terms-checksum',
    required: true,
  },
  {
    id: '1f3a2e2e-6a0d-4b32-a41e-b6d1f27ed002',
    type: 'PRIVACY_POLICY',
    version: '1.0.0',
    locale: 'mn',
    checksum: 'privacy-checksum',
    required: true,
  },
]

function sessionRepository(overrides = {}) {
  return {
    createSession: async () => ({ id: 'session-id' }),
    updateSessionToken: async () => undefined,
    markLogin: async () => undefined,
    ...overrides,
  }
}

describe('auth service', () => {
  it('registers a pending student and sends a one-time verification code without issuing a session', async () => {
    let created
    let storedToken
    let sentVerification
    const repository = sessionRepository({
      findUserByEmail: async () => null,
      findCurrentRequiredPolicies: async () => requiredPolicies,
      findUniversityDomain: async () => ({
        universityId: university.id,
        university,
        isActive: true,
        isVerified: true,
      }),
      registerStudent: async (data) => {
        created = data
        return {
          id: 'user-id',
          ...data.user,
          university,
          studentProfile: { ...data.profile, id: 'profile-id' },
          staffProfile: null,
        }
      },
      invalidateEmailVerificationTokens: async () => undefined,
      createEmailVerificationToken: async value => { storedToken = value },
      deleteEmailVerificationToken: async () => undefined,
    })
    const mailer = { sendEmailVerification: async value => { sentVerification = value; return { delivered: true } } }
    const result = await createAuthService(repository, mailer).register({
      firstName: 'Дөлгөөн',
      lastName: 'Бат',
      email: 'Student@Test.Example',
      password: 'Secure!Pass123',
      confirmPassword: 'Secure!Pass123',
      enrollmentYear: new Date().getUTCFullYear() - 2,
      acceptedTerms: true,
    })
    expect(created.user.role).toBe('STUDENT')
    expect(created.user.status).toBe('PENDING_VERIFICATION')
    expect(created.user.emailVerifiedAt).toBeNull()
    expect(created.user.normalizedEmail).toBe('student@test.example')
    expect(created.user.passwordHash).toMatch(/^\$argon2id\$/)
    expect(created.profile.enrollmentYear).toBe(new Date().getUTCFullYear() - 2)
    expect(created.policyAcceptances).toHaveLength(2)
    expect(storedToken).toMatchObject({ userId: 'user-id' })
    expect(storedToken.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(sentVerification.to).toBe('student@test.example')
    expect(sentVerification.code).toMatch(/^\d{6}$/)
    expect(storedToken.tokenHash).not.toContain(sentVerification.code)
    expect(result).toMatchObject({
      redirectTo: '/verify-email',
      verificationRequired: true,
      reviewRequired: false,
    })
    expect(result).not.toHaveProperty('accessToken')
  })

  it('can bypass the six-digit email step in local/demo mode and activate the student immediately', async () => {
    const previous = env.emailVerificationEnabled
    env.emailVerificationEnabled = false
    let mailCalls = 0
    try {
      const registeredUser = {
        id: 'bypass-user',
        email: 'new@student.test.example',
        normalizedEmail: 'new@student.test.example',
        universityId: university.id,
        role: 'STUDENT',
        status: 'PENDING_VERIFICATION',
        emailVerifiedAt: null,
        university,
        studentProfile: { firstName: 'Номин', lastName: 'Тест' },
        staffProfile: null,
      }
      const completedUser = {
        ...registeredUser,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      }
      const repository = sessionRepository({
        findUserByEmail: async () => null,
        findCurrentRequiredPolicies: async () => requiredPolicies,
        findUniversityDomain: async () => ({ universityId: university.id, university, isActive: true, isVerified: true }),
        registerStudent: async () => registeredUser,
        completeRegistrationWithoutEmailVerification: async id => ({
          status: 'completed',
          user: { ...completedUser, id },
          rosterMatched: false,
        }),
      })
      const mailer = { sendEmailVerification: async () => { mailCalls += 1; return { delivered: true } } }
      const result = await createAuthService(repository, mailer).register({
        firstName: 'Номин',
        lastName: 'Тест',
        email: registeredUser.email,
        password: 'Secure!Pass123',
        confirmPassword: 'Secure!Pass123',
        acceptedTerms: true,
      })
      expect(mailCalls).toBe(0)
      expect(result).toMatchObject({
        verificationRequired: false,
        reviewRequired: false,
        redirectTo: '/student',
      })
      expect(result.user.status).toBe('ACTIVE')
      expect(result.accessToken).toBeTruthy()
      expect(verifyAccessToken(result.accessToken).sid).toBe('session-id')
      await expect(createAuthService(repository).verifyEmail({ email: registeredUser.email, code: '123456' }))
        .rejects.toMatchObject({ status: 409, code: 'EMAIL_VERIFICATION_DISABLED' })
    } finally {
      env.emailVerificationEnabled = previous
    }
  })

  it('rejects registration when the school email domain is not verified by UniNet', async () => {
    const repository = sessionRepository({
      findUserByEmail: async () => null,
      findUniversityDomain: async () => null,
    })
    await expect(createAuthService(repository).register({
      firstName: 'Test',
      lastName: 'User',
      email: 'me@gmail.com',
      password: 'Secure!Pass123',
      confirmPassword: 'Secure!Pass123',
      acceptedTerms: true,
    })).rejects.toMatchObject({ status: 422, code: 'UNIVERSITY_DOMAIN_NOT_VERIFIED' })
  })

  it('activates a verified student when the repository confirms an active roster match', async () => {
    let finalized
    const verifiedUser = {
      id: 'user-id', universityId: university.id, email: 'student@test.example',
      role: 'STUDENT', status: 'ACTIVE', emailVerifiedAt: new Date(), university,
      studentProfile: { firstName: 'Дөлгөөн', lastName: 'Бат' }, staffProfile: null,
    }
    const repository = sessionRepository({
      findUserByEmail: async () => ({ ...verifiedUser, status: 'PENDING_VERIFICATION', emailVerifiedAt: null }),
      finalizeEmailVerification: async input => { finalized = input; return { status: 'verified', user: verifiedUser, rosterMatched: true } },
    })
    const result = await createAuthService(repository).verifyEmail({
      email: 'student@test.example',
      code: '123456',
    })
    expect(finalized.userId).toBe('user-id')
    expect(finalized.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(finalized.maxAttempts).toBe(5)
    expect(result).toMatchObject({ redirectTo: '/student', reviewRequired: false })
    expect(result.accessToken).toBeTruthy()
    expect(verifyAccessToken(result.accessToken).sid).toBe('session-id')
  })

  it('activates a verified student without requiring an active roster match', async () => {
    const activeUser = {
      id: 'user-id', universityId: university.id, email: 'student@test.example',
      role: 'STUDENT', status: 'ACTIVE', emailVerifiedAt: new Date(), university,
      studentProfile: { firstName: 'Дөлгөөн', lastName: 'Бат' }, staffProfile: null,
    }
    const repository = sessionRepository({
      findUserByEmail: async () => ({ ...activeUser, status: 'PENDING_VERIFICATION', emailVerifiedAt: null }),
      finalizeEmailVerification: async () => ({ status: 'verified', user: activeUser, rosterMatched: false }),
    })
    const result = await createAuthService(repository).verifyEmail({ email: activeUser.email, code: '123456' })
    expect(result).toMatchObject({ redirectTo: '/student', reviewRequired: false })
    expect(result.accessToken).toBeTruthy()
    expect(verifyAccessToken(result.accessToken).sid).toBe('session-id')
  })

  it('enforces a resend cooldown and never exposes whether an unknown email exists', async () => {
    const pendingUser = { id: 'user-id', email: 'student@test.example', role: 'STUDENT', emailVerifiedAt: null }
    const cooldownService = createAuthService({
      findUserByEmail: async () => pendingUser,
      findLatestEmailVerificationToken: async () => ({ createdAt: new Date() }),
    })
    await expect(cooldownService.resendEmailVerification({ email: pendingUser.email })).rejects.toMatchObject({
      status: 429, code: 'VERIFICATION_RESEND_COOLDOWN',
    })

    const unknownService = createAuthService({ findUserByEmail: async () => null })
    await expect(unknownService.resendEmailVerification({ email: 'unknown@example.com' })).resolves.toEqual({
      message: 'Баталгаажуулах боломжтой бүртгэл байвал шинэ код имэйлээр илгээгдэнэ.',
    })
  })

  it('returns 409 for a duplicate normalized email', async () => {
    const service = createAuthService({
      findUserByEmail: async () => ({ id: 'existing-user' }),
    })
    await expect(service.register({
      firstName: 'Test',
      lastName: 'User',
      email: 'EXISTING@example.com',
      password: 'Secure!Pass123',
      confirmPassword: 'Secure!Pass123',
      acceptedTerms: true,
    })).rejects.toMatchObject({ status: 409, code: 'EMAIL_ALREADY_REGISTERED' })
  })

  it('fails closed when required registration policy documents are unavailable', async () => {
    const service = createAuthService({
      findUserByEmail: async () => null,
      findUniversityDomain: async () => null,
      findCurrentRequiredPolicies: async () => [],
    })
    await expect(service.register({
      firstName: 'Test',
      lastName: 'User',
      email: 'new@example.com',
      password: 'Secure!Pass123',
      confirmPassword: 'Secure!Pass123',
      acceptedTerms: true,
    })).rejects.toMatchObject({ status: 503, code: 'POLICY_DOCUMENTS_UNAVAILABLE' })
  })

  it('returns one generic error for an invalid login', async () => {
    const repository = {
      findUserByEmail: async () => ({
        passwordHash: await hashPassword('Correct!Pass123'),
      }),
    }
    await expect(createAuthService(repository).login({
      email: 'student@test.example',
      password: 'Wrong!Pass123',
    })).rejects.toMatchObject({ status: 401, code: 'AUTHENTICATION_FAILED' })
  })

  it('requires email verification after valid credentials', async () => {
    const passwordHash = await hashPassword('Correct!Pass123')
    const service = createAuthService({
      findUserByEmail: async () => ({
        id: 'user-id', email: 'student@test.example', passwordHash, role: 'STUDENT',
        status: 'PENDING_VERIFICATION', emailVerifiedAt: null,
      }),
    })
    await expect(service.login({ email: 'student@test.example', password: 'Correct!Pass123' })).rejects.toMatchObject({
      status: 403, code: 'EMAIL_VERIFICATION_REQUIRED',
    })
  })

  it('auto-activates a verified legacy pending-review Student during login', async () => {
    const passwordHash = await hashPassword('Correct!Pass123')
    const activeUser = {
      id: 'legacy-user', universityId: university.id, email: 'student@test.example', passwordHash,
      role: 'STUDENT', status: 'ACTIVE', emailVerifiedAt: new Date(), university,
      studentProfile: { firstName: 'Legacy', lastName: 'Student' }, staffProfile: null,
    }
    const repository = sessionRepository({
      findUserByEmail: async () => ({ ...activeUser, status: 'PENDING_REVIEW' }),
      completeRegistrationWithoutEmailVerification: async () => ({
        status: 'completed', user: activeUser, rosterMatched: false,
      }),
    })
    const result = await createAuthService(repository).login({
      email: activeUser.email, password: 'Correct!Pass123',
    })
    expect(result).toMatchObject({ redirectTo: '/student', user: { status: 'ACTIVE' } })
    expect(verifyAccessToken(result.accessToken).sid).toBe('session-id')
  })

  it('logs in an active database user and returns the role route', async () => {
    const passwordHash = await hashPassword('Correct!Pass123')
    const repository = sessionRepository({
      findUserByEmail: async () => ({
        id: 'user-id',
        universityId: university.id,
        email: 'student@test.example',
        passwordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        university,
        studentProfile: { firstName: 'Дөлгөөн', lastName: 'Бат' },
        staffProfile: null,
      }),
    })
    const result = await createAuthService(repository).login({
      email: 'student@test.example',
      password: 'Correct!Pass123',
    })
    expect(result.redirectTo).toBe('/student')
    expect(result.user.name).toBe('Дөлгөөн Бат')
    expect(verifyAccessToken(result.accessToken).sid).toBe('session-id')
  })

  it('returns an MFA challenge without creating a session when the account has MFA enabled', async () => {
    const passwordHash = await hashPassword('Correct!Pass123')
    let createdSessions = 0
    const repository = sessionRepository({
      createSession: async () => { createdSessions += 1; return { id: 'unexpected-session' } },
      findUserByEmail: async () => ({
        id: 'mfa-user', universityId: university.id, email: 'mfa@test.example', passwordHash,
        role: 'STUDENT', status: 'ACTIVE', university,
        studentProfile: { firstName: 'MFA', lastName: 'User' }, staffProfile: null,
      }),
    })
    const mfa = {
      loginRequirement: async () => ({
        mfaRequired: true,
        challengeToken: 'signed-mfa-challenge',
        methods: ['TOTP', 'RECOVERY_CODE'],
        expiresIn: '10m',
      }),
    }
    const result = await createAuthService(repository, undefined, { mfa }).login({
      email: 'mfa@test.example', password: 'Correct!Pass123',
    })

    expect(result).toMatchObject({ mfaRequired: true, challengeToken: 'signed-mfa-challenge', redirectTo: null })
    expect(result).not.toHaveProperty('accessToken')
    expect(createdSessions).toBe(0)
  })

  it('requires bootstrap MFA enrollment for an active admin before issuing a session', async () => {
    const passwordHash = await hashPassword('Correct!Pass123')
    let createdSessions = 0
    const repository = sessionRepository({
      createSession: async () => { createdSessions += 1; return { id: 'unexpected-session' } },
      findUserByEmail: async () => ({
        id: 'admin-user', universityId: university.id, email: 'admin@test.example', passwordHash,
        role: 'UNIVERSITY_ADMIN', status: 'ACTIVE', university,
        studentProfile: null, staffProfile: { firstName: 'Admin', lastName: 'User' },
      }),
    })
    const mfa = {
      loginRequirement: async () => ({ mfaEnrollmentRequired: true, enrollmentToken: 'signed-enrollment', expiresIn: '10m' }),
    }
    const result = await createAuthService(repository, undefined, { mfa }).login({
      email: 'admin@test.example', password: 'Correct!Pass123',
    })

    expect(result).toMatchObject({ mfaEnrollmentRequired: true, enrollmentToken: 'signed-enrollment', redirectTo: null })
    expect(result).not.toHaveProperty('accessToken')
    expect(createdSessions).toBe(0)
  })

  it('rotates refresh sessions and binds the replacement access token to the new session', async () => {
    const user = {
      id: 'user-id',
      universityId: university.id,
      email: 'student@test.example',
      role: 'STUDENT',
      status: 'ACTIVE',
      university,
      studentProfile: { firstName: 'Дөлгөөн', lastName: 'Бат' },
      staffProfile: null,
    }
    const oldRefreshToken = signRefreshToken(user, 'old-session')
    let rotationInput
    const repository = sessionRepository({
      findSession: async id => ({
        id,
        userId: user.id,
        familyId: 'family-id',
        revokedAt: null,
        compromisedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        refreshTokenHash: hashToken(oldRefreshToken),
      }),
      findUserById: async () => user,
      rotateSessionAtomic: async input => {
        rotationInput = input
        return { status: 'rotated' }
      },
    })

    const result = await createAuthService(repository).refresh(oldRefreshToken)

    const replacementId = verifyAccessToken(result.accessToken).sid
    expect(replacementId).toBe(rotationInput.nextSession.id)
    expect(replacementId).not.toBe('old-session')
    expect(rotationInput).toMatchObject({
      currentSessionId: 'old-session',
      userId: user.id,
      expectedRefreshTokenHash: hashToken(oldRefreshToken),
      nextSession: { familyId: 'family-id', rotatedFromId: 'old-session' },
    })
    expect(hashToken(result.refreshToken)).toBe(rotationInput.nextSession.refreshTokenHash)
  })

  it('revokes the complete token family when a rotated refresh token is replayed', async () => {
    const user = { id: 'user-id', universityId: null, role: 'STUDENT', status: 'ACTIVE' }
    const oldRefreshToken = signRefreshToken(user, 'old-session')
    let compromisedFamily
    const repository = {
      findSession: async () => ({
        id: 'old-session',
        userId: user.id,
        familyId: 'family-id',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        refreshTokenHash: hashToken(oldRefreshToken),
      }),
      compromiseSessionFamily: async familyId => { compromisedFamily = familyId },
    }

    await expect(createAuthService(repository).refresh(oldRefreshToken)).rejects.toMatchObject({
      status: 401,
      code: 'REFRESH_TOKEN_REUSED',
    })
    expect(compromisedFamily).toBe('family-id')
  })

  it('rejects an expired refresh session before creating a descendant', async () => {
    const user = { id: 'user-id', universityId: null, role: 'STUDENT', status: 'ACTIVE' }
    const refreshToken = signRefreshToken(user, 'expired-session')
    let queriedUser = false
    const repository = {
      findSession: async () => ({
        id: 'expired-session',
        userId: user.id,
        familyId: 'family-id',
        revokedAt: null,
        compromisedAt: null,
        expiresAt: new Date(Date.now() - 1),
        refreshTokenHash: hashToken(refreshToken),
      }),
      findUserById: async () => { queriedUser = true },
    }

    await expect(createAuthService(repository).refresh(refreshToken)).rejects.toMatchObject({ status: 401 })
    expect(queriedUser).toBe(false)
  })

  it('rejects refresh when the user university is no longer active', async () => {
    const user = {
      id: 'user-id',
      universityId: university.id,
      role: 'STUDENT',
      status: 'ACTIVE',
      university: { ...university, status: 'SUSPENDED' },
    }
    const refreshToken = signRefreshToken(user, 'suspended-university-session')
    let rotated = false
    const repository = {
      findSession: async () => ({
        id: 'suspended-university-session',
        userId: user.id,
        familyId: 'family-id',
        revokedAt: null,
        compromisedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        refreshTokenHash: hashToken(refreshToken),
      }),
      findUserById: async () => user,
      rotateSessionAtomic: async () => { rotated = true },
    }

    await expect(createAuthService(repository).refresh(refreshToken)).rejects.toMatchObject({ status: 401 })
    expect(rotated).toBe(false)
  })

  it('returns the same generic password-reset response for known and unknown email addresses', async () => {
    const sent = []
    const stored = []
    const user = { id: 'user-id', email: 'student@test.example', status: 'ACTIVE' }
    const repository = {
      findUserByEmail: async email => email === user.email ? user : null,
      invalidatePasswordResetTokens: async () => undefined,
      createPasswordResetToken: async value => { stored.push(value) },
      deletePasswordResetToken: async () => undefined,
    }
    const mailer = { sendPasswordReset: async value => { sent.push(value) } }
    const service = createAuthService(repository, mailer)

    const known = await service.requestPasswordReset({ email: user.email })
    const unknown = await service.requestPasswordReset({ email: 'unknown@test.example' })

    expect(known).toEqual(unknown)
    expect(known).not.toHaveProperty('token')
    expect(stored).toHaveLength(1)
    expect(sent).toHaveLength(1)
    expect(stored[0].tokenHash).toBe(hashToken(sent[0].token))
    expect(stored[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('hashes the replacement password and consumes the opaque reset token once', async () => {
    let consumed
    const repository = {
      consumePasswordResetToken: async input => {
        consumed = input
        return { status: 'reset', userId: 'user-id' }
      },
    }
    const service = createAuthService(repository)
    const token = 'a'.repeat(43)

    await service.confirmPasswordReset({
      token,
      password: 'NewSecure!Pass123',
      confirmPassword: 'NewSecure!Pass123',
    })

    expect(consumed.tokenHash).toBe(hashToken(token))
    expect(consumed.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('rejects an expired or already-used password reset token', async () => {
    const service = createAuthService({
      consumePasswordResetToken: async () => ({ status: 'invalid' }),
    })

    await expect(service.confirmPasswordReset({
      token: 'a'.repeat(43),
      password: 'NewSecure!Pass123',
      confirmPassword: 'NewSecure!Pass123',
    })).rejects.toMatchObject({ status: 400, code: 'PASSWORD_RESET_TOKEN_INVALID' })
  })
})
