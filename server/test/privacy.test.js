import { describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import {
  buildPolicyAcceptanceData,
  requireRegistrationPolicies,
  selectCurrentPolicyDocuments,
} from '../src/privacy/policy.js'
import { revokeConsentTransaction } from '../src/privacy/privacy.repository.js'
import { buildDeletionSchedule } from '../src/privacy/account-lifecycle.service.js'

const now = new Date('2026-07-27T12:00:00.000Z')

function policy(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    type: 'TERMS_OF_SERVICE',
    version: '1.0.0',
    locale: 'mn',
    checksum: 'checksum',
    required: true,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
    retiredAt: null,
    ...overrides,
  }
}

describe('versioned privacy policies', () => {
  it('selects the newest effective document per type and ignores future versions', () => {
    const currentTerms = policy({ id: 'current-terms', version: '2.0.0', effectiveAt: new Date('2026-06-01T00:00:00.000Z') })
    const documents = [
      policy({ id: 'old-terms' }),
      currentTerms,
      policy({ id: 'future-terms', version: '3.0.0', effectiveAt: new Date('2027-01-01T00:00:00.000Z') }),
      policy({ id: 'privacy', type: 'PRIVACY_POLICY' }),
    ]
    expect(selectCurrentPolicyDocuments(documents, 'mn', now)).toEqual(expect.arrayContaining([
      currentTerms,
      expect.objectContaining({ id: 'privacy' }),
    ]))
  })

  it('stores an immutable policy snapshot with timestamp and request context', () => {
    const acceptedAt = new Date('2026-07-27T12:30:00.000Z')
    const [acceptance] = buildPolicyAcceptanceData('user-id', [policy({ id: 'policy-id' })], {
      acceptedAt,
      source: 'REGISTRATION',
      ipAddress: '127.0.0.1',
      userAgent: 'Test browser',
      route: '/api/auth/register',
    })
    expect(acceptance).toMatchObject({
      userId: 'user-id',
      policyDocumentId: 'policy-id',
      policyVersion: '1.0.0',
      documentChecksum: 'checksum',
      source: 'REGISTRATION',
      ipAddress: '127.0.0.1',
      userAgent: 'Test browser',
      acceptedAt,
      context: { route: '/api/auth/register', locale: 'mn', acceptedTerms: true },
    })
  })

  it('requires both Terms and Privacy documents before registration', () => {
    expect(() => requireRegistrationPolicies([policy()])).toThrow(expect.objectContaining({
      code: 'POLICY_DOCUMENTS_UNAVAILABLE',
    }))
  })
})

describe('consent withdrawal', () => {
  it('withdraws only the owned linked application and clears shared PII atomically', async () => {
    const applicationUpdate = vi.fn(async () => undefined)
    const historyCreate = vi.fn(async () => undefined)
    const revokedRecord = {
      id: 'revoked-id',
      action: 'REVOKED',
    }
    const tx = {
      consentRecord: {
        findFirst: vi.fn(async ({ where }) => ({
          id: where.id,
          userId: where.userId,
          recipientUniversityId: 'a7ef7cda-8324-48a6-b08c-588d380f9158',
          resourceType: 'OPPORTUNITY_APPLICATION',
          resourceId: '2b445d9a-67ea-4b58-8070-71e5dfbc99ef',
          recipientName: 'TEST',
          purpose: 'Internship application',
          dataFields: ['email', 'cvUrl'],
          action: 'GRANTED',
          grantedAt: now,
          revokedAt: null,
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async () => revokedRecord),
      },
      application: {
        findFirst: vi.fn(async ({ where }) => ({
          id: where.id,
          userId: where.userId,
          status: 'UNDER_REVIEW',
        })),
        update: applicationUpdate,
      },
      applicationStatusHistory: { create: historyCreate },
    }

    const result = await revokeConsentTransaction(tx, {
      consentId: 'dd37dfca-35f2-4e21-bb4e-41e3792a626e',
      userId: '62d8b56a-07d2-4ad3-ac53-1377fc26403d',
      reason: 'No longer consent',
    })

    expect(tx.consentRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: '62d8b56a-07d2-4ad3-ac53-1377fc26403d' }),
    }))
    expect(tx.application.findFirst).toHaveBeenCalledWith({
      where: {
        id: '2b445d9a-67ea-4b58-8070-71e5dfbc99ef',
        userId: '62d8b56a-07d2-4ad3-ac53-1377fc26403d',
      },
    })
    expect(applicationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'WITHDRAWN',
        consentGranted: false,
        cvUrl: null,
        coverNote: null,
      }),
    }))
    expect(historyCreate).toHaveBeenCalledOnce()
    expect(result.downstreamOutcome).toBe('APPLICATION_WITHDRAWN_AND_PII_CLEARED')
  })

  it('does not reveal or mutate a consent owned by another user', async () => {
    const tx = {
      consentRecord: {
        findFirst: vi.fn(async () => null),
        updateMany: vi.fn(),
      },
    }
    await expect(revokeConsentTransaction(tx, {
      consentId: 'dd37dfca-35f2-4e21-bb4e-41e3792a626e',
      userId: '62d8b56a-07d2-4ad3-ac53-1377fc26403d',
      reason: 'No longer consent',
    })).rejects.toMatchObject({ status: 404, code: 'CONSENT_NOT_FOUND' })
    expect(tx.consentRecord.updateMany).not.toHaveBeenCalled()
  })
})

describe('account deletion scheduling', () => {
  it('uses a cooling-off window and extends it through an active legal hold', () => {
    const withoutHold = buildDeletionSchedule(now, null)
    expect(withoutHold.status).toBe('REQUESTED')
    expect(withoutHold.scheduledFor.toISOString()).toBe('2026-08-26T12:00:00.000Z')

    const legalHoldUntil = new Date('2026-10-01T00:00:00.000Z')
    const onHold = buildDeletionSchedule(now, legalHoldUntil)
    expect(onHold).toMatchObject({
      hasLegalHold: true,
      status: 'ON_HOLD',
      scheduledFor: legalHoldUntil,
    })
  })
})
