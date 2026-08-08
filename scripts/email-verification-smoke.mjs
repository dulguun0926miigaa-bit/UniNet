import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import request from 'supertest'
import { createAuthService } from '../server/src/auth/auth.service.js'
import { authRepository } from '../server/src/auth/auth.repository.js'
import { registerSchema, emailVerificationSchema } from '../server/src/auth/validation.js'
import { prisma } from '../server/src/lib/prisma.js'
import { app } from '../server/src/app.js'
import { endpointDefinitions, openApiDocument } from '../server/src/openapi/openapi.document.js'

const university = {
  id: 'a7ef7cda-8324-48a6-b08c-588d380f9158',
  name: 'Test University',
  shortName: 'TEST',
  slug: 'test',
  status: 'ACTIVE',
}
const policies = [
  { id: '1f3a2e2e-6a0d-4b32-a41e-b6d1f27ed001', type: 'TERMS_OF_SERVICE', version: '1', locale: 'mn', checksum: 't', required: true },
  { id: '1f3a2e2e-6a0d-4b32-a41e-b6d1f27ed002', type: 'PRIVACY_POLICY', version: '1', locale: 'mn', checksum: 'p', required: true },
]

async function testRegistrationAndServiceFlow() {
  let stored
  let delivered
  const pendingRepo = {
    findUserByEmail: async () => null,
    findCurrentRequiredPolicies: async () => policies,
    findUniversityDomain: async () => ({ university, isActive: true, isVerified: true }),
    registerStudent: async data => ({ id: 'user-id', ...data.user, university, studentProfile: data.profile, staffProfile: null }),
    invalidateEmailVerificationTokens: async () => {},
    createEmailVerificationToken: async value => { stored = value },
    deleteEmailVerificationToken: async () => {},
  }
  const registration = await createAuthService(pendingRepo, {
    sendEmailVerification: async value => { delivered = value; return { delivered: true } },
  }).register({
    firstName: 'Test', lastName: 'Student', email: 'Student@Test.Example',
    password: 'Secure!Pass123', confirmPassword: 'Secure!Pass123',
    enrollmentYear: new Date().getUTCFullYear() - 1, acceptedTerms: true,
  })
  assert.equal(registration.user.status, 'PENDING_VERIFICATION')
  assert.equal(registration.user.studentProfile.enrollmentYear, new Date().getUTCFullYear() - 1)
  assert.equal(registration.user.emailVerifiedAt, null)
  assert.equal(registration.verificationRequired, true)
  assert.equal(registration.accessToken, undefined)
  assert.match(delivered.code, /^\d{6}$/)
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/)
  assert.equal(stored.tokenHash.includes(delivered.code), false)

  const activeUser = {
    id: 'user-id', email: 'student@test.example', normalizedEmail: 'student@test.example',
    universityId: university.id, role: 'STUDENT', status: 'ACTIVE', emailVerifiedAt: new Date(),
    university, studentProfile: { firstName: 'Test', lastName: 'Student' }, staffProfile: null,
  }
  let finalized
  const activeResult = await createAuthService({
    findUserByEmail: async () => ({ ...activeUser, status: 'PENDING_VERIFICATION', emailVerifiedAt: null }),
    finalizeEmailVerification: async input => { finalized = input; return { status: 'verified', user: activeUser, rosterMatched: true } },
    createSession: async () => ({ id: 'session-id' }),
    updateSessionToken: async () => {},
    markLogin: async () => {},
  }).verifyEmail({ email: activeUser.email, code: '123456' })
  assert.equal(activeResult.redirectTo, '/student')
  assert.ok(activeResult.accessToken)
  assert.match(finalized.tokenHash, /^[a-f0-9]{64}$/)

  const pendingUser = { ...activeUser, status: 'PENDING_REVIEW' }
  const reviewResult = await createAuthService({
    findUserByEmail: async () => ({ ...activeUser, status: 'PENDING_VERIFICATION', emailVerifiedAt: null }),
    finalizeEmailVerification: async () => ({ status: 'verified', user: pendingUser, rosterMatched: false }),
  }).verifyEmail({ email: activeUser.email, code: '123456' })
  assert.equal(reviewResult.reviewRequired, true)
  assert.equal(reviewResult.redirectTo, '/registration-pending')
  assert.equal(reviewResult.accessToken, undefined)

  const unknownDomainRepo = {
    findUserByEmail: async () => null,
    findCurrentRequiredPolicies: async () => policies,
    findUniversityDomain: async () => null,
    registerStudent: async data => ({ id: 'unknown-user', ...data.user, university: null, studentProfile: data.profile, staffProfile: null }),
    invalidateEmailVerificationTokens: async () => {},
    createEmailVerificationToken: async () => {},
    deleteEmailVerificationToken: async () => {},
  }
  const unknownResult = await createAuthService(unknownDomainRepo, {
    sendEmailVerification: async () => ({ delivered: true }),
  }).register({
    firstName: 'Unknown', lastName: 'Domain', email: 'student@gmail.com',
    password: 'Secure!Pass123', confirmPassword: 'Secure!Pass123', acceptedTerms: true,
  })
  assert.equal(unknownResult.user.universityId, undefined)
  assert.equal(unknownResult.user.status, 'PENDING_VERIFICATION')

  assert.equal(registerSchema.safeParse({
    firstName: 'A', lastName: 'B', email: 'a@test.example',
    password: 'Secure!Pass123', confirmPassword: 'Secure!Pass123', acceptedTerms: true,
    role: 'PLATFORM_SUPER_ADMIN',
  }).success, false)
  assert.equal(emailVerificationSchema.safeParse({ email: 'a@test.example', code: '123456' }).success, true)
  assert.equal(emailVerificationSchema.safeParse({ email: 'a@test.example', code: '12345x' }).success, false)
}

async function testRepositoryTransaction() {
  const pendingUser = {
    id: 'user-id', universityId: university.id, normalizedEmail: 'student@test.example',
    email: 'student@test.example', role: 'STUDENT', status: 'PENDING_VERIFICATION',
    emailVerifiedAt: null, university, studentProfile: { id: 'profile-id', firstName: 'Test', lastName: 'Student' },
    staffProfile: null,
  }
  const updatedUser = { ...pendingUser, status: 'ACTIVE', emailVerifiedAt: new Date() }
  const calls = []
  const tx = {
    user: {
      findUnique: async () => pendingUser,
      update: async input => { calls.push(input); return updatedUser },
    },
    emailVerificationToken: {
      findFirst: async () => ({
        id: 'token-id', tokenHash: 'expected-hash', attemptCount: 0,
        expiresAt: new Date(Date.now() + 60_000), usedAt: null,
      }),
      updateMany: async () => ({ count: 1 }),
    },
    universityMember: {
      findUnique: async () => ({
        memberType: 'STUDENT', enrollmentStatus: 'ACTIVE', studentId: 'S-100',
        firstName: 'Roster', lastName: 'Student', department: 'IT', major: 'Software Engineering',
        validFrom: null, validUntil: null,
      }),
    },
    studentProfile: { findFirst: async () => null },
  }
  const originalTransaction = prisma.$transaction.bind(prisma)
  prisma.$transaction = async callback => callback(tx)
  try {
    const result = await authRepository.finalizeEmailVerification({
      userId: pendingUser.id,
      tokenHash: 'expected-hash',
      maxAttempts: 5,
    })
    assert.equal(result.status, 'verified')
    assert.equal(result.rosterMatched, true)
    assert.equal(result.user.status, 'ACTIVE')
    assert.equal(calls[0].data.studentProfile.update.studentId, 'S-100')
    assert.equal(calls[0].data.status, 'ACTIVE')
  } finally {
    prisma.$transaction = originalTransaction
  }
}

async function testSchemaMigrationAndRoutes() {
  const schema = await readFile(new URL('../server/prisma/schema.prisma', import.meta.url), 'utf8')
  const migration = await readFile(new URL('../server/prisma/migrations/20260727133000_email_verification/migration.sql', import.meta.url), 'utf8')
  const phase3Migration = await readFile(new URL('../server/prisma/migrations/20260727153000_phase3_registration_enrollment_year/migration.sql', import.meta.url), 'utf8')
  assert.match(schema, /model EmailVerificationToken\s*\{/)
  assert.match(schema, /emailVerificationTokens\s+EmailVerificationToken\[\]/)
  assert.match(migration, /CREATE TABLE "EmailVerificationToken"/)
  assert.match(migration, /FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\)/)
  assert.match(schema, /enrollmentYear\s+Int\?/)
  assert.match(phase3Migration, /ADD COLUMN "enrollmentYear" INTEGER/)

  assert.equal(endpointDefinitions.length, 98)
  assert.ok(openApiDocument.paths['/api/auth/verify-email']?.post)
  assert.ok(openApiDocument.paths['/api/auth/resend-verification']?.post)
  const specResponse = await request(app).get('/api/openapi.json')
  assert.equal(specResponse.status, 200)
  const invalidResponse = await request(app)
    .post('/api/auth/verify-email')
    .set('Origin', 'http://localhost:5173')
    .send({ email: 'student@test.example', code: 'abc' })
  assert.equal(invalidResponse.status, 422)
  assert.equal(invalidResponse.body.error.code, 'VALIDATION_ERROR')
}

await testRegistrationAndServiceFlow()
await testRepositoryTransaction()
await testSchemaMigrationAndRoutes()
console.log('email verification, roster matching, repository transaction, schema/migration and route smoke tests passed')
