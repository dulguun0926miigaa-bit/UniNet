import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { privacyRepository } from './privacy.repository.js'
import { serializePolicyDocument } from './policy.js'
import { cancelAccountDeletion, listAccountRequests } from './account-lifecycle.service.js'
import { sensitiveReadLimiter, supportMutationLimiter } from '../middleware/rate-limits.js'
import { requireIdempotency } from '../middleware/idempotency.js'

const router = Router()
const localeSchema = z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default('mn')
const acceptanceInput = z.object({
  policyDocumentIds: z.array(z.string().uuid()).min(1).max(10),
  locale: localeSchema.optional(),
}).strict()
const revokeInput = z.object({
  reason: z.string().trim().min(3).max(500).default('User withdrew consent'),
}).strict()

const requestContext = req => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
  route: req.originalUrl,
})

router.get('/policies/current', async (req, res, next) => {
  try {
    const locale = localeSchema.parse(req.query.locale)
    const policies = await privacyRepository.currentPolicies(locale)
    res.json({ policies: policies.map(serializePolicyDocument) })
  } catch (error) { next(error) }
})

router.use(authenticate)

router.get('/policies/acceptances', sensitiveReadLimiter, async (req, res, next) => {
  try {
    res.json({ acceptances: await privacyRepository.listPolicyAcceptances(req.auth.user.id) })
  } catch (error) { next(error) }
})

router.post('/policies/acceptances', supportMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    const input = acceptanceInput.parse(req.body)
    const acceptances = await privacyRepository.acceptCurrentPolicies({
      userId: req.auth.user.id,
      policyDocumentIds: [...new Set(input.policyDocumentIds)],
      locale: input.locale ?? 'mn',
      context: { ...requestContext(req), source: 'SETTINGS' },
    })
    res.status(201).json({ acceptances })
  } catch (error) { next(error) }
})

router.get('/consents', sensitiveReadLimiter, async (req, res, next) => {
  try { res.json({ consents: await privacyRepository.listConsents(req.auth.user.id) }) } catch (error) { next(error) }
})

router.post('/consents/:id/revoke', supportMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    const consentId = z.string().uuid().parse(req.params.id)
    const input = revokeInput.parse(req.body ?? {})
    const result = await privacyRepository.revokeConsent({
      consentId,
      userId: req.auth.user.id,
      reason: input.reason,
      context: requestContext(req),
    })
    res.json(result)
  } catch (error) { next(error) }
})

router.get('/account/requests', sensitiveReadLimiter, async (req, res, next) => {
  try { res.json({ requests: await listAccountRequests(req.auth.user.id) }) } catch (error) { next(error) }
})

router.post('/account/delete-request/cancel', supportMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    const request = await cancelAccountDeletion({ user: req.auth.user, context: requestContext(req) })
    res.json({ request })
  } catch (error) { next(error) }
})

export { router as privacyRouter }
