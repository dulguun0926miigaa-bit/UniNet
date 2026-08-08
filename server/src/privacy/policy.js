import { AppError } from '../utils/app-error.js'

/**
 * Select exactly one active document per policy type. Requested locale wins;
 * Mongolian is the fallback. Publishing a newer version never mutates history.
 *
 * @param {Array<any>} documents
 * @param {string} locale
 * @param {Date} now
 */
export function selectCurrentPolicyDocuments(documents, locale = 'mn', now = new Date()) {
  const eligible = documents.filter(document => (
    document.publishedAt <= now
    && document.effectiveAt <= now
    && (!document.retiredAt || document.retiredAt > now)
  ))
  const types = [...new Set(eligible.map(document => document.type))]
  return types.map(type => {
    const candidates = eligible
      .filter(document => document.type === type)
      .sort((left, right) => right.effectiveAt.getTime() - left.effectiveAt.getTime()
        || right.publishedAt.getTime() - left.publishedAt.getTime())
    return candidates.find(document => document.locale === locale)
      ?? candidates.find(document => document.locale === 'mn')
      ?? candidates[0]
  }).filter(Boolean)
}

/** @param {string | undefined} userId @param {Array<any>} documents @param {any} context */
export function buildPolicyAcceptanceData(userId, documents, context = {}) {
  const acceptedAt = context.acceptedAt ?? new Date()
  return documents.map(document => ({
    ...(userId ? { userId } : {}),
    policyDocumentId: document.id,
    policyType: document.type,
    policyVersion: document.version,
    documentChecksum: document.checksum,
    source: context.source ?? 'WEB',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    acceptedAt,
    context: {
      route: context.route ?? null,
      locale: document.locale,
      acceptedTerms: true,
    },
  }))
}

/** @param {Array<any>} policies */
export function requireRegistrationPolicies(policies) {
  const requiredTypes = new Set(['TERMS_OF_SERVICE', 'PRIVACY_POLICY'])
  const present = new Set(policies.filter(policy => policy.required).map(policy => policy.type))
  if ([...requiredTypes].some(type => !present.has(type))) {
    throw new AppError(
      'Бүртгэлийн бодлогын баримт бичиг түр боломжгүй байна.',
      503,
      'POLICY_DOCUMENTS_UNAVAILABLE',
    )
  }
  return policies.filter(policy => policy.required)
}

/** @param {any} document */
export function serializePolicyDocument(document) {
  return {
    id: document.id,
    type: document.type,
    version: document.version,
    locale: document.locale,
    title: document.title,
    content: document.content,
    checksum: document.checksum,
    required: document.required,
    publishedAt: document.publishedAt,
    effectiveAt: document.effectiveAt,
  }
}
