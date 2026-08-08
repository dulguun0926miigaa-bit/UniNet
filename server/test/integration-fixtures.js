import { randomBytes, randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma.js'
import { signAccessToken } from '../src/utils/tokens.js'

const runId = `it-${Date.now()}-${randomBytes(3).toString('hex')}`
const tracked = {
  contentIds: [],
  surveyIds: [],
  userIds: [],
  rosterIds: [],
  partnershipIds: [],
  universityIds: [],
}

export function integrationIdentity(label) {
  return `${runId}-${label}-${randomBytes(3).toString('hex')}`
}

export async function createUniversity(label) {
  const identity = integrationIdentity(label)
  const university = await prisma.university.create({
    data: {
      name: `Integration ${identity}`,
      shortName: `IT-${randomBytes(4).toString('hex')}`,
      slug: identity,
      status: 'ACTIVE',
    },
  })
  tracked.universityIds.push(university.id)
  return university
}

export async function createAuthenticatedUser({ role = 'STUDENT', university = null, label = role.toLowerCase(), permissions = {} } = {}) {
  const identity = integrationIdentity(label)
  const email = `${identity}@integration.test`
  const profile = role === 'STUDENT'
    ? {
        studentProfile: {
          create: {
            universityId: university?.id,
            firstName: 'Integration',
            lastName: label,
            major: 'Quality Engineering',
          },
        },
      }
    : role === 'STAFF'
      ? {
          staffProfile: {
            create: {
              universityId: university.id,
              firstName: 'Integration',
              lastName: label,
              canCreateContent: Boolean(permissions.canCreateContent),
              canPublish: Boolean(permissions.canPublish),
              canManageRegistrations: Boolean(permissions.canManageRegistrations),
              canManageApplications: Boolean(permissions.canManageApplications),
              canManageSurveys: Boolean(permissions.canManageSurveys),
              canViewReports: Boolean(permissions.canViewReports),
            },
          },
        }
      : {}
  const user = await prisma.user.create({
    data: {
      email,
      normalizedEmail: email,
      passwordHash: 'integration-test-password-hash-not-used',
      role,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      universityId: university?.id,
      ...profile,
    },
  })
  tracked.userIds.push(user.id)

  const sessionId = randomUUID()
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      familyId: sessionId,
      refreshTokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      userAgent: 'vitest-integration',
      ipAddress: '127.0.0.1',
    },
  })
  return { user, token: signAccessToken(user, sessionId) }
}

export async function createPendingStudent({ university, label = 'pending-student', rosterStatus = 'ACTIVE' } = {}) {
  const identity = integrationIdentity(label)
  const email = `${identity}@integration.test`
  const studentId = `SID-${randomBytes(5).toString('hex')}`
  const roster = await prisma.universityMember.create({
    data: {
      universityId: university.id,
      email,
      normalizedEmail: email,
      studentId,
      firstName: 'Pending',
      lastName: label,
      memberType: 'STUDENT',
      enrollmentStatus: rosterStatus,
      major: 'Quality Engineering',
    },
  })
  tracked.rosterIds.push(roster.id)
  const user = await prisma.user.create({
    data: {
      universityId: university.id,
      email,
      normalizedEmail: email,
      passwordHash: 'integration-test-password-hash-not-used',
      role: 'STUDENT',
      status: 'PENDING_REVIEW',
      emailVerifiedAt: new Date(),
      studentProfile: {
        create: {
          universityId: university.id,
          studentId,
          firstName: 'Pending',
          lastName: label,
          major: 'Quality Engineering',
        },
      },
    },
  })
  tracked.userIds.push(user.id)
  return { user, roster }
}

export async function createContent({ university = null, createdBy = null, type = 'EVENT', capacity = null, visibility = 'PUBLIC', label = type.toLowerCase() } = {}) {
  const identity = integrationIdentity(label)
  const content = await prisma.content.create({
    data: {
      slug: identity,
      universityId: university?.id,
      createdById: createdBy?.id,
      type,
      visibility,
      status: 'PUBLISHED',
      title: `Integration ${label}`,
      shortDescription: 'Integration fixture content',
      description: 'Isolated integration fixture for authorization and concurrency tests.',
      capacity,
      startsAt: type === 'EVENT' ? new Date(Date.now() + 7 * 86_400_000) : null,
      deadlineAt: type !== 'EVENT' ? new Date(Date.now() + 7 * 86_400_000) : null,
      publishedAt: new Date(),
    },
  })
  tracked.contentIds.push(content.id)
  return content
}

export async function createSurvey({
  university = null,
  createdBy,
  label = 'survey',
  visibility = university ? 'PRIVATE' : 'NETWORK',
  status = 'PUBLISHED',
} = {}) {
  const survey = await prisma.survey.create({
    data: {
      universityId: university?.id,
      createdById: createdBy.id,
      title: `Integration ${integrationIdentity(label)}`,
      description: 'Concurrency fixture survey',
      visibility,
      status,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
      questions: [{ id: 'q1', title: 'Туршилтын хариулт', type: 'SHORT_TEXT', required: true, options: [] }],
    },
  })
  tracked.surveyIds.push(survey.id)
  return survey
}

export async function createPartnership({ requesterUniversity, partnerUniversity, requestedBy = null, status = 'ACTIVE' }) {
  const partnership = await prisma.partnership.create({
    data: {
      requesterUniversityId: requesterUniversity.id,
      partnerUniversityId: partnerUniversity.id,
      requestedByUserId: requestedBy?.id,
      status,
      activatedAt: status === 'ACTIVE' ? new Date() : null,
    },
  })
  tracked.partnershipIds.push(partnership.id)
  return partnership
}

export async function cleanupIntegrationFixtures() {
  if (tracked.contentIds.length) await prisma.content.deleteMany({ where: { id: { in: tracked.contentIds } } })
  if (tracked.surveyIds.length) await prisma.survey.deleteMany({ where: { id: { in: tracked.surveyIds } } })
  if (tracked.partnershipIds.length) await prisma.partnership.deleteMany({ where: { id: { in: tracked.partnershipIds } } })
  if (tracked.userIds.length) await prisma.user.deleteMany({ where: { id: { in: tracked.userIds } } })
  if (tracked.rosterIds.length) await prisma.universityMember.deleteMany({ where: { id: { in: tracked.rosterIds } } })
  if (tracked.universityIds.length) await prisma.university.deleteMany({ where: { id: { in: tracked.universityIds } } })
}

export function assertDedicatedTestDatabase() {
  const databaseName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '')
  if (!/(test|ci|integration)/i.test(databaseName) && process.env.INTEGRATION_ALLOW_NON_TEST_DATABASE !== 'true') {
    throw new Error(`Refusing integration tests against non-test database "${databaseName}".`)
  }
}
