import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/authenticate.js'
import { requireIdempotency } from '../middleware/idempotency.js'
import { operationsMutationLimiter, searchReadLimiter } from '../middleware/rate-limits.js'
import { universityService } from './university.service.js'

const router = Router()
const context = req => ({ ipAddress: req.ip, userAgent: req.get('user-agent') })

router.use(authenticate)

// Editing the tenant's own public profile is intentionally a normal authenticated
// University Admin operation. It must not trigger the high-risk admin reason/
// step-up prompt that protects platform-level mutations.
router.get('/me/profile', requireRole('UNIVERSITY_ADMIN'), async (req, res, next) => {
  try { res.json(await universityService.getOwnProfile(req.auth.user)) } catch (error) { next(error) }
})

router.patch('/me/profile', requireRole('UNIVERSITY_ADMIN'), operationsMutationLimiter, async (req, res, next) => {
  try { res.json(await universityService.updateOwnProfile(req.auth.user, req.body, context(req))) } catch (error) { next(error) }
})


router.get('/', requireRole('PLATFORM_SUPER_ADMIN'), searchReadLimiter, async (req, res, next) => {
  try { res.json(await universityService.list(req.auth.user, req.query)) } catch (error) { next(error) }
})

router.post('/', requireRole('PLATFORM_SUPER_ADMIN'), operationsMutationLimiter, requireIdempotency, async (req, res, next) => {
  try { res.status(201).json(await universityService.create(req.auth.user, req.body, context(req))) } catch (error) { next(error) }
})

router.get('/:id', requireRole('UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'), async (req, res, next) => {
  try { res.json(await universityService.get(req.auth.user, req.params.id)) } catch (error) { next(error) }
})

router.patch('/:id', requireRole('PLATFORM_SUPER_ADMIN'), operationsMutationLimiter, async (req, res, next) => {
  try { res.json(await universityService.update(req.auth.user, req.params.id, req.body, context(req))) } catch (error) { next(error) }
})

router.patch('/:id/status', requireRole('PLATFORM_SUPER_ADMIN'), operationsMutationLimiter, requireIdempotency, async (req, res, next) => {
  try { res.json(await universityService.updateStatus(req.auth.user, req.params.id, req.body, context(req))) } catch (error) { next(error) }
})

router.post('/:id/domains', requireRole('PLATFORM_SUPER_ADMIN'), operationsMutationLimiter, requireIdempotency, async (req, res, next) => {
  try { res.status(201).json(await universityService.addDomain(req.auth.user, req.params.id, req.body, context(req))) } catch (error) { next(error) }
})

router.post('/:id/domains/:domainId/verification/request', requireRole('PLATFORM_SUPER_ADMIN'), operationsMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    res.json(await universityService.requestDomainVerification(
      req.auth.user,
      req.params.id,
      req.params.domainId,
      req.body,
      context(req),
    ))
  } catch (error) { next(error) }
})

router.post('/:id/domains/:domainId/verification/verify', requireRole('PLATFORM_SUPER_ADMIN'), operationsMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    res.json(await universityService.verifyDomain(
      req.auth.user,
      req.params.id,
      req.params.domainId,
      req.body,
      context(req),
    ))
  } catch (error) { next(error) }
})

router.patch('/:id/domains/:domainId/primary', requireRole('PLATFORM_SUPER_ADMIN'), operationsMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    res.json(await universityService.makePrimaryDomain(
      req.auth.user,
      req.params.id,
      req.params.domainId,
      context(req),
    ))
  } catch (error) { next(error) }
})

router.delete('/:id/domains/:domainId', requireRole('PLATFORM_SUPER_ADMIN'), operationsMutationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    res.json(await universityService.revokeDomain(
      req.auth.user,
      req.params.id,
      req.params.domainId,
      req.body,
      context(req),
    ))
  } catch (error) { next(error) }
})

export { router as universityRouter }
