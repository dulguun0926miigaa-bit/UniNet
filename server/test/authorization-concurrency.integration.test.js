import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import {
  assertDedicatedTestDatabase,
  cleanupIntegrationFixtures,
  createAuthenticatedUser,
  createContent,
  createPartnership,
  createPendingStudent,
  createSurvey,
  createUniversity,
  integrationIdentity,
} from './integration-fixtures.js'

const bearer = token => ({ Authorization: `Bearer ${token}` })
const idempotencyKey = label => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`

beforeAll(async () => {
  assertDedicatedTestDatabase()
  await prisma.$connect()
})

afterAll(async () => {
  await cleanupIntegrationFixtures()
  await prisma.$disconnect()
})

describe('tenant and role authorization at the HTTP boundary', () => {
  it('denies cross-tenant content access by UUID (BOLA)', async () => {
    const [universityA, universityB] = await Promise.all([
      createUniversity('tenant-a'),
      createUniversity('tenant-b'),
    ])
    const adminA = await createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: universityA, label: 'admin-a' })
    const ownerB = await createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: universityB, label: 'admin-b' })
    const foreignContent = await createContent({ university: universityB, createdBy: ownerB.user, label: 'foreign-content' })

    const response = await request(app)
      .get(`/api/operations/content/${foreignContent.id}`)
      .set(bearer(adminA.token))

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('TENANT_ACCESS_DENIED')
  })

  it('denies a student from operations APIs', async () => {
    const university = await createUniversity('role-guard')
    const student = await createAuthenticatedUser({ university, label: 'student-role-guard' })

    const response = await request(app).get('/api/operations/bootstrap').set(bearer(student.token))

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('prevents register mass-assignment from escalating the role', async () => {
    const email = `${integrationIdentity('mass-assignment')}@untrusted.test`
    const response = await request(app)
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send({
        firstName: 'Mass',
        lastName: 'Assignment',
        email,
        password: 'Secure!Password2026',
        confirmPassword: 'Secure!Password2026',
        acceptedTerms: true,
        role: 'PLATFORM_SUPER_ADMIN',
        status: 'ACTIVE',
        universityId: '00000000-0000-4000-8000-000000000000',
      })

    expect(response.status).toBe(201)
    expect(response.body.user.role).toBe('STUDENT')
    expect(response.body.user.universityId).toBeNull()
    const saved = await prisma.user.findUnique({ where: { normalizedEmail: email } })
    expect(saved).toMatchObject({ role: 'STUDENT', universityId: null })
    if (saved) {
      // Register-created accounts are tracked explicitly because they bypass the fixture factory.
      await prisma.user.delete({ where: { id: saved.id } })
    }
  })

  it('rejects a malicious URL and unknown application fields before persistence', async () => {
    const university = await createUniversity('validation')
    const student = await createAuthenticatedUser({ university, label: 'malicious-input' })
    const opportunity = await createContent({ university, type: 'JOB', label: 'safe-url-opportunity' })

    const response = await request(app)
      .post(`/api/student/opportunities/${opportunity.id}/application`)
      .set(bearer(student.token))
      .set('Idempotency-Key', idempotencyKey('malicious-url'))
      .send({
        cvUrl: 'javascript:alert(document.domain)',
        coverNote: '<script>alert(1)</script>',
        consentGranted: true,
        role: 'PLATFORM_SUPER_ADMIN',
      })

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(await prisma.application.count({ where: { userId: student.user.id, contentId: opportunity.id } })).toBe(0)
  })
})



describe('survey permission, visibility, and object authorization', () => {
  it('runs the draft, edit, publish, respond, report, and close lifecycle through HTTP', async () => {
    const university = await createUniversity('survey-lifecycle')
    const [staff, student] = await Promise.all([
      createAuthenticatedUser({
        role: 'STAFF',
        university,
        label: 'survey-lifecycle-staff',
        permissions: { canManageSurveys: true, canViewReports: true },
      }),
      createAuthenticatedUser({ university, label: 'survey-lifecycle-student' }),
    ])

    const created = await request(app)
      .post('/api/surveys')
      .set(bearer(staff.token))
      .set('Idempotency-Key', idempotencyKey('survey-lifecycle-create'))
      .send({
        title: 'Lifecycle survey',
        description: 'Draft to closed integration lifecycle.',
        visibility: 'PRIVATE',
        status: 'DRAFT',
        questions: [{ id: 'q1', title: 'Your answer', type: 'SHORT_TEXT', required: true, options: [] }],
      })
    expect(created.status).toBe(201)
    expect(created.body.survey).toMatchObject({ status: 'DRAFT', visibility: 'PRIVATE' })

    const surveyId = created.body.survey.id
    const edited = await request(app)
      .patch(`/api/surveys/${surveyId}`)
      .set(bearer(staff.token))
      .send({ title: 'Lifecycle survey updated' })
    expect(edited.status).toBe(200)
    expect(edited.body.survey.title).toBe('Lifecycle survey updated')

    const published = await request(app)
      .patch(`/api/surveys/${surveyId}/status`)
      .set(bearer(staff.token))
      .send({ status: 'PUBLISHED' })
    expect(published.status).toBe(200)
    expect(published.body.survey.status).toBe('PUBLISHED')

    const submitted = await request(app)
      .post(`/api/surveys/${surveyId}/responses`)
      .set(bearer(student.token))
      .set('Idempotency-Key', idempotencyKey('survey-lifecycle-response'))
      .send({ answers: ['Integrated response'] })
    expect(submitted.status).toBe(201)

    const report = await request(app)
      .get(`/api/surveys/${surveyId}/report`)
      .set(bearer(staff.token))
    expect(report.status).toBe(200)
    expect(report.body.report.responseCount).toBe(1)

    const closed = await request(app)
      .patch(`/api/surveys/${surveyId}/status`)
      .set(bearer(staff.token))
      .send({ status: 'CLOSED' })
    expect(closed.status).toBe(200)
    expect(closed.body.survey.status).toBe('CLOSED')
  })

  it('requires canManageSurveys before a Staff member can create a survey', async () => {
    const university = await createUniversity('survey-permission')
    const staff = await createAuthenticatedUser({
      role: 'STAFF',
      university,
      label: 'survey-no-permission',
      permissions: { canManageSurveys: false },
    })

    const response = await request(app)
      .post('/api/surveys')
      .set(bearer(staff.token))
      .set('Idempotency-Key', idempotencyKey('survey-permission'))
      .send({
        title: 'Permission protected survey',
        description: 'Staff without permission must not create this survey.',
        visibility: 'PRIVATE',
        status: 'DRAFT',
        questions: [{ id: 'q1', title: 'Question', type: 'SHORT_TEXT', required: true, options: [] }],
      })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('enforces PRIVATE, NETWORK, and active PARTNERS visibility for read and submit', async () => {
    const [universityA, universityB] = await Promise.all([
      createUniversity('survey-audience-a'),
      createUniversity('survey-audience-b'),
    ])
    const [studentA, adminA, ownerB] = await Promise.all([
      createAuthenticatedUser({ university: universityA, label: 'survey-reader-a' }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: universityA, label: 'survey-admin-a' }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: universityB, label: 'survey-owner-b' }),
    ])
    const privateSurvey = await createSurvey({
      university: universityB,
      createdBy: ownerB.user,
      label: 'private-b',
      visibility: 'PRIVATE',
    })
    const networkSurvey = await createSurvey({
      university: universityB,
      createdBy: ownerB.user,
      label: 'network-b',
      visibility: 'NETWORK',
    })
    const partnerSurvey = await createSurvey({
      university: universityB,
      createdBy: ownerB.user,
      label: 'partner-b',
      visibility: 'PARTNERS',
    })

    await request(app).get(`/api/surveys/${privateSurvey.id}`).set(bearer(studentA.token)).expect(404)
    await request(app)
      .patch(`/api/surveys/${privateSurvey.id}`)
      .set(bearer(adminA.token))
      .send({ title: 'Cross tenant mutation attempt' })
      .expect(404)
    await request(app).get(`/api/surveys/${networkSurvey.id}`).set(bearer(studentA.token)).expect(200)
    await request(app).get(`/api/surveys/${partnerSurvey.id}`).set(bearer(studentA.token)).expect(404)

    await createPartnership({ requesterUniversity: universityA, partnerUniversity: universityB })
    await request(app).get(`/api/surveys/${partnerSurvey.id}`).set(bearer(studentA.token)).expect(200)

    const bootstrap = await request(app).get('/api/student/bootstrap').set(bearer(studentA.token)).expect(200)
    const visibleSurveyIds = bootstrap.body.surveys.map(survey => survey.id)
    expect(visibleSurveyIds).toContain(networkSurvey.id)
    expect(visibleSurveyIds).toContain(partnerSurvey.id)
    expect(visibleSurveyIds).not.toContain(privateSurvey.id)

    const deniedSubmission = await request(app)
      .post(`/api/surveys/${privateSurvey.id}/responses`)
      .set(bearer(studentA.token))
      .set('Idempotency-Key', idempotencyKey('private-survey-submit'))
      .send({ answers: ['Not allowed'] })
    expect(deniedSubmission.status).toBe(404)
  })

  it('keeps Staff reports creator-scoped and tenant administrators tenant-scoped', async () => {
    const university = await createUniversity('survey-report-scope')
    const [creator, otherStaff, admin] = await Promise.all([
      createAuthenticatedUser({
        role: 'STAFF',
        university,
        label: 'survey-report-creator',
        permissions: { canManageSurveys: true, canViewReports: true },
      }),
      createAuthenticatedUser({
        role: 'STAFF',
        university,
        label: 'survey-report-other',
        permissions: { canViewReports: true },
      }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university, label: 'survey-report-admin' }),
    ])
    const survey = await createSurvey({ university, createdBy: creator.user, label: 'report-owner' })

    await request(app).get(`/api/surveys/${survey.id}/report`).set(bearer(otherStaff.token)).expect(404)
    await request(app).get(`/api/surveys/${survey.id}/report`).set(bearer(admin.token)).expect(200)
  })

  it('rejects oversized pages, unknown sort fields, and unknown query parameters', async () => {
    const university = await createUniversity('survey-query-validation')
    const student = await createAuthenticatedUser({ university, label: 'survey-query-student' })

    const tooLarge = await request(app).get('/api/surveys?pageSize=51').set(bearer(student.token))
    expect(tooLarge.status).toBe(422)
    expect(tooLarge.body.error.code).toBe('VALIDATION_ERROR')

    const unsafeSort = await request(app).get('/api/surveys?sortBy=createdById').set(bearer(student.token))
    expect(unsafeSort.status).toBe(422)

    const unknown = await request(app).get('/api/surveys?role=PLATFORM_SUPER_ADMIN').set(bearer(student.token))
    expect(unknown.status).toBe(422)
  })

  it('prevents publishing a PARTNERS survey without an active partnership', async () => {
    const university = await createUniversity('survey-partner-publish')
    const staff = await createAuthenticatedUser({
      role: 'STAFF',
      university,
      label: 'survey-partner-publisher',
      permissions: { canManageSurveys: true },
    })

    const response = await request(app)
      .post('/api/surveys')
      .set(bearer(staff.token))
      .set('Idempotency-Key', idempotencyKey('partner-survey-without-partner'))
      .send({
        title: 'Partner survey',
        description: 'Must have at least one active partnership before publish.',
        visibility: 'PARTNERS',
        status: 'PUBLISHED',
        questions: [{ id: 'q1', title: 'Question', type: 'SHORT_TEXT', required: true, options: [] }],
      })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('SURVEY_ACTIVE_PARTNERSHIP_REQUIRED')
  })
})

describe('pending student review workflow', () => {
  it('lets only the owning University Admin approve a verified roster-linked student', async () => {
    const [universityA, universityB] = await Promise.all([
      createUniversity('review-a'),
      createUniversity('review-b'),
    ])
    const [adminA, adminB] = await Promise.all([
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: universityA, label: 'review-admin-a' }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: universityB, label: 'review-admin-b' }),
    ])
    const pending = await createPendingStudent({ university: universityA, label: 'review-student' })

    const denied = await request(app)
      .post(`/api/memberships/students/${pending.user.id}/approve`)
      .set(bearer(adminB.token))
      .set('Idempotency-Key', idempotencyKey('cross-tenant-review'))
      .send({ rosterMemberId: pending.roster.id, reason: 'Cross tenant attempt' })
    expect(denied.status).toBe(404)

    const approved = await request(app)
      .post(`/api/memberships/students/${pending.user.id}/approve`)
      .set(bearer(adminA.token))
      .set('Idempotency-Key', idempotencyKey('approve-review'))
      .send({ rosterMemberId: pending.roster.id, reason: 'Official roster identity confirmed' })
    expect(approved.status).toBe(200)
    expect(approved.body.user.status).toBe('ACTIVE')

    const saved = await prisma.user.findUnique({ where: { id: pending.user.id }, include: { studentProfile: true } })
    expect(saved).toMatchObject({ status: 'ACTIVE', studentProfile: { rosterMemberId: pending.roster.id } })
  })

  it('allows the owning University Admin to approve directly when no roster row exists', async () => {
    const university = await createUniversity('review-direct')
    const admin = await createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university, label: 'review-direct-admin' })
    const pending = await createPendingStudent({ university, label: 'review-direct-student' })
    await prisma.universityMember.delete({ where: { id: pending.roster.id } })

    const response = await request(app)
      .post(`/api/memberships/students/${pending.user.id}/approve`)
      .set(bearer(admin.token))
      .set('Idempotency-Key', idempotencyKey('direct-approve-review'))
      .send({ reason: 'University Admin direct approval' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      user: { status: 'ACTIVE' },
      rosterMember: null,
      approvalMode: 'DIRECT_ADMIN_APPROVAL',
    })

    const saved = await prisma.user.findUnique({
      where: { id: pending.user.id },
      include: { studentProfile: true },
    })
    expect(saved).toMatchObject({ status: 'ACTIVE', studentProfile: { rosterMemberId: null } })

    const audit = await prisma.auditLog.findFirst({
      where: { resourceId: pending.user.id, action: 'STUDENT_REVIEW_APPROVED' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.nextData).toMatchObject({ approvalMode: 'DIRECT_ADMIN_APPROVAL', rosterMemberId: null })
  })

  it('rejects a pending student through the dedicated audited workflow', async () => {
    const university = await createUniversity('review-reject')
    const admin = await createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university, label: 'review-reject-admin' })
    const pending = await createPendingStudent({ university, label: 'review-reject-student' })

    const response = await request(app)
      .post(`/api/memberships/students/${pending.user.id}/reject`)
      .set(bearer(admin.token))
      .set('Idempotency-Key', idempotencyKey('reject-review'))
      .send({ reason: 'Enrollment could not be confirmed' })

    expect(response.status).toBe(200)
    expect(response.body.user.status).toBe('REJECTED')
    expect(await prisma.auditLog.count({ where: { resourceId: pending.user.id, action: 'STUDENT_REVIEW_REJECTED' } })).toBe(1)
  })
})

describe('duplicate-sensitive concurrency', () => {
  it('keeps event capacity atomic and places the second student on the waitlist', async () => {
    const university = await createUniversity('capacity')
    const [studentA, studentB] = await Promise.all([
      createAuthenticatedUser({ university, label: 'capacity-a' }),
      createAuthenticatedUser({ university, label: 'capacity-b' }),
    ])
    const event = await createContent({ university, type: 'EVENT', capacity: 1, label: 'capacity-one' })

    const responses = await Promise.all([studentA, studentB].map((student, index) => request(app)
      .post(`/api/student/events/${event.id}/registration`)
      .set(bearer(student.token))
      .set('Idempotency-Key', idempotencyKey(`event-${index}`))
      .send({ consentGranted: true })))

    expect(responses.map(response => response.status)).toEqual([201, 201])
    expect(responses.map(response => response.body.status).sort()).toEqual(['CONFIRMED', 'WAITLISTED'])
    const registrations = await prisma.eventRegistration.findMany({ where: { contentId: event.id } })
    expect(registrations.filter(item => item.status === 'CONFIRMED')).toHaveLength(1)
    expect(registrations.filter(item => item.status === 'WAITLISTED')).toHaveLength(1)
    expect(registrations.find(item => item.status === 'WAITLISTED')?.waitlistPosition).toBe(1)
  })

  it('persists only one application under simultaneous duplicate submissions', async () => {
    const university = await createUniversity('application-race')
    const student = await createAuthenticatedUser({ university, label: 'application-race' })
    const opportunity = await createContent({ university, type: 'INTERNSHIP', label: 'application-race' })
    const payload = { cvUrl: 'https://files.example.test/cv.pdf', coverNote: 'Integration test', consentGranted: true }

    const responses = await Promise.all([0, 1].map(index => request(app)
      .post(`/api/student/opportunities/${opportunity.id}/application`)
      .set(bearer(student.token))
      .set('Idempotency-Key', idempotencyKey(`application-${index}`))
      .send(payload)))

    expect(responses.map(response => response.status).sort()).toEqual([201, 409])
    expect(await prisma.application.count({ where: { userId: student.user.id, contentId: opportunity.id } })).toBe(1)
  })

  it('persists only one survey response under simultaneous duplicate submissions', async () => {
    const university = await createUniversity('survey-race')
    const [student, author] = await Promise.all([
      createAuthenticatedUser({ university, label: 'survey-student' }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university, label: 'survey-author' }),
    ])
    const survey = await createSurvey({ university, createdBy: author.user, label: 'survey-race' })

    const responses = await Promise.all([0, 1].map(index => request(app)
      .post(`/api/surveys/${survey.id}/responses`)
      .set(bearer(student.token))
      .set('Idempotency-Key', idempotencyKey(`survey-${index}`))
      .send({ answers: ['Бодит хариулт'] })))

    expect(responses.map(response => response.status).sort()).toEqual([201, 409])
    expect(await prisma.surveyResponse.count({ where: { userId: student.user.id, surveyId: survey.id } })).toBe(1)
  })
})
