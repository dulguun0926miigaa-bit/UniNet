import { prisma } from '../lib/prisma.js'
import { createNotification } from '../notifications/notification.service.js'
import { AppError } from '../utils/app-error.js'
import { buildPolicyAcceptanceData, selectCurrentPolicyDocuments } from './policy.js'

const activeApplicationStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED']

async function listEligiblePolicyDocuments(database, now = new Date()) {
  return database.policyDocument.findMany({
    where: {
      publishedAt: { lte: now },
      effectiveAt: { lte: now },
      OR: [{ retiredAt: null }, { retiredAt: { gt: now } }],
    },
    orderBy: [{ type: 'asc' }, { effectiveAt: 'desc' }, { publishedAt: 'desc' }],
  })
}

/**
 * Applies user-owned downstream effects inside the same transaction as the
 * append-only revocation history. Every linked lookup includes userId.
 *
 * @param {any} tx
 * @param {{ consentId: string, userId: string, reason: string, context?: any }} input
 */
export async function revokeConsentTransaction(tx, input) {
  const consent = await tx.consentRecord.findFirst({
    where: { id: input.consentId, userId: input.userId, action: 'GRANTED', revokedAt: null },
  })
  if (!consent) throw new AppError('Идэвхтэй зөвшөөрөл олдсонгүй.', 404, 'CONSENT_NOT_FOUND')

  const now = new Date()
  const claimed = await tx.consentRecord.updateMany({
    where: { id: consent.id, userId: input.userId, action: 'GRANTED', revokedAt: null },
    data: { revokedAt: now, revokedReason: input.reason },
  })
  if (claimed.count !== 1) throw new AppError('Зөвшөөрөл аль хэдийн цуцлагдсан байна.', 409, 'CONSENT_ALREADY_REVOKED')

  let downstreamOutcome = 'NO_LINKED_RESOURCE'
  if (consent.resourceType === 'EVENT_REGISTRATION' && consent.resourceId) {
    const registration = await tx.eventRegistration.findFirst({
      where: { id: consent.resourceId, userId: input.userId },
      include: { content: true },
    })
    if (registration) {
      const previousStatus = registration.status
      const previousPosition = registration.waitlistPosition
      if (['CONFIRMED', 'WAITLISTED'].includes(previousStatus)) {
        await tx.eventRegistration.update({
          where: { id: registration.id },
          data: { status: 'CANCELLED', consentGranted: false, cancelledAt: now, waitlistPosition: null },
        })
        downstreamOutcome = 'EVENT_REGISTRATION_CANCELLED'
        if (previousStatus === 'WAITLISTED' && previousPosition != null) {
          await tx.eventRegistration.updateMany({
            where: {
              contentId: registration.contentId,
              status: 'WAITLISTED',
              waitlistPosition: { gt: previousPosition },
            },
            data: { waitlistPosition: { decrement: 1 } },
          })
        } else if (previousStatus === 'CONFIRMED') {
          const firstWaitlisted = await tx.eventRegistration.findFirst({
            where: { contentId: registration.contentId, status: 'WAITLISTED' },
            orderBy: [{ waitlistPosition: 'asc' }, { createdAt: 'asc' }],
          })
          if (firstWaitlisted) {
            await tx.eventRegistration.update({
              where: { id: firstWaitlisted.id },
              data: { status: 'CONFIRMED', waitlistPosition: null },
            })
            await tx.eventRegistration.updateMany({
              where: {
                contentId: registration.contentId,
                status: 'WAITLISTED',
                waitlistPosition: { gt: firstWaitlisted.waitlistPosition ?? 0 },
              },
              data: { waitlistPosition: { decrement: 1 } },
            })
            await createNotification(tx, {
                userId: firstWaitlisted.userId,
                universityId: registration.content.universityId,
                contentId: registration.contentId,
                type: 'WAITLIST_PROMOTED',
                title: 'Таны арга хэмжээний суудал баталгаажлаа',
                description: registration.content.title,
                actionUrl: '/student/registrations',
            })
          }
        }
      } else {
        await tx.eventRegistration.update({
          where: { id: registration.id },
          data: { consentGranted: false },
        })
        downstreamOutcome = 'EVENT_HISTORY_RETAINED'
      }
    }
  } else if (consent.resourceType === 'OPPORTUNITY_APPLICATION' && consent.resourceId) {
    const application = await tx.application.findFirst({
      where: { id: consent.resourceId, userId: input.userId },
    })
    if (application) {
      const withdraw = activeApplicationStatuses.includes(application.status)
      await tx.application.update({
        where: { id: application.id },
        data: {
          consentGranted: false,
          cvUrl: null,
          coverNote: null,
          ...(withdraw ? { status: 'WITHDRAWN', withdrawnAt: now } : {}),
        },
      })
      if (withdraw) {
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: application.id,
            actorId: input.userId,
            fromStatus: application.status,
            toStatus: 'WITHDRAWN',
            reason: 'Consent withdrawn by student',
          },
        })
        downstreamOutcome = 'APPLICATION_WITHDRAWN_AND_PII_CLEARED'
      } else {
        downstreamOutcome = 'APPLICATION_PII_CLEARED_DECISION_RETAINED'
      }
    }
  }

  const revoked = await tx.consentRecord.create({
    data: {
      userId: consent.userId,
      recipientUniversityId: consent.recipientUniversityId,
      resourceType: consent.resourceType,
      resourceId: consent.resourceId,
      supersedesId: consent.id,
      recipientName: consent.recipientName,
      purpose: consent.purpose,
      dataFields: consent.dataFields,
      action: 'REVOKED',
      grantedAt: consent.grantedAt,
      revokedAt: now,
      revokedReason: input.reason,
      context: { ...(input.context ?? {}), downstreamOutcome },
    },
  })
  return { consent: revoked, downstreamOutcome }
}

export const privacyRepository = {
  async currentPolicies(locale = 'mn', database = prisma) {
    return selectCurrentPolicyDocuments(await listEligiblePolicyDocuments(database), locale)
  },

  listPolicyAcceptances(userId) {
    return prisma.policyAcceptance.findMany({
      where: { userId },
      include: { policyDocument: { select: { title: true, locale: true, effectiveAt: true } } },
      orderBy: { acceptedAt: 'desc' },
    })
  },

  async acceptCurrentPolicies({ userId, policyDocumentIds, locale, context }) {
    return prisma.$transaction(async tx => {
      const current = selectCurrentPolicyDocuments(await listEligiblePolicyDocuments(tx), locale)
      const byId = new Map(current.map(document => [document.id, document]))
      const documents = policyDocumentIds.map(id => byId.get(id))
      if (documents.some(document => !document)) {
        throw new AppError('Зөвхөн хүчинтэй бодлогын хувилбарыг зөвшөөрнө.', 409, 'POLICY_VERSION_NOT_CURRENT')
      }
      await tx.policyAcceptance.createMany({
        data: buildPolicyAcceptanceData(userId, documents, context)
          .map(acceptance => ({ ...acceptance, userId })),
        skipDuplicates: true,
      })
      return tx.policyAcceptance.findMany({
        where: { userId, policyDocumentId: { in: policyDocumentIds } },
        include: { policyDocument: { select: { title: true, locale: true, effectiveAt: true } } },
        orderBy: { acceptedAt: 'desc' },
      })
    })
  },

  listConsents(userId) {
    return prisma.consentRecord.findMany({
      where: { userId },
      orderBy: [{ grantedAt: 'desc' }, { revokedAt: 'desc' }],
      take: 200,
    })
  },

  revokeConsent(input) {
    return prisma.$transaction(tx => revokeConsentTransaction(tx, input), { isolationLevel: 'Serializable' })
  },
}
