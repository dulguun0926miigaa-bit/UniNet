import { beforeAll, describe, expect, it } from 'vitest'

let createUniversityService

beforeAll(async () => {
  ;({ createUniversityService } = await import('../src/universities/university.service.js'))
})

const universityId = 'a7ef7cda-8324-48a6-b08c-588d380f9158'
const domainId = '6f9ad2a6-3fb8-4710-8ee0-5cd4f2865da7'
const platformActor = { id: '536e2aaf-e56c-49b5-954f-df878fc62567', role: 'PLATFORM_SUPER_ADMIN', universityId: null }
const universityAdmin = { id: 'bcbcadf7-d126-4a9c-b51e-d96bddad6608', role: 'UNIVERSITY_ADMIN', universityId }

const detail = {
  id: universityId,
  name: 'Example University',
  shortName: 'EU',
  slug: 'example-university',
  status: 'ACTIVE',
  domains: [],
  _count: { users: 10, members: 20, contents: 5, surveys: 2, partnershipsRequested: 1, partnershipsReceived: 1 },
}

describe('university onboarding and domain verification service', () => {
  it('allows a University Admin to read only its own university detail', async () => {
    const service = createUniversityService({ findById: async () => detail })
    const result = await service.get(universityAdmin, universityId)
    expect(result.stats).toEqual({ users: 10, rosterMembers: 20, contents: 5, surveys: 2, partnerships: 2 })
    await expect(service.get(universityAdmin, 'f7515579-e6d3-45e6-8459-7756c9022a6f')).rejects.toMatchObject({ status: 403, code: 'TENANT_ACCESS_DENIED' })
  })

  it('lets a University Admin persist its own branding and contact profile only', async () => {
    let updateCall
    const service = createUniversityService({
      update: async (id, input, audit) => {
        updateCall = { id, input, audit }
        return { ...detail, ...input }
      },
    })
    const result = await service.updateOwnProfile(universityAdmin, {
      name: 'Example University Updated',
      shortName: 'EUU',
      slug: 'must-not-be-changed-by-tenant-admin',
      logoUrl: 'https://cdn.example.edu.mn/logo.png',
      websiteUrl: 'https://example.edu.mn',
      contactEmail: 'hello@example.edu.mn',
      primaryColor: '#123ABC',
      secondaryColor: '#ABC123',
    }, { ipAddress: '127.0.0.1', userAgent: 'vitest' })

    expect(updateCall.id).toBe(universityId)
    expect(updateCall.input).not.toHaveProperty('slug')
    expect(updateCall.input).toMatchObject({ logoUrl: 'https://cdn.example.edu.mn/logo.png', primaryColor: '#123ABC' })
    expect(updateCall.audit).toMatchObject({ actorId: universityAdmin.id, ipAddress: '127.0.0.1' })
    expect(result.university.shortName).toBe('EUU')
    await expect(service.updateOwnProfile(platformActor, { name: 'Forbidden update' })).rejects.toMatchObject({
      status: 403,
      code: 'UNIVERSITY_ADMIN_REQUIRED',
    })
  })

  it('keeps university creation restricted to Platform Super Admin', async () => {
    const service = createUniversityService({ create: async input => ({ ...detail, ...input }) })
    await expect(service.create(universityAdmin, {
      name: 'Another University', shortName: 'AU', slug: 'another-university', domain: 'au.edu.mn',
    })).rejects.toMatchObject({ status: 403, code: 'PLATFORM_ADMIN_REQUIRED' })
  })

  it('creates a cryptographically random DNS TXT challenge without auto-verifying the domain', async () => {
    let received
    const service = createUniversityService({
      requestDomainVerification: async input => {
        received = input
        return { id: domainId, universityId, domain: 'example.edu.mn', verificationStatus: 'PENDING' }
      },
    })
    const result = await service.requestDomainVerification(platformActor, universityId, domainId, { method: 'DNS_TXT' })
    expect(received.challenge).toMatch(/^uninet-verification=[a-f0-9]{48}$/)
    expect(result.verification.dnsRecord).toMatchObject({ type: 'TXT', host: 'example.edu.mn' })
  })

  it('verifies DNS ownership only when the exact stored challenge is present', async () => {
    const challenge = 'uninet-verification=abc123'
    let verified
    const repository = {
      findDomain: async () => ({
        id: domainId,
        universityId,
        domain: 'example.edu.mn',
        isActive: true,
        verificationStatus: 'PENDING',
        verificationMethod: 'DNS_TXT',
        verificationChallenge: challenge,
      }),
      verifyDomain: async input => {
        verified = input
        return { id: domainId, domain: 'example.edu.mn', isVerified: true, verificationStatus: 'VERIFIED' }
      },
      markDomainVerificationFailed: async () => undefined,
    }
    const service = createUniversityService(repository, async () => [['other'], [challenge]])
    const result = await service.verifyDomain(platformActor, universityId, domainId, {})
    expect(verified).toMatchObject({ universityId, domainId, actorId: platformActor.id })
    expect(result.domain.verificationStatus).toBe('VERIFIED')
  })

  it('fails DNS verification closed and records a failed attempt', async () => {
    let failed
    const repository = {
      findDomain: async () => ({
        id: domainId,
        universityId,
        domain: 'example.edu.mn',
        isActive: true,
        verificationStatus: 'PENDING',
        verificationMethod: 'DNS_TXT',
        verificationChallenge: 'uninet-verification=expected',
      }),
      markDomainVerificationFailed: async input => { failed = input },
    }
    const service = createUniversityService(repository, async () => [['wrong-value']])
    await expect(service.verifyDomain(platformActor, universityId, domainId, {})).rejects.toMatchObject({
      status: 409,
      code: 'DOMAIN_DNS_CHALLENGE_NOT_FOUND',
    })
    expect(failed).toMatchObject({ universityId, domainId })
  })

  it('requires evidence for administrative approval', async () => {
    const repository = {
      findDomain: async () => ({
        id: domainId,
        universityId,
        domain: 'example.edu.mn',
        isActive: true,
        verificationStatus: 'PENDING',
        verificationMethod: 'ADMIN_APPROVAL',
      }),
    }
    const service = createUniversityService(repository)
    await expect(service.verifyDomain(platformActor, universityId, domainId, {})).rejects.toMatchObject({
      status: 422,
      code: 'DOMAIN_VERIFICATION_EVIDENCE_REQUIRED',
    })
  })
})

it('requires a verified active domain before university activation', async () => {
  const repository = {
    findById: async () => ({ ...detail, status: 'PENDING', domains: [{ isActive: true, isVerified: false, verificationStatus: 'PENDING' }] }),
    updateStatus: async () => { throw new Error('must not update') },
  }
  const service = createUniversityService(repository)
  await expect(service.updateStatus(platformActor, universityId, {
    status: 'ACTIVE',
    reason: 'Attempting activation',
  })).rejects.toMatchObject({ status: 409, code: 'UNIVERSITY_VERIFIED_DOMAIN_REQUIRED' })
})
