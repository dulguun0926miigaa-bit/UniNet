import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { hashEventTicket } from '../src/tickets/event-ticket.js'
import {
  assertDedicatedTestDatabase,
  cleanupIntegrationFixtures,
  createAuthenticatedUser,
  createContent,
  createUniversity,
} from './integration-fixtures.js'

const bearer = token => ({ Authorization: `Bearer ${token}` })
const key = label => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`

beforeAll(async () => {
  assertDedicatedTestDatabase()
  await prisma.$connect()
})

afterAll(async () => {
  await cleanupIntegrationFixtures()
  await prisma.$disconnect()
})

describe('Phase 5D registration and application management', () => {
  it('keeps Staff registration reads creator-scoped and records manual attendance', async () => {
    const [university, foreignUniversity] = await Promise.all([
      createUniversity('workflow-registration'),
      createUniversity('workflow-registration-foreign'),
    ])
    const [owner, otherStaff, admin, foreignAdmin, student] = await Promise.all([
      createAuthenticatedUser({ role: 'STAFF', university, label: 'event-owner', permissions: { canManageRegistrations: true } }),
      createAuthenticatedUser({ role: 'STAFF', university, label: 'event-other', permissions: { canManageRegistrations: true } }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university, label: 'event-admin' }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university: foreignUniversity, label: 'event-foreign-admin' }),
      createAuthenticatedUser({ university, label: 'event-student' }),
    ])
    const event = await createContent({ university, createdBy: owner.user, type: 'EVENT', capacity: 1, label: 'managed-event' })
    const registration = await prisma.eventRegistration.create({
      data: {
        userId: student.user.id,
        contentId: event.id,
        status: 'CONFIRMED',
        registrationCode: `IT-${Math.random().toString(36).slice(2)}`,
      },
    })

    const ownerList = await request(app).get('/api/operations/registrations?status=REGISTERED').set(bearer(owner.token)).expect(200)
    expect(ownerList.body.items.map(item => item.id)).toContain(registration.id)
    expect(ownerList.body.items[0].status).toBe('REGISTERED')

    const otherList = await request(app).get('/api/operations/registrations').set(bearer(otherStaff.token)).expect(200)
    expect(otherList.body.items.map(item => item.id)).not.toContain(registration.id)

    await request(app).get(`/api/operations/registrations/${registration.id}`).set(bearer(foreignAdmin.token)).expect(403)
    await request(app).get(`/api/operations/registrations/${registration.id}`).set(bearer(admin.token)).expect(200)

    const attended = await request(app)
      .patch(`/api/operations/registrations/${registration.id}/attendance`)
      .set(bearer(owner.token))
      .set('Idempotency-Key', key('attendance'))
      .send({ attended: true })
      .expect(200)
    expect(attended.body.registration.status).toBe('ATTENDED')
    expect(await prisma.auditLog.count({ where: { resourceId: registration.id, action: 'EVENT_ATTENDANCE_RECORDED' } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: student.user.id, type: 'EVENT_ATTENDANCE' } })).toBe(1)
  })

  it('allows only the event-owner Staff to scan a DB-hashed paid QR exactly once', async () => {
    const university = await createUniversity('workflow-qr-approval')
    const [owner, otherStaff, student] = await Promise.all([
      createAuthenticatedUser({ role: 'STAFF', university, label: 'qr-event-owner', permissions: { canCreateContent: true, canManageRegistrations: true } }),
      createAuthenticatedUser({ role: 'STAFF', university, label: 'qr-other-staff', permissions: { canManageRegistrations: true } }),
      createAuthenticatedUser({ university, label: 'qr-student' }),
    ])
    const freeEvent = await createContent({ university, createdBy: owner.user, type: 'EVENT', label: 'free-no-qr-event' })
    const freeRegistration = await prisma.eventRegistration.create({
      data: {
        userId: student.user.id,
        contentId: freeEvent.id,
        status: 'CONFIRMED',
        registrationCode: `FREE-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`,
      },
    })
    const freeTicket = await request(app)
      .get(`/api/student/events/${freeEvent.id}/ticket`)
      .set(bearer(student.token))
      .expect(409)
    expect(freeTicket.body.error.code).toBe('EVENT_PAID_TICKET_REQUIRED')

    const event = await createContent({ university, createdBy: owner.user, type: 'EVENT', label: 'single-paid-qr-event' })
    await prisma.content.update({
      where: { id: event.id },
      data: { pricingType: 'PAID', priceAmount: 25_000, currency: 'MNT' },
    })
    const registration = await prisma.eventRegistration.create({
      data: {
        userId: student.user.id,
        contentId: event.id,
        status: 'CONFIRMED',
        registrationCode: `QR-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`,
      },
    })
    await prisma.payment.create({
      data: {
        userId: student.user.id,
        contentId: event.id,
        registrationId: registration.id,
        provider: 'STRIPE',
        amount: 25_000,
        currency: 'MNT',
        status: 'PAID',
        paidAt: new Date(),
      },
    })
    const ticketResponse = await request(app)
      .get(`/api/student/events/${event.id}/ticket`)
      .set(bearer(student.token))
      .expect(200)
    const ticket = ticketResponse.body.ticket.token
    const repeatedTicketResponse = await request(app)
      .get(`/api/student/events/${event.id}/ticket`)
      .set(bearer(student.token))
      .expect(200)
    expect(repeatedTicketResponse.body.ticket.token).toBe(ticket)
    const persistedTicket = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: registration.id } })
    expect(persistedTicket.ticketTokenHash).toBe(hashEventTicket(ticket))
    expect(persistedTicket).not.toHaveProperty('ticketToken')

    const randomQr = await request(app)
      .post(`/api/operations/events/${event.id}/attendance/scan`)
      .set(bearer(owner.token))
      .set('Idempotency-Key', key('random-qr'))
      .send({ ticket: `uninet_evt_v1.${'x'.repeat(43)}` })
      .expect(422)
    expect(randomQr.body.error.code).toBe('EVENT_TICKET_NOT_RECOGNIZED')

    const denied = await request(app)
      .post(`/api/operations/events/${event.id}/attendance/scan`)
      .set(bearer(otherStaff.token))
      .set('Idempotency-Key', key('other-staff-scan'))
      .send({ ticket })
      .expect(403)
    expect(denied.body.error.code).toBe('RESOURCE_OWNERSHIP_DENIED')

    const approved = await request(app)
      .post(`/api/operations/events/${event.id}/attendance/scan`)
      .set(bearer(owner.token))
      .set('Idempotency-Key', key('first-qr-scan'))
      .send({ ticket })
      .expect(200)
    expect(approved.body.attendance).toMatchObject({
      registrationId: registration.id,
      status: 'ATTENDED',
      approvalStatus: 'APPROVED',
      alreadyRecorded: false,
    })

    const duplicate = await request(app)
      .post(`/api/operations/events/${event.id}/attendance/scan`)
      .set(bearer(owner.token))
      .set('Idempotency-Key', key('repeat-qr-scan'))
      .send({ ticket })
      .expect(200)
    expect(duplicate.body.attendance).toMatchObject({
      registrationId: registration.id,
      status: 'ATTENDED',
      approvalStatus: 'ALREADY_APPROVED',
      alreadyRecorded: true,
    })
    expect(await prisma.auditLog.count({ where: { resourceId: registration.id, action: 'EVENT_ATTENDANCE_RECORDED' } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: student.user.id, contentId: event.id, type: 'EVENT_ATTENDANCE' } })).toBe(1)
    expect(freeRegistration.status).toBe('CONFIRMED')
  })

  it('enforces Staff application ownership and the review-shortlist-decision state machine', async () => {
    const university = await createUniversity('workflow-application')
    const [owner, otherStaff, admin, student] = await Promise.all([
      createAuthenticatedUser({ role: 'STAFF', university, label: 'application-owner', permissions: { canManageApplications: true } }),
      createAuthenticatedUser({ role: 'STAFF', university, label: 'application-other', permissions: { canManageApplications: true } }),
      createAuthenticatedUser({ role: 'UNIVERSITY_ADMIN', university, label: 'application-admin' }),
      createAuthenticatedUser({ university, label: 'application-student' }),
    ])
    const opportunity = await createContent({ university, createdBy: owner.user, type: 'INTERNSHIP', label: 'managed-application' })
    const application = await prisma.application.create({
      data: { userId: student.user.id, contentId: opportunity.id, status: 'SUBMITTED', cvUrl: 'https://example.test/cv.pdf' },
    })
    await prisma.applicationStatusHistory.create({
      data: { applicationId: application.id, actorId: student.user.id, toStatus: 'SUBMITTED', reason: 'Initial submission' },
    })

    const ownerList = await request(app).get('/api/operations/applications?status=SUBMITTED').set(bearer(owner.token)).expect(200)
    expect(ownerList.body.items.map(item => item.id)).toContain(application.id)
    const otherList = await request(app).get('/api/operations/applications').set(bearer(otherStaff.token)).expect(200)
    expect(otherList.body.items.map(item => item.id)).not.toContain(application.id)
    await request(app).get(`/api/operations/applications/${application.id}`).set(bearer(admin.token)).expect(200)

    const invalid = await request(app)
      .patch(`/api/operations/applications/${application.id}/status`)
      .set(bearer(owner.token))
      .set('Idempotency-Key', key('invalid-accept'))
      .send({ status: 'ACCEPTED' })
    expect(invalid.status).toBe(409)
    expect(invalid.body.error.code).toBe('APPLICATION_STATUS_TRANSITION_INVALID')

    for (const status of ['UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED']) {
      const changed = await request(app)
        .patch(`/api/operations/applications/${application.id}/status`)
        .set(bearer(owner.token))
        .set('Idempotency-Key', key(status.toLowerCase()))
        .send({ status, reason: `Moved to ${status}` })
      expect(changed.status).toBe(200)
      expect(changed.body.application.status).toBe(status)
    }

    const detail = await request(app).get(`/api/operations/applications/${application.id}`).set(bearer(owner.token)).expect(200)
    expect(detail.body.application.history.map(item => item.toStatus)).toEqual(['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED'])
    expect(await prisma.auditLog.count({ where: { resourceId: application.id, action: { startsWith: 'APPLICATION_' } } })).toBe(3)
    expect(await prisma.notification.count({ where: { userId: student.user.id, type: 'APPLICATION_STATUS' } })).toBe(3)
  })
})
