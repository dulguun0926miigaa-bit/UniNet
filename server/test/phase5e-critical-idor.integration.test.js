import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { hashPassword } from '../src/utils/password.js'
import {
  assertDedicatedTestDatabase,
  cleanupIntegrationFixtures,
  createAuthenticatedUser,
  createContent,
  createPendingStudent,
  createSurvey,
  createUniversity,
} from './integration-fixtures.js'

const bearer = token => ({ Authorization: `Bearer ${token}` })

beforeAll(async () => { assertDedicatedTestDatabase(); await prisma.$connect() })
afterAll(async () => { await cleanupIntegrationFixtures(); await prisma.$disconnect() })

describe('Phase 5E critical IDOR/BOLA and strict query validation', () => {
  it('denies foreign content, survey, membership, registration and application identifiers', async () => {
    const [tenantA, tenantB] = await Promise.all([createUniversity('phase5e-a'), createUniversity('phase5e-b')])
    const [staffA, adminA, adminB, studentA] = await Promise.all([
      createAuthenticatedUser({ role: 'STAFF', university: tenantA, label: 'phase5e-staff', permissions: { canCreateContent: true, canManageSurveys: true, canManageRegistrations: true, canManageApplications: true, canViewReports: true } }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: tenantA, label: 'phase5e-admin-a' }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: tenantB, label: 'phase5e-admin-b' }),
      createAuthenticatedUser({ university: tenantA, label: 'phase5e-student' }),
    ])
    const [event, opportunity] = await Promise.all([
      createContent({ university: tenantA, createdBy: staffA.user, type: 'EVENT', label: 'phase5e-event' }),
      createContent({ university: tenantA, createdBy: staffA.user, type: 'INTERNSHIP', label: 'phase5e-opportunity' }),
    ])
    const survey = await createSurvey({ university: tenantA, createdBy: staffA.user, label: 'phase5e-survey' })
    const registration = await prisma.eventRegistration.create({ data: { userId: studentA.user.id, contentId: event.id, registrationCode: `P5E-${Date.now()}`, status: 'CONFIRMED' } })
    const application = await prisma.application.create({ data: { userId: studentA.user.id, contentId: opportunity.id, status: 'SUBMITTED', cvUrl: 'https://example.test/cv.pdf' } })
    const pending = await createPendingStudent({ university: tenantA, label: 'phase5e-pending' })

    await request(app).get(`/api/operations/content/${event.id}`).set(bearer(adminB.token)).expect(403)
    await request(app).get(`/api/surveys/${survey.id}`).set(bearer(adminB.token)).expect(404)
    await request(app).get(`/api/operations/registrations/${registration.id}`).set(bearer(adminB.token)).expect(403)
    await request(app).get(`/api/operations/applications/${application.id}`).set(bearer(adminB.token)).expect(403)
    await request(app).post(`/api/memberships/students/${pending.user.id}/approve`).set(bearer(adminB.token)).set('Idempotency-Key', `phase5e-${Date.now()}`).send({ reason: 'Cross tenant attempt' }).expect(404)

    await request(app).get(`/api/operations/content/${event.id}`).set(bearer(adminA.token)).expect(200)
    await request(app).get(`/api/operations/registrations/${registration.id}`).set(bearer(adminA.token)).expect(200)
    await request(app).get(`/api/operations/applications/${application.id}`).set(bearer(adminA.token)).expect(200)

    await request(app).patch(`/api/operations/content/${event.id}/status`).set(bearer(adminA.token)).send({ status: 'ARCHIVED', reason: 'Phase 5E audit verification' }).expect(200)
    await request(app).patch(`/api/surveys/${survey.id}/status`).set(bearer(staffA.token)).send({ status: 'CLOSED' }).expect(200)
    await request(app).post(`/api/memberships/students/${pending.user.id}/approve`).set(bearer(adminA.token)).set('Idempotency-Key', `phase5e-approve-${Date.now()}`).send({ reason: 'Roster verified for final MVP' }).expect(200)

    expect(await prisma.auditLog.count({ where: { resourceId: event.id, action: 'CONTENT_ARCHIVED' } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { resourceId: survey.id, action: 'SURVEY_STATUS_CHANGED' } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { resourceId: pending.user.id, action: 'STUDENT_REVIEW_APPROVED' } })).toBe(1)
  })

  it('rejects malformed IDs, oversized pages and unknown sort/filter fields', async () => {
    const tenant = await createUniversity('phase5e-validation')
    const admin = await createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: tenant, label: 'phase5e-validation-admin' })
    for (const path of ['/api/operations/content/not-a-uuid', '/api/operations/registrations/not-a-uuid', '/api/operations/applications/not-a-uuid']) {
      const response = await request(app).get(path).set(bearer(admin.token))
      expect(response.status).toBe(422)
    }
    await request(app).get('/api/operations/registrations?pageSize=51').set(bearer(admin.token)).expect(422)
    await request(app).get('/api/operations/applications?sortBy=password').set(bearer(admin.token)).expect(422)
    await request(app).get('/api/memberships/students?pageSize=51').set(bearer(admin.token)).expect(422)
    await request(app).get('/api/memberships/students?sortBy=password').set(bearer(admin.token)).expect(422)
  })

  it('protects verified profile fields and password changes with server-side authorization', async () => {
    const tenant = await createUniversity('phase5e-sensitive-profile')
    const student = await createAuthenticatedUser({ university: tenant, label: 'phase5e-sensitive-student' })
    await prisma.user.update({ where: { id: student.user.id }, data: { passwordHash: await hashPassword('CurrentStrong!2026Password') } })

    const emailChange = await request(app)
      .patch('/api/settings/account')
      .set(bearer(student.token))
      .send({ value: { email: 'attacker@foreign.example', firstName: 'Integration', lastName: 'Student' } })
    expect(emailChange.status).toBe(409)
    expect(emailChange.body.error.code).toBe('VERIFIED_EMAIL_LOCKED')

    const universityChange = await request(app)
      .patch('/api/settings/account')
      .set(bearer(student.token))
      .send({ value: { university: 'Foreign University', firstName: 'Integration', lastName: 'Student' } })
    expect(universityChange.status).toBe(409)
    expect(universityChange.body.error.code).toBe('VERIFIED_UNIVERSITY_LOCKED')

    const passwordChange = await request(app)
      .patch('/api/settings/security')
      .set(bearer(student.token))
      .send({ value: { current: 'wrong-current-password', next: 'StrongNext!2026Password', repeat: 'StrongNext!2026Password' } })
    expect(passwordChange.status).toBe(422)
    expect(passwordChange.body.error.code).toBe('CURRENT_PASSWORD_INVALID')
  })

})
