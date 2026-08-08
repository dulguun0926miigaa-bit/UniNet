import { Router } from 'express'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { authenticate, requireRole } from '../middleware/authenticate.js'
import { membershipService } from './membership.service.js'
import { operationsMutationLimiter, searchReadLimiter, sensitiveReadLimiter } from '../middleware/rate-limits.js'
import { requireIdempotency } from '../middleware/idempotency.js'

const router = Router()
const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Please wait before trying again.' } },
})
const context = req => ({ ipAddress: req.ip, userAgent: req.get('user-agent') })

// Possession of the opaque invitation token is the pre-authentication proof.
// The token is rate-limited, hashed at rest, expiring, and transactionally single-use.
router.post('/invitations/accept', invitationLimiter, async (req, res, next) => {
  try {
    res.status(201).json(await membershipService.acceptInvitation(req.body))
  } catch (error) { next(error) }
})

router.use(authenticate, requireRole('UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'))
router.use(operationsMutationLimiter)

router.post('/invitations', invitationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    res.status(201).json(await membershipService.createInvitation(req.auth.user, req.body, context(req)))
  } catch (error) { next(error) }
})

router.get('/invitations', searchReadLimiter, async (req, res, next) => {
  try {
    res.json(await membershipService.listInvitations(req.auth.user, req.query))
  } catch (error) { next(error) }
})

router.post('/invitations/:id/revoke', invitationLimiter, requireIdempotency, async (req, res, next) => {
  try {
    res.json(await membershipService.revokeInvitation(
      req.auth.user,
      req.params.id,
      req.query,
      context(req),
    ))
  } catch (error) { next(error) }
})

router.get('/students', searchReadLimiter, async (req, res, next) => {
  try {
    res.json(await membershipService.listMembers(req.auth.user, 'STUDENT', req.query))
  } catch (error) { next(error) }
})

router.get('/students/pending', searchReadLimiter, async (req, res, next) => {
  try {
    res.json(await membershipService.listPendingStudents(req.auth.user, req.query))
  } catch (error) { next(error) }
})


router.get('/students/export.csv', sensitiveReadLimiter, async (req, res, next) => {
  try {
    const result = await membershipService.exportMembers(req.auth.user, 'STUDENT', req.query, context(req))
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="uninet-students.csv"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    }).send(result.csv)
  } catch (error) { next(error) }
})

router.get('/students/:id', async (req, res, next) => {
  try {
    res.json(await membershipService.getMember(req.auth.user, 'STUDENT', req.params.id))
  } catch (error) { next(error) }
})

router.post('/students/:id/approve', requireIdempotency, async (req, res, next) => {
  try {
    res.json(await membershipService.approvePendingStudent(
      req.auth.user,
      req.params.id,
      req.body,
      context(req),
    ))
  } catch (error) { next(error) }
})

router.post('/students/:id/reject', requireIdempotency, async (req, res, next) => {
  try {
    res.json(await membershipService.rejectPendingStudent(
      req.auth.user,
      req.params.id,
      req.body,
      context(req),
    ))
  } catch (error) { next(error) }
})

router.patch('/students/:id/status', async (req, res, next) => {
  try {
    res.json(await membershipService.updateMemberStatus(
      req.auth.user,
      'STUDENT',
      req.params.id,
      req.body,
      context(req),
    ))
  } catch (error) { next(error) }
})

router.get('/staff', searchReadLimiter, async (req, res, next) => {
  try {
    res.json(await membershipService.listMembers(req.auth.user, 'STAFF', req.query))
  } catch (error) { next(error) }
})


router.get('/staff/export.csv', sensitiveReadLimiter, async (req, res, next) => {
  try {
    const result = await membershipService.exportMembers(req.auth.user, 'STAFF', req.query, context(req))
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="uninet-staff.csv"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    }).send(result.csv)
  } catch (error) { next(error) }
})

router.get('/staff/:id', async (req, res, next) => {
  try {
    res.json(await membershipService.getMember(req.auth.user, 'STAFF', req.params.id))
  } catch (error) { next(error) }
})

router.patch('/staff/:id/status', async (req, res, next) => {
  try {
    res.json(await membershipService.updateMemberStatus(
      req.auth.user,
      'STAFF',
      req.params.id,
      req.body,
      context(req),
    ))
  } catch (error) { next(error) }
})

router.patch('/staff/:id/permissions', async (req, res, next) => {
  try {
    res.json(await membershipService.updateStaffPermissions(
      req.auth.user,
      req.params.id,
      req.body,
      context(req),
    ))
  } catch (error) { next(error) }
})

// Roster uploads deliberately use text/csv instead of JSON. This keeps a stricter
// route-specific size limit and avoids weakening the global JSON parser limit.
router.get('/roster/template', async (req, res, next) => {
  try {
    const csv = await membershipService.rosterTemplate(req.auth.user)
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="uninet-roster-template.csv"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    }).send(csv)
  } catch (error) { next(error) }
})

router.get('/roster', searchReadLimiter, async (req, res, next) => {
  try {
    res.json(await membershipService.listRoster(req.auth.user, req.query))
  } catch (error) { next(error) }
})


router.get('/roster/export.csv', sensitiveReadLimiter, async (req, res, next) => {
  try {
    const result = await membershipService.exportRoster(req.auth.user, req.query, context(req))
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="uninet-roster.csv"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    }).send(result.csv)
  } catch (error) { next(error) }
})

router.patch('/roster/:id/status', requireIdempotency, async (req, res, next) => {
  try {
    res.json(await membershipService.updateRosterStatus(req.auth.user, req.params.id, req.body, context(req)))
  } catch (error) { next(error) }
})

router.post('/roster/imports/preview', express.text({ type: 'text/csv', limit: '1mb' }), requireIdempotency, async (req, res, next) => {
  try {
    res.status(201).json(await membershipService.previewRosterImport(
      req.auth.user,
      req.get('x-file-name') || 'roster.csv',
      req.body,
      context(req),
    ))
  } catch (error) { next(error) }
})

router.get('/roster/imports', searchReadLimiter, async (req, res, next) => {
  try {
    res.json(await membershipService.listRosterImports(req.auth.user, req.query))
  } catch (error) { next(error) }
})


router.get('/roster/imports/:id/errors.csv', sensitiveReadLimiter, async (req, res, next) => {
  try {
    const result = await membershipService.exportRosterImportErrors(req.auth.user, req.params.id, context(req))
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="roster-import-${req.params.id}-errors.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    }).send(result.csv)
  } catch (error) { next(error) }
})

router.get('/roster/imports/:id', async (req, res, next) => {
  try {
    res.json(await membershipService.getRosterImport(req.auth.user, req.params.id))
  } catch (error) { next(error) }
})

router.post('/roster/imports/:id/commit', requireIdempotency, async (req, res, next) => {
  try {
    res.json(await membershipService.commitRosterImport(req.auth.user, req.params.id, context(req)))
  } catch (error) { next(error) }
})

export { router as membershipRouter }
