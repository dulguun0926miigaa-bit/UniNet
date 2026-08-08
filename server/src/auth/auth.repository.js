import { prisma } from '../lib/prisma.js'
import crypto from 'node:crypto'
import { selectCurrentPolicyDocuments } from '../privacy/policy.js'
import { env } from '../config/env.js'

const prismaWithVerification = /** @type {any} */ (prisma)

const userInclude = {
  university: true,
  studentProfile: true,
  staffProfile: true,
  oauthAccounts: { select: { provider: true, providerEmail: true, providerEmailVerified: true, linkedAt: true } },
}

async function resolveStudentRegistration(tx, user, now = new Date()) {
  let rosterMember = null
  if (user.universityId) {
    rosterMember = await tx.universityMember.findUnique({
      where: {
        universityId_normalizedEmail: {
          universityId: user.universityId,
          normalizedEmail: user.normalizedEmail,
        },
      },
    })
  }

  let rosterMatched = Boolean(
    user.university?.status === 'ACTIVE'
    && rosterMember?.memberType === 'STUDENT'
    && rosterMember.enrollmentStatus === 'ACTIVE'
    && (!rosterMember.validFrom || rosterMember.validFrom <= now)
    && (!rosterMember.validUntil || rosterMember.validUntil >= now),
  )

  if (rosterMatched && rosterMember?.studentId) {
    const duplicateProfile = await tx.studentProfile.findFirst({
      where: {
        userId: { not: user.id },
        universityId: user.universityId,
        studentId: rosterMember.studentId,
      },
      select: { id: true },
    })
    if (duplicateProfile) rosterMatched = false
  }

  // Verified university-domain ownership is sufficient for Student activation.
  // Roster matching enriches the profile but no longer blocks first login.
  const nextStatus = 'ACTIVE'
  const profileData = {
    universityId: user.universityId,
    ...(rosterMatched ? {
      rosterMemberId: rosterMember.id,
      ...(rosterMember.studentId ? { studentId: rosterMember.studentId } : {}),
      ...(rosterMember.firstName ? { firstName: rosterMember.firstName } : {}),
      ...(rosterMember.lastName ? { lastName: rosterMember.lastName } : {}),
      ...(rosterMember.department ? { department: rosterMember.department } : {}),
      ...(rosterMember.major ? { major: rosterMember.major } : {}),
      ...(rosterMember.graduationYear ? { graduationYear: rosterMember.graduationYear } : {}),
    } : {}),
  }

  const updated = await tx.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: now,
      status: nextStatus,
      studentProfile: { update: profileData },
    },
    include: userInclude,
  })
  return { user: updated, rosterMatched }
}

export const authRepository = {
  findUniversityDomain(domain) {
    return prisma.universityDomain.findUnique({
      where: { domain },
      include: { university: true },
    })
  },
  findUserByEmail(email) {
    return prisma.user.findUnique({ where: { normalizedEmail: email }, include: userInclude })
  },
  findUserByGoogleId(googleId) {
    return prisma.user.findUnique({ where: { googleId }, include: userInclude })
  },
  findUserByGoogleIdentity(googleIssuer, googleId) {
    return prisma.user.findFirst({ where: { googleIssuer, googleId }, include: userInclude })
  },
  findUserById(id) {
    return prisma.user.findUnique({ where: { id }, include: userInclude })
  },
  async findCurrentRequiredPolicies(locale = 'mn') {
    const now = new Date()
    const documents = await prisma.policyDocument.findMany({
      where: {
        required: true,
        publishedAt: { lte: now },
        effectiveAt: { lte: now },
        OR: [{ retiredAt: null }, { retiredAt: { gt: now } }],
      },
      orderBy: [{ type: 'asc' }, { effectiveAt: 'desc' }, { publishedAt: 'desc' }],
    })
    return selectCurrentPolicyDocuments(documents, locale).filter(document => document.required)
  },
  registerStudent({ user, profile, policyAcceptances }) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ...user,
          studentProfile: { create: profile },
        },
        include: userInclude,
      })
      await tx.policyAcceptance.createMany({
        data: policyAcceptances.map(acceptance => ({ ...acceptance, userId: created.id })),
      })
      return created
    })
  },
  async createSession({ userId, refreshTokenHash, expiresAt, userAgent, ipAddress, mfaVerifiedAt = null, remembered = false }) {
    const id = crypto.randomUUID()
    return prisma.session.create({
      data: { id, familyId: id, userId, refreshTokenHash, expiresAt, userAgent, ipAddress, mfaVerifiedAt, remembered },
    })
  },
  updateSessionToken(id, refreshTokenHash, expiresAt) {
    return prisma.session.update({ where: { id }, data: { refreshTokenHash, expiresAt } })
  },
  findSession(id) {
    return prisma.session.findUnique({ where: { id }, include: { user: true } })
  },
  touchSession(id, now = new Date()) {
    return prisma.session.updateMany({ where: { id, revokedAt: null, compromisedAt: null }, data: { lastUsedAt: now } })
  },
  async rotateSessionAtomic({
    currentSessionId,
    userId,
    expectedRefreshTokenHash,
    nextSession,
  }) {
    return prisma.$transaction(async (tx) => {
      const now = new Date()
      const claimed = await tx.session.updateMany({
        where: {
          id: currentSessionId,
          userId,
          refreshTokenHash: expectedRefreshTokenHash,
          revokedAt: null,
          compromisedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now, lastUsedAt: now },
      })

      if (claimed.count !== 1) {
        const current = await tx.session.findUnique({ where: { id: currentSessionId } })
        if (
          current
          && current.userId === userId
          && current.refreshTokenHash === expectedRefreshTokenHash
          && current.revokedAt
        ) {
          await tx.session.updateMany({
            where: { familyId: current.familyId },
            data: { revokedAt: now, compromisedAt: now },
          })
          return { status: 'reused' }
        }
        return { status: 'invalid' }
      }

      await tx.session.create({ data: nextSession })
      return { status: 'rotated' }
    })
  },
  compromiseSessionFamily(familyId) {
    const now = new Date()
    return prisma.session.updateMany({
      where: { familyId },
      data: { revokedAt: now, compromisedAt: now },
    })
  },
  revokeSession(id) {
    return prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    })
  },
  revokeAllSessions(userId) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  },
  markLogin(userId) {
    return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
  },
  createAuditLog(data) {
    return prisma.auditLog.create({ data })
  },
  findLatestEmailVerificationToken(userId) {
    return prismaWithVerification.emailVerificationToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    })
  },
  invalidateEmailVerificationTokens(userId) {
    return prismaWithVerification.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    })
  },
  createEmailVerificationToken({ userId, tokenHash, expiresAt }) {
    return prismaWithVerification.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    })
  },
  deleteEmailVerificationToken(tokenHash) {
    return prismaWithVerification.emailVerificationToken.deleteMany({
      where: { tokenHash, usedAt: null },
    })
  },
  async finalizeEmailVerification({ userId, tokenHash, maxAttempts }) {
    return prisma.$transaction(async tx => {
      const verificationTx = /** @type {any} */ (tx)
      const now = new Date()
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: userInclude,
      })
      if (!user) return { status: 'notFound' }
      if (user.emailVerifiedAt) return { status: 'alreadyVerified', user }

      const token = await verificationTx.emailVerificationToken.findFirst({
        where: { userId, usedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
      })
      if (!token) return { status: 'expired' }

      if (token.tokenHash !== tokenHash) {
        const attempts = token.attemptCount + 1
        await verificationTx.emailVerificationToken.update({
          where: { id: token.id },
          data: {
            attemptCount: { increment: 1 },
            ...(attempts >= maxAttempts ? { usedAt: now } : {}),
          },
        })
        return { status: attempts >= maxAttempts ? 'attemptsExceeded' : 'invalid' }
      }

      const claimed = await verificationTx.emailVerificationToken.updateMany({
        where: {
          id: token.id,
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: maxAttempts },
        },
        data: { usedAt: now },
      })
      if (claimed.count !== 1) return { status: 'invalid' }

      const resolved = await resolveStudentRegistration(tx, user, now)
      const updated = resolved.user
      const rosterMatched = resolved.rosterMatched
      await verificationTx.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      })
      return { status: 'verified', user: updated, rosterMatched }
    })
  },
  async completeRegistrationWithoutEmailVerification(userId) {
    return prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: userInclude,
      })
      if (!user) return { status: 'notFound' }
      if (user.role !== 'STUDENT') return { status: 'invalidRole' }
      if (user.emailVerifiedAt && user.status === 'ACTIVE') {
        return { status: 'alreadyCompleted', user, rosterMatched: true }
      }
      const resolved = await resolveStudentRegistration(tx, user)
      return { status: 'completed', ...resolved }
    })
  },
  findLatestPasswordResetOtpChallenge(userId) {
    return prisma.passwordResetOtpChallenge.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    })
  },
  invalidatePasswordResetOtpChallenges(userId) {
    return prisma.passwordResetOtpChallenge.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    })
  },
  createPasswordResetOtpChallenge(data) {
    return prisma.passwordResetOtpChallenge.create({ data })
  },
  deletePasswordResetOtpChallenge(challengeTokenHash) {
    return prisma.passwordResetOtpChallenge.deleteMany({ where: { challengeTokenHash, usedAt: null } })
  },
  async consumePasswordResetOtpChallenge({ challengeTokenHash, codeHash, maxAttempts }) {
    return prisma.$transaction(async tx => {
      const now = new Date()
      const challenge = await tx.passwordResetOtpChallenge.findUnique({
        where: { challengeTokenHash },
        include: { user: true },
      })
      if (!challenge || challenge.usedAt || challenge.expiresAt <= now || challenge.user.status !== 'ACTIVE' || challenge.user.role !== 'STUDENT') return { status: 'invalid' }
      if (challenge.attemptCount >= maxAttempts) return { status: 'attemptsExceeded' }
      if (challenge.codeHash !== codeHash) {
        const attempts = challenge.attemptCount + 1
        await tx.passwordResetOtpChallenge.update({
          where: { id: challenge.id },
          data: { attemptCount: { increment: 1 }, ...(attempts >= maxAttempts ? { usedAt: now } : {}) },
        })
        return { status: attempts >= maxAttempts ? 'attemptsExceeded' : 'incorrect' }
      }
      const claimed = await tx.passwordResetOtpChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, expiresAt: { gt: now }, attemptCount: { lt: maxAttempts } },
        data: { usedAt: now },
      })
      if (claimed.count !== 1) return { status: 'invalid' }
      return { status: 'verified', user: challenge.user }
    })
  },
  invalidatePasswordResetTokens(userId) {
    return prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    })
  },
  createPasswordResetToken({ userId, tokenHash, expiresAt }) {
    return prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } })
  },
  deletePasswordResetToken(tokenHash) {
    return prisma.passwordResetToken.deleteMany({ where: { tokenHash, usedAt: null } })
  },
  findPasswordResetToken(tokenHash) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } })
  },
  async consumePasswordResetToken({ tokenHash, passwordHash }) {
    return prisma.$transaction(async (tx) => {
      const now = new Date()
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      })
      if (!token || token.usedAt || token.expiresAt <= now || token.user.status !== 'ACTIVE') {
        return { status: 'invalid' }
      }

      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      })
      if (claimed.count !== 1) return { status: 'invalid' }

      await tx.passwordHistory.create({ data: { userId: token.userId, passwordHash: token.user.passwordHash } })
      const staleHistory = await tx.passwordHistory.findMany({
        where: { userId: token.userId },
        orderBy: { createdAt: 'desc' },
        skip: env.PASSWORD_HISTORY_COUNT,
        select: { id: true },
      })
      if (staleHistory.length) {
        await tx.passwordHistory.deleteMany({ where: { id: { in: staleHistory.map(item => item.id) } } })
      }
      await tx.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          authProvider: token.user.authProvider === 'GOOGLE' ? 'PASSWORD_GOOGLE' : token.user.authProvider,
        },
      })
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: now },
      })
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      })
      return { status: 'reset', userId: token.userId }
    })
  },
}
