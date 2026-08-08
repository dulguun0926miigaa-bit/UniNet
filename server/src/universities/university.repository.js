import { prisma } from '../lib/prisma.js'

const insensitive = /** @type {const} */ ('insensitive')

const universityInclude = /** @satisfies {import('@prisma/client').Prisma.UniversityInclude} */ ({
  domains: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
  _count: {
    select: {
      users: true,
      members: true,
      contents: true,
      surveys: true,
      partnershipsRequested: true,
      partnershipsReceived: true,
    },
  },
})

export const universityRepository = {
  async list({ page, pageSize, search = undefined, status = undefined, sortBy, sortOrder }) {
    const where = {
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: insensitive } },
          { shortName: { contains: search, mode: insensitive } },
          { slug: { contains: search.toLowerCase() } },
          { domains: { some: { domain: { contains: search.toLowerCase() } } } },
        ],
      } : {}),
    }
    const [items, total] = await prisma.$transaction([
      prisma.university.findMany({
        where,
        include: universityInclude,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.university.count({ where }),
    ])
    return { items, total }
  },

  findById(id) {
    return prisma.university.findUnique({ where: { id }, include: universityInclude })
  },

  async create(data, audit) {
    return prisma.$transaction(async tx => {
      const university = await tx.university.create({
        data: {
          name: data.name,
          shortName: data.shortName,
          slug: data.slug,
          description: data.description,
          logoUrl: data.logoUrl,
          status: data.status,
          domains: {
            create: {
              domain: data.domain,
              isPrimary: true,
              isActive: true,
              isVerified: false,
              verificationStatus: 'UNVERIFIED',
            },
          },
        },
        include: universityInclude,
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId: university.id,
          action: 'UNIVERSITY_CREATED',
          resourceType: 'University',
          resourceId: university.id,
          resourceName: university.name,
          nextData: { status: university.status, domain: data.domain },
          severity: 'HIGH',
        },
      })
      return university
    })
  },

  async update(id, data, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.university.findUnique({ where: { id } })
      if (!current) return null
      const university = await tx.university.update({ where: { id }, data, include: universityInclude })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId: id,
          action: 'UNIVERSITY_UPDATED',
          resourceType: 'University',
          resourceId: id,
          resourceName: university.name,
          previousData: Object.fromEntries(Object.keys(data).map(key => [key, current[key]])),
          nextData: data,
          severity: 'HIGH',
        },
      })
      return university
    })
  },

  async updateStatus(id, status, reason, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.university.findUnique({ where: { id } })
      if (!current) return null
      const university = await tx.university.update({ where: { id }, data: { status }, include: universityInclude })
      const sessions = status === 'ACTIVE' ? { count: 0 } : await tx.session.updateMany({
        where: { user: { universityId: id }, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId: id,
          action: `UNIVERSITY_${status}`,
          resourceType: 'University',
          resourceId: id,
          resourceName: current.name,
          previousData: { status: current.status },
          nextData: { status, reason, sessionsRevoked: sessions.count },
          severity: 'HIGH',
        },
      })
      return { university, sessionsRevoked: sessions.count }
    })
  },

  async addDomain(universityId, data, audit) {
    return prisma.$transaction(async tx => {
      const university = await tx.university.findUnique({ where: { id: universityId }, select: { id: true, name: true } })
      if (!university) return { status: 'universityNotFound' }
      if (data.isPrimary) await tx.universityDomain.updateMany({ where: { universityId }, data: { isPrimary: false } })
      const domain = await tx.universityDomain.create({
        data: {
          universityId,
          domain: data.domain,
          isPrimary: data.isPrimary,
          isActive: true,
          isVerified: false,
          verificationStatus: 'UNVERIFIED',
        },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'UNIVERSITY_DOMAIN_ADDED',
          resourceType: 'UniversityDomain',
          resourceId: domain.id,
          resourceName: domain.domain,
          nextData: { isPrimary: domain.isPrimary, verificationStatus: domain.verificationStatus },
          severity: 'HIGH',
        },
      })
      return { status: 'created', domain }
    })
  },

  findDomain(universityId, domainId) {
    return prisma.universityDomain.findFirst({ where: { id: domainId, universityId } })
  },

  async requestDomainVerification({ universityId, domainId, method, challenge, evidence }, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.universityDomain.findFirst({ where: { id: domainId, universityId, isActive: true } })
      if (!current) return null
      const domain = await tx.universityDomain.update({
        where: { id: domainId },
        data: {
          isVerified: false,
          verificationStatus: 'PENDING',
          verificationMethod: method,
          verificationChallenge: challenge,
          verificationEvidence: evidence ?? null,
          verificationRequestedAt: new Date(),
          verifiedAt: null,
          verifiedByUserId: null,
        },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'UNIVERSITY_DOMAIN_VERIFICATION_REQUESTED',
          resourceType: 'UniversityDomain',
          resourceId: domain.id,
          resourceName: domain.domain,
          previousData: { verificationStatus: current.verificationStatus },
          nextData: { method, verificationStatus: 'PENDING' },
          severity: 'HIGH',
        },
      })
      return domain
    })
  },

  async verifyDomain({ universityId, domainId, actorId, evidence }, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.universityDomain.findFirst({ where: { id: domainId, universityId, isActive: true } })
      if (!current) return null
      const domain = await tx.universityDomain.update({
        where: { id: domainId },
        data: {
          isVerified: true,
          verificationStatus: 'VERIFIED',
          verificationEvidence: evidence ?? current.verificationEvidence,
          verifiedAt: new Date(),
          verifiedByUserId: actorId,
        },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'UNIVERSITY_DOMAIN_VERIFIED',
          resourceType: 'UniversityDomain',
          resourceId: domain.id,
          resourceName: domain.domain,
          previousData: { verificationStatus: current.verificationStatus, isVerified: current.isVerified },
          nextData: { verificationStatus: 'VERIFIED', method: domain.verificationMethod },
          severity: 'HIGH',
        },
      })
      return domain
    })
  },

  async markDomainVerificationFailed({ universityId, domainId, evidence }, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.universityDomain.findFirst({ where: { id: domainId, universityId, isActive: true } })
      if (!current) return null
      const domain = await tx.universityDomain.update({
        where: { id: domainId },
        data: { isVerified: false, verificationStatus: 'FAILED', verificationEvidence: evidence },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'UNIVERSITY_DOMAIN_VERIFICATION_FAILED',
          resourceType: 'UniversityDomain',
          resourceId: domain.id,
          resourceName: domain.domain,
          previousData: { verificationStatus: current.verificationStatus },
          nextData: { verificationStatus: 'FAILED', evidence },
          severity: 'HIGH',
        },
      })
      return domain
    })
  },

  async makePrimaryDomain(universityId, domainId, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.universityDomain.findFirst({
        where: { id: domainId, universityId, isActive: true, isVerified: true, verificationStatus: 'VERIFIED' },
      })
      if (!current) return null
      await tx.universityDomain.updateMany({ where: { universityId, isPrimary: true }, data: { isPrimary: false } })
      const domain = await tx.universityDomain.update({ where: { id: domainId }, data: { isPrimary: true } })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'UNIVERSITY_PRIMARY_DOMAIN_CHANGED',
          resourceType: 'UniversityDomain',
          resourceId: domain.id,
          resourceName: domain.domain,
          nextData: { isPrimary: true },
          severity: 'HIGH',
        },
      })
      return domain
    })
  },

  async revokeDomain(universityId, domainId, reason, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.universityDomain.findFirst({ where: { id: domainId, universityId, isActive: true } })
      if (!current) return { status: 'notFound' }
      if (current.isPrimary) return { status: 'primary' }
      const domain = await tx.universityDomain.update({
        where: { id: domainId },
        data: {
          isActive: false,
          isVerified: false,
          verificationStatus: 'REVOKED',
          verificationEvidence: reason,
        },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'UNIVERSITY_DOMAIN_REVOKED',
          resourceType: 'UniversityDomain',
          resourceId: domain.id,
          resourceName: domain.domain,
          previousData: { isActive: current.isActive, isVerified: current.isVerified, isPrimary: current.isPrimary },
          nextData: { isActive: false, verificationStatus: 'REVOKED', reason },
          severity: 'HIGH',
        },
      })
      return { status: 'revoked', domain }
    })
  },
}
