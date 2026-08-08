import { randomBytes } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'
import { AppError } from '../utils/app-error.js'
import { universityRepository } from './university.repository.js'
import {
  domainCreateSchema,
  domainParamsSchema,
  domainVerificationRequestSchema,
  domainVerificationSchema,
  universityCreateSchema,
  universityIdSchema,
  universityListSchema,
  universityStatusSchema,
  universityUpdateSchema,
} from './university.validation.js'

const notFound = () => new AppError('Их сургууль олдсонгүй.', 404, 'UNIVERSITY_NOT_FOUND')
const domainNotFound = () => new AppError('Домэйн олдсонгүй.', 404, 'UNIVERSITY_DOMAIN_NOT_FOUND')
const forbidden = () => new AppError('Зөвхөн Platform Super Admin энэ үйлдлийг хийнэ.', 403, 'PLATFORM_ADMIN_REQUIRED')
const auditFrom = (actor, context = {}) => ({
  actorId: actor.id,
  ipAddress: context.ipAddress,
  userAgent: context.userAgent?.slice(0, 500),
})

function assertPlatformAdmin(actor) {
  if (actor?.role !== 'PLATFORM_SUPER_ADMIN') throw forbidden()
}

function assertReadable(actor, universityId) {
  if (actor?.role === 'PLATFORM_SUPER_ADMIN') return
  if (actor?.role === 'UNIVERSITY_ADMIN' && actor.universityId === universityId) return
  throw new AppError('Өөр сургуулийн мэдээлэлд хандах эрхгүй.', 403, 'TENANT_ACCESS_DENIED')
}

function makeDnsChallenge() {
  return `uninet-verification=${randomBytes(24).toString('hex')}`
}

export function createUniversityService(repository = universityRepository, dnsResolver = resolveTxt) {
  return {
    async list(actor, query) {
      assertPlatformAdmin(actor)
      const input = universityListSchema.parse(query)
      const result = await repository.list(input)
      return {
        items: result.items,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / input.pageSize),
        },
      }
    },

    async get(actor, id) {
      universityIdSchema.parse({ id })
      assertReadable(actor, id)
      const university = await repository.findById(id)
      if (!university) throw notFound()
      return {
        university,
        stats: {
          users: university._count.users,
          rosterMembers: university._count.members,
          contents: university._count.contents,
          surveys: university._count.surveys,
          partnerships: university._count.partnershipsRequested + university._count.partnershipsReceived,
        },
      }
    },

    async create(actor, payload, context) {
      assertPlatformAdmin(actor)
      const input = universityCreateSchema.parse(payload)
      const university = await repository.create(input, auditFrom(actor, context))
      return { university }
    },

    async update(actor, id, payload, context) {
      assertPlatformAdmin(actor)
      universityIdSchema.parse({ id })
      const input = universityUpdateSchema.parse(payload)
      const university = await repository.update(id, input, auditFrom(actor, context))
      if (!university) throw notFound()
      return { university }
    },

    async getOwnProfile(actor) {
      if (actor?.role !== 'UNIVERSITY_ADMIN' || !actor.universityId) throw new AppError('University Admin эрх шаардлагатай.', 403, 'UNIVERSITY_ADMIN_REQUIRED')
      return this.get(actor, actor.universityId)
    },

    async updateOwnProfile(actor, payload, context) {
      if (actor?.role !== 'UNIVERSITY_ADMIN' || !actor.universityId) throw new AppError('University Admin эрх шаардлагатай.', 403, 'UNIVERSITY_ADMIN_REQUIRED')
      const input = universityUpdateSchema.parse(payload)
      delete input.slug
      const university = await repository.update(actor.universityId, input, auditFrom(actor, context))
      if (!university) throw notFound()
      return { university }
    },

    async updateStatus(actor, id, payload, context) {
      assertPlatformAdmin(actor)
      universityIdSchema.parse({ id })
      const input = universityStatusSchema.parse(payload)
      if (input.status === 'ACTIVE') {
        const current = await repository.findById(id)
        if (!current) throw notFound()
        const hasVerifiedDomain = current.domains?.some(domain => (
          domain.isActive
          && domain.isVerified
          && domain.verificationStatus === 'VERIFIED'
        ))
        if (!hasVerifiedDomain) {
          throw new AppError(
            'Их сургуулийг идэвхжүүлэхийн өмнө дор хаяж нэг active, verified domain шаардлагатай.',
            409,
            'UNIVERSITY_VERIFIED_DOMAIN_REQUIRED',
          )
        }
      }
      const result = await repository.updateStatus(id, input.status, input.reason ?? 'Status changed by Platform Super Admin', auditFrom(actor, context))
      if (!result) throw notFound()
      return result
    },

    async addDomain(actor, universityId, payload, context) {
      assertPlatformAdmin(actor)
      universityIdSchema.parse({ id: universityId })
      const input = domainCreateSchema.parse(payload)
      const result = await repository.addDomain(universityId, input, auditFrom(actor, context))
      if (result.status === 'universityNotFound') throw notFound()
      return { domain: result.domain }
    },

    async requestDomainVerification(actor, universityId, domainId, payload, context) {
      assertPlatformAdmin(actor)
      domainParamsSchema.parse({ id: universityId, domainId })
      const input = domainVerificationRequestSchema.parse(payload)
      const challenge = input.method === 'DNS_TXT' ? makeDnsChallenge() : null
      const domain = await repository.requestDomainVerification({
        universityId,
        domainId,
        method: input.method,
        challenge,
        evidence: input.evidence,
      }, auditFrom(actor, context))
      if (!domain) throw domainNotFound()
      return {
        domain,
        verification: {
          method: input.method,
          challenge,
          dnsRecord: challenge ? { type: 'TXT', host: domain.domain, value: challenge } : null,
        },
      }
    },

    async verifyDomain(actor, universityId, domainId, payload, context) {
      assertPlatformAdmin(actor)
      domainParamsSchema.parse({ id: universityId, domainId })
      const input = domainVerificationSchema.parse(payload)
      const current = await repository.findDomain(universityId, domainId)
      if (!current || !current.isActive) throw domainNotFound()
      if (current.verificationStatus !== 'PENDING' || !current.verificationMethod) {
        throw new AppError('Эхлээд домэйн баталгаажуулах хүсэлт үүсгэнэ үү.', 409, 'DOMAIN_VERIFICATION_NOT_PENDING')
      }

      let evidence = input.evidence
      if (current.verificationMethod === 'ADMIN_APPROVAL') {
        if (!evidence || evidence.length < 3) {
          throw new AppError('Administrative approval evidence шаардлагатай.', 422, 'DOMAIN_VERIFICATION_EVIDENCE_REQUIRED')
        }
      } else if (current.verificationMethod === 'DNS_TXT') {
        if (!current.verificationChallenge) {
          throw new AppError('DNS verification challenge олдсонгүй.', 409, 'DOMAIN_VERIFICATION_CHALLENGE_MISSING')
        }
        let records
        try {
          records = await dnsResolver(current.domain)
        } catch {
          records = []
        }
        const flattened = records.flat().map(value => String(value).trim())
        if (!flattened.includes(current.verificationChallenge)) {
          const failedEvidence = `DNS TXT challenge not found at ${new Date().toISOString()}`
          await repository.markDomainVerificationFailed(
            { universityId, domainId, evidence: failedEvidence },
            auditFrom(actor, context),
          )
          throw new AppError('DNS TXT бичлэгээс verification challenge олдсонгүй.', 409, 'DOMAIN_DNS_CHALLENGE_NOT_FOUND')
        }
        evidence = `DNS TXT matched: ${current.verificationChallenge}`
      }

      const domain = await repository.verifyDomain({
        universityId,
        domainId,
        actorId: actor.id,
        evidence,
      }, auditFrom(actor, context))
      if (!domain) throw domainNotFound()
      return { domain }
    },

    async makePrimaryDomain(actor, universityId, domainId, context) {
      assertPlatformAdmin(actor)
      domainParamsSchema.parse({ id: universityId, domainId })
      const domain = await repository.makePrimaryDomain(universityId, domainId, auditFrom(actor, context))
      if (!domain) {
        throw new AppError('Зөвхөн идэвхтэй, баталгаажсан домэйныг primary болгож болно.', 409, 'PRIMARY_DOMAIN_MUST_BE_VERIFIED')
      }
      return { domain }
    },

    async revokeDomain(actor, universityId, domainId, payload, context) {
      assertPlatformAdmin(actor)
      domainParamsSchema.parse({ id: universityId, domainId })
      const input = universityStatusSchema.pick({ reason: true }).parse(payload)
      const result = await repository.revokeDomain(universityId, domainId, input.reason, auditFrom(actor, context))
      if (result.status === 'notFound') throw domainNotFound()
      if (result.status === 'primary') {
        throw new AppError('Primary домэйныг шууд устгаж болохгүй. Эхлээд өөр домэйн primary болгоно уу.', 409, 'PRIMARY_DOMAIN_REVOKE_FORBIDDEN')
      }
      return { domain: result.domain }
    },
  }
}

export const universityService = createUniversityService()
