import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ||= 'postgresql://postgres:password@localhost:5432/uninet_test'
process.env.JWT_ACCESS_SECRET ||= 'behavior-access-secret-at-least-32-characters'
process.env.JWT_REFRESH_SECRET ||= 'behavior-refresh-secret-at-least-32-characters'
process.env.TICKET_SIGNING_SECRET ||= 'behavior-ticket-secret-at-least-32-characters'
process.env.EMAIL_VERIFICATION_SECRET ||= 'behavior-email-secret-at-least-32-characters'
process.env.APP_URL ||= 'http://localhost:5173'
process.env.CORS_ORIGINS ||= 'http://localhost:5173'
process.env.EMAIL_DELIVERY_MODE ||= 'disabled'

const { createMembershipService } = await import('../server/src/memberships/membership.service.js')
const { createUniversityService } = await import('../server/src/universities/university.service.js')
const { assertContentManagement } = await import('../server/src/authorization/policy.js')

const universityId = 'a7ef7cda-8324-48a6-b08c-588d380f9158'
const otherUniversityId = 'f7515579-e6d3-45e6-8459-7756c9022a6f'
const userId = 'b20cdbb9-f329-46ef-ae2c-20ea464209c5'
const rosterMemberId = '6f9ad2a6-3fb8-4710-8ee0-5cd4f2865da7'
const admin = { id: 'bcbcadf7-d126-4a9c-b51e-d96bddad6608', role: 'UNIVERSITY_ADMIN', universityId }
const platform = { id: '536e2aaf-e56c-49b5-954f-df878fc62567', role: 'PLATFORM_SUPER_ADMIN', universityId: null }

let approvalInput
const membership = createMembershipService({
  approvePendingStudent: async (input, audit) => {
    approvalInput = { input, audit }
    return { status: 'approved', user: { id: input.id, status: 'ACTIVE' }, rosterMember: { id: input.rosterMemberId }, sessionsRevoked: 0 }
  },
})
const approved = await membership.approvePendingStudent(admin, userId, {
  rosterMemberId,
  reason: 'Official roster matched',
}, { ipAddress: '127.0.0.1', userAgent: 'smoke' })
assert.equal(approved.user.status, 'ACTIVE')
assert.equal(approvalInput.input.universityId, universityId)
assert.equal(approvalInput.audit.actorId, admin.id)

const missingRoster = createMembershipService({ approvePendingStudent: async () => ({ status: 'rosterMissing' }) })
await assert.rejects(
  () => missingRoster.approvePendingStudent(admin, userId, { reason: 'Reviewed' }),
  error => error.code === 'ROSTER_MATCH_REQUIRED' && error.status === 409,
)

const genericStatus = createMembershipService({ updateMemberStatus: async () => ({}) })
await assert.rejects(
  () => genericStatus.updateMemberStatus(admin, 'STUDENT', userId, { status: 'REJECTED', reason: 'Bypass' }),
)

const universityAdminService = createUniversityService({
  findById: async id => ({
    id,
    _count: { users: 1, members: 2, contents: 3, surveys: 4, partnershipsRequested: 1, partnershipsReceived: 2 },
  }),
})
await assert.rejects(
  () => universityAdminService.get(admin, otherUniversityId),
  error => error.code === 'TENANT_ACCESS_DENIED' && error.status === 403,
)

const activationService = createUniversityService({
  findById: async () => ({ id: universityId, domains: [{ isActive: true, isVerified: false, verificationStatus: 'PENDING' }] }),
  updateStatus: async () => { throw new Error('must not activate') },
})
await assert.rejects(
  () => activationService.updateStatus(platform, universityId, { status: 'ACTIVE', reason: 'Activate' }),
  error => error.code === 'UNIVERSITY_VERIFIED_DOMAIN_REQUIRED' && error.status === 409,
)

const challenge = 'uninet-verification=exact-value'
let verifiedInput
const dnsService = createUniversityService({
  findDomain: async () => ({
    id: rosterMemberId,
    universityId,
    domain: 'example.edu.mn',
    isActive: true,
    verificationStatus: 'PENDING',
    verificationMethod: 'DNS_TXT',
    verificationChallenge: challenge,
  }),
  verifyDomain: async input => {
    verifiedInput = input
    return { id: rosterMemberId, isVerified: true, verificationStatus: 'VERIFIED' }
  },
  markDomainVerificationFailed: async () => undefined,
}, async () => [['other'], [challenge]])
const verified = await dnsService.verifyDomain(platform, universityId, rosterMemberId, {})
assert.equal(verified.domain.verificationStatus, 'VERIFIED')
assert.equal(verifiedInput.actorId, platform.id)

let failedRecorded = false
const failedDns = createUniversityService({
  findDomain: async () => ({
    id: rosterMemberId,
    universityId,
    domain: 'example.edu.mn',
    isActive: true,
    verificationStatus: 'PENDING',
    verificationMethod: 'DNS_TXT',
    verificationChallenge: challenge,
  }),
  markDomainVerificationFailed: async () => { failedRecorded = true },
}, async () => [['wrong']])
await assert.rejects(
  () => failedDns.verifyDomain(platform, universityId, rosterMemberId, {}),
  error => error.code === 'DOMAIN_DNS_CHALLENGE_NOT_FOUND' && error.status === 409,
)
assert.equal(failedRecorded, true)

const publisher = { id: 'publisher', role: 'STAFF', universityId, staffProfile: { canPublish: true } }
assert.doesNotThrow(() => assertContentManagement(publisher, { universityId, createdById: 'other' }, 'status', 'APPROVED'))
assert.throws(() => assertContentManagement(publisher, { universityId: otherUniversityId, createdById: 'other' }, 'status', 'APPROVED'))

console.log('MVP backend behavior smoke passed (pending review, tenant policy, domain verification).')
