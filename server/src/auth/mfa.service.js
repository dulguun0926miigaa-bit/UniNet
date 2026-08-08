import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'
import { verifyPassword } from '../utils/password.js'
import { createOpaqueToken, expiryFromToken, hashToken, signAccessToken, signRefreshToken } from '../utils/tokens.js'
import { encodeBase32, findTotpStep } from './mfa-totp.js'

export { decodeBase32, encodeBase32, generateTotp } from './mfa-totp.js'

const challengeAudience = 'uninet-mfa-login'
const enrollmentAudience = 'uninet-mfa-enrollment'
const setupAudience = 'uninet-mfa-setup'
const stepUpAudience = 'uninet-step-up'
const adminRoles = new Set(['UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'])

const userInclude = {
  university: true,
  studentProfile: true,
  staffProfile: true,
}

const publicUser = user => ({
  id: user.id,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerifiedAt: user.emailVerifiedAt,
  universityId: user.universityId,
  university: user.university && {
    id: user.university.id,
    name: user.university.name,
    shortName: user.university.shortName,
    slug: user.university.slug,
  },
  studentProfile: user.studentProfile,
  staffProfile: user.staffProfile,
  firstName: user.studentProfile?.firstName ?? user.staffProfile?.firstName ?? (user.role === 'PLATFORM_SUPER_ADMIN' ? 'Platform' : ''),
  lastName: user.studentProfile?.lastName ?? user.staffProfile?.lastName ?? (user.role === 'PLATFORM_SUPER_ADMIN' ? 'Admin' : ''),
})

function signPurpose(payload, audience, expiresIn) {
  return jwt.sign(payload, env.mfaChallengeSecret, {
    algorithm: 'HS256',
    issuer: 'uninet-api',
    audience,
    expiresIn,
  })
}

function verifyPurpose(token, audience) {
  try {
    const payload = jwt.verify(token, env.mfaChallengeSecret, {
      algorithms: ['HS256'],
      issuer: 'uninet-api',
      audience,
    })
    if (!payload || typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('Invalid token payload')
    return payload
  } catch {
    throw new AppError('Аюулгүй байдлын баталгаажуулалтын хугацаа дууссан эсвэл хүчингүй байна.', 401, 'MFA_TOKEN_INVALID')
  }
}



function encryptSecret(secret) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', env.mfaEncryptionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return {
    secretCiphertext: ciphertext.toString('base64url'),
    secretIv: iv.toString('base64url'),
    secretTag: cipher.getAuthTag().toString('base64url'),
  }
}

function decryptSecret(credential) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    env.mfaEncryptionKey,
    Buffer.from(credential.secretIv, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(credential.secretTag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(credential.secretCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function recoveryCodeHash(userId, code) {
  return crypto.createHmac('sha256', env.mfaChallengeSecret)
    .update(`${userId}:${String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')}`)
    .digest('hex')
}

function makeRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(8).toString('hex').toUpperCase()
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`
  })
}

async function issueTokens(user, context = {}, { mfaVerified = false } = {}) {
  const provisional = createOpaqueToken()
  const id = crypto.randomUUID()
  const session = await prisma.session.create({
    data: {
      id,
      familyId: id,
      userId: user.id,
      refreshTokenHash: hashToken(provisional),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      mfaVerifiedAt: mfaVerified ? new Date() : null,
    },
  })
  const accessToken = signAccessToken(user, session.id, { mfaVerified })
  const refreshToken = signRefreshToken(user, session.id)
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashToken(refreshToken), expiresAt: expiryFromToken(refreshToken) },
  })
  return { accessToken, refreshToken }
}

async function audit(action, user, context = {}, nextData = {}, severity = 'MEDIUM') {
  await prisma.auditLog.create({
    data: {
      actorId: user?.id ?? null,
      universityId: user?.universityId ?? null,
      action,
      resourceType: 'MFA_SECURITY_EVENT',
      resourceId: user?.id ?? null,
      resourceName: user?.email ?? 'mfa',
      nextData,
      severity,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent?.slice(0, 500),
    },
  })
}

async function loadEnabledCredential(userId) {
  return prisma.mfaTotpCredential.findUnique({ where: { userId } })
}

async function verifyCredentialCode(userId, credential, code, { allowRecovery = true } = {}) {
  const secret = decryptSecret(credential)
  const step = findTotpStep(secret, code)
  if (step !== null) {
    const lastUsedStep = credential.lastUsedStep === null || credential.lastUsedStep === undefined
      ? null
      : BigInt(credential.lastUsedStep)
    if (lastUsedStep !== null && BigInt(step) <= lastUsedStep) {
      throw new AppError('Энэ нэг удаагийн код өмнө ашиглагдсан байна.', 401, 'MFA_CODE_REPLAYED')
    }
    const claimed = await prisma.mfaTotpCredential.updateMany({
      where: {
        id: credential.id,
        enabledAt: { not: null },
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }],
      },
      data: { lastUsedStep: BigInt(step) },
    })
    if (claimed.count !== 1) throw new AppError('Энэ нэг удаагийн код өмнө ашиглагдсан байна.', 401, 'MFA_CODE_REPLAYED')
    return { method: 'TOTP' }
  }

  if (allowRecovery) {
    const codeHash = recoveryCodeHash(userId, code)
    const recovery = await prisma.mfaRecoveryCode.findUnique({ where: { codeHash } })
    if (recovery?.userId === userId && !recovery.usedAt) {
      const consumed = await prisma.mfaRecoveryCode.updateMany({
        where: { id: recovery.id, userId, usedAt: null },
        data: { usedAt: new Date() },
      })
      if (consumed.count === 1) return { method: 'RECOVERY_CODE' }
    }
  }
  throw new AppError('Authenticator эсвэл recovery code буруу байна.', 401, 'MFA_CODE_INVALID')
}

async function startEnrollmentForUser(user) {
  const secret = encodeBase32(crypto.randomBytes(20))
  const encrypted = encryptSecret(secret)
  const existing = await prisma.mfaTotpCredential.findUnique({ where: { userId: user.id } })
  if (existing?.enabledAt) throw new AppError('MFA аль хэдийн идэвхтэй байна.', 409, 'MFA_ALREADY_ENABLED')
  const credential = await prisma.mfaTotpCredential.upsert({
    where: { userId: user.id },
    update: { ...encrypted, verifiedAt: null, enabledAt: null, lastUsedStep: null },
    create: { userId: user.id, ...encrypted },
  })
  const accountName = encodeURIComponent(user.email)
  const issuer = encodeURIComponent(env.MFA_ISSUER)
  const otpauthUri = `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
  const setupToken = signPurpose({ sub: user.id, credentialId: credential.id, purpose: 'setup' }, setupAudience, env.MFA_SETUP_EXPIRES_IN)
  return { setupToken, secret, otpauthUri, qrDataUrl, expiresIn: env.MFA_SETUP_EXPIRES_IN }
}

export const mfaService = {
  adminRoleRequiresMfa(role) {
    return adminRoles.has(role)
  },

  async status(userId, role) {
    const [credential, recoveryCount] = await Promise.all([
      prisma.mfaTotpCredential.findUnique({ where: { userId } }),
      prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } }),
    ])
    return {
      enabled: Boolean(credential?.enabledAt),
      enrolledAt: credential?.enabledAt ?? null,
      recoveryCodesRemaining: recoveryCount,
      requiredByRole: adminRoles.has(role),
    }
  },

  async loginRequirement(user) {
    if (!adminRoles.has(user.role)) return null
    const credential = await loadEnabledCredential(user.id)
    if (credential?.enabledAt) {
      return {
        mfaRequired: true,
        challengeToken: signPurpose({ sub: user.id, purpose: 'login' }, challengeAudience, env.MFA_LOGIN_CHALLENGE_EXPIRES_IN),
        methods: ['TOTP', 'RECOVERY_CODE'],
        expiresIn: env.MFA_LOGIN_CHALLENGE_EXPIRES_IN,
      }
    }
    if (adminRoles.has(user.role)) {
      return {
        mfaEnrollmentRequired: true,
        enrollmentToken: signPurpose({ sub: user.id, purpose: 'bootstrap-enrollment' }, enrollmentAudience, env.MFA_SETUP_EXPIRES_IN),
        expiresIn: env.MFA_SETUP_EXPIRES_IN,
      }
    }
    return null
  },

  async verifyLogin(challengeToken, code, context = {}) {
    const payload = verifyPurpose(challengeToken, challengeAudience)
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: userInclude })
    if (!user || user.status !== 'ACTIVE') throw new AppError('Бүртгэл идэвхгүй байна.', 401, 'MFA_LOGIN_USER_INVALID')
    const credential = await loadEnabledCredential(user.id)
    if (!credential?.enabledAt) throw new AppError('MFA идэвхгүй байна.', 409, 'MFA_NOT_ENABLED')
    const verification = await verifyCredentialCode(user.id, credential, code)
    const tokens = await issueTokens(user, context, { mfaVerified: true })
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await audit('MFA_LOGIN_SUCCEEDED', user, context, { method: verification.method })
    return {
      user: publicUser(user),
      redirectTo: { PLATFORM_SUPER_ADMIN: '/platform', UNIVERSITY_ADMIN: '/admin', STAFF: '/staff', STUDENT: '/student' }[user.role],
      ...tokens,
    }
  },

  async startEnrollment(user, currentPassword) {
    if (!currentPassword || !(await verifyPassword(user.passwordHash, currentPassword).catch(() => false))) {
      throw new AppError('Одоогийн нууц үг буруу байна.', 401, 'CURRENT_PASSWORD_INVALID')
    }
    return startEnrollmentForUser(user)
  },

  async startBootstrapEnrollment(enrollmentToken) {
    const payload = verifyPurpose(enrollmentToken, enrollmentAudience)
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: userInclude })
    if (!user || user.status !== 'ACTIVE' || !adminRoles.has(user.role)) {
      throw new AppError('MFA enrollment эрх хүчингүй байна.', 401, 'MFA_ENROLLMENT_INVALID')
    }
    return { user: publicUser(user), ...(await startEnrollmentForUser(user)) }
  },

  async confirmEnrollment({ userId, setupToken, code, context = {}, issueSession = false }) {
    const payload = verifyPurpose(setupToken, setupAudience)
    if (payload.sub !== userId || typeof payload.credentialId !== 'string') throw new AppError('MFA setup token тохирохгүй байна.', 401, 'MFA_SETUP_TOKEN_MISMATCH')
    const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude })
    const credential = await prisma.mfaTotpCredential.findUnique({ where: { id: payload.credentialId } })
    if (!user || !credential || credential.userId !== user.id || credential.enabledAt) {
      throw new AppError('MFA setup session олдсонгүй.', 409, 'MFA_SETUP_NOT_FOUND')
    }
    const secret = decryptSecret(credential)
    const step = findTotpStep(secret, code)
    if (step === null) throw new AppError('Authenticator code буруу байна.', 401, 'MFA_CODE_INVALID')
    const recoveryCodes = makeRecoveryCodes()
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.mfaTotpCredential.update({
        where: { id: credential.id },
        data: { verifiedAt: now, enabledAt: now, lastUsedStep: BigInt(step) },
      })
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } })
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map(recoveryCode => ({ userId: user.id, codeHash: recoveryCodeHash(user.id, recoveryCode) })),
      })
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          universityId: user.universityId,
          action: 'MFA_ENROLLED',
          resourceType: 'MFA_SECURITY_EVENT',
          resourceId: user.id,
          resourceName: user.email,
          nextData: { method: 'TOTP', recoveryCodesCreated: recoveryCodes.length },
          severity: 'HIGH',
          ipAddress: context.ipAddress,
          userAgent: context.userAgent?.slice(0, 500),
        },
      })
    })
    const result = { enabled: true, recoveryCodes, enrolledAt: now }
    if (issueSession) Object.assign(result, { user: publicUser(user), redirectTo: user.role === 'PLATFORM_SUPER_ADMIN' ? '/platform' : '/admin', ...(await issueTokens(user, context, { mfaVerified: true })) })
    return result
  },

  async confirmBootstrapEnrollment(enrollmentToken, setupToken, code, context = {}) {
    const enrollment = verifyPurpose(enrollmentToken, enrollmentAudience)
    return this.confirmEnrollment({ userId: enrollment.sub, setupToken, code, context, issueSession: true })
  },

  async regenerateRecoveryCodes(user, currentPassword, code, context = {}) {
    if (!(await verifyPassword(user.passwordHash, String(currentPassword || '')).catch(() => false))) {
      throw new AppError('Одоогийн нууц үг буруу байна.', 401, 'CURRENT_PASSWORD_INVALID')
    }
    const credential = await loadEnabledCredential(user.id)
    if (!credential?.enabledAt) throw new AppError('MFA идэвхгүй байна.', 409, 'MFA_NOT_ENABLED')
    const verification = await verifyCredentialCode(user.id, credential, code)
    const recoveryCodes = makeRecoveryCodes()
    await prisma.$transaction(async tx => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } })
      await tx.mfaRecoveryCode.createMany({ data: recoveryCodes.map(item => ({ userId: user.id, codeHash: recoveryCodeHash(user.id, item) })) })
      await tx.auditLog.create({
        data: {
          actorId: user.id, universityId: user.universityId, action: 'MFA_RECOVERY_CODES_REGENERATED',
          resourceType: 'MFA_SECURITY_EVENT', resourceId: user.id, resourceName: user.email,
          nextData: { method: verification.method, count: recoveryCodes.length }, severity: 'HIGH',
          ipAddress: context.ipAddress, userAgent: context.userAgent?.slice(0, 500),
        },
      })
    })
    return { recoveryCodes }
  },

  async disable(user, currentPassword, code, context = {}) {
    if (adminRoles.has(user.role)) throw new AppError('Admin account дээр MFA-г идэвхгүй болгох боломжгүй.', 409, 'ADMIN_MFA_REQUIRED')
    if (!(await verifyPassword(user.passwordHash, String(currentPassword || '')).catch(() => false))) {
      throw new AppError('Одоогийн нууц үг буруу байна.', 401, 'CURRENT_PASSWORD_INVALID')
    }
    const credential = await loadEnabledCredential(user.id)
    if (!credential?.enabledAt) throw new AppError('MFA идэвхгүй байна.', 409, 'MFA_NOT_ENABLED')
    const verification = await verifyCredentialCode(user.id, credential, code)
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } })
      await tx.mfaTotpCredential.delete({ where: { id: credential.id } })
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } })
      await tx.auditLog.create({
        data: {
          actorId: user.id, universityId: user.universityId, action: 'MFA_DISABLED',
          resourceType: 'MFA_SECURITY_EVENT', resourceId: user.id, resourceName: user.email,
          nextData: { method: verification.method, sessionsRevoked: true }, severity: 'HIGH',
          ipAddress: context.ipAddress, userAgent: context.userAgent?.slice(0, 500),
        },
      })
    })
    return { disabled: true, sessionsRevoked: true }
  },

  async createStepUp(user, sessionId, currentPassword, code, context = {}) {
    if (!(await verifyPassword(user.passwordHash, String(currentPassword || '')).catch(() => false))) {
      await audit('STEP_UP_FAILED', user, context, { reason: 'PASSWORD_INVALID' }, 'HIGH')
      throw new AppError('Одоогийн нууц үг буруу байна.', 401, 'CURRENT_PASSWORD_INVALID')
    }
    const credential = adminRoles.has(user.role) ? await loadEnabledCredential(user.id) : null
    if (adminRoles.has(user.role) && !credential?.enabledAt) throw new AppError('Энэ үйлдэлд MFA заавал шаардлагатай.', 403, 'ADMIN_MFA_REQUIRED')
    let method = 'PASSWORD'
    if (adminRoles.has(user.role) && credential?.enabledAt) {
      const verification = await verifyCredentialCode(user.id, credential, code)
      method = verification.method
    }
    const token = signPurpose({ sub: user.id, sid: sessionId, role: user.role, purpose: 'step-up', amr: ['pwd', method.toLowerCase()] }, stepUpAudience, env.STEP_UP_EXPIRES_IN)
    await audit('STEP_UP_SUCCEEDED', user, context, { method, sessionId })
    return { stepUpToken: token, expiresIn: env.STEP_UP_EXPIRES_IN, method }
  },

  verifyStepUp(token, user, sessionId) {
    const payload = verifyPurpose(token, stepUpAudience)
    if (payload.sub !== user.id || payload.sid !== sessionId || payload.role !== user.role) {
      throw new AppError('Step-up баталгаажуулалт энэ session-д хамаарахгүй байна.', 403, 'STEP_UP_TOKEN_MISMATCH')
    }
    return payload
  },
}
