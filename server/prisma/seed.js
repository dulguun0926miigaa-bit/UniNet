import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, UserRole } from '@prisma/client'
import { hashPassword } from '../src/utils/password.js'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to seed')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

// These reserved *.example domains are intentionally non-production placeholders.
// Replace them with verified official domains during university onboarding.
const universities = [
  { name: 'Монгол Улсын Их Сургууль', shortName: 'МУИС', slug: 'muis', domain: 'muis.example', officialDomain: 'num.edu.mn' },
  { name: 'Шинжлэх Ухаан Технологийн Их Сургууль', shortName: 'ШУТИС', slug: 'shutis', domain: 'shutis.example', officialDomain: 'must.edu.mn' },
  { name: 'Монгол Улсын Боловсролын Их Сургууль', shortName: 'МУБИС', slug: 'mubis', domain: 'mubis.example', officialDomain: 'msue.edu.mn' },
  { name: 'Анагаахын Шинжлэх Ухааны Үндэсний Их Сургууль', shortName: 'АШУҮИС', slug: 'ashuis', domain: 'ashuis.example', officialDomain: 'mnums.edu.mn' },
  { name: 'Хөдөө Аж Ахуйн Их Сургууль', shortName: 'ХААИС', slug: 'haais', domain: 'haais.example', officialDomain: 'muls.edu.mn' },
]

async function assertSeedDomainOwnership(db) {
  const seedUniversities = await db.university.findMany({
    where: { slug: { in: universities.map(item => item.slug) } },
    select: { id: true, slug: true },
  })
  const universityIdBySlug = new Map(
    seedUniversities.map(university => [university.slug, university.id]),
  )
  const seedDomains = universities.flatMap(item => [item.domain, item.officialDomain])
  const claimedDomains = await db.universityDomain.findMany({
    where: { domain: { in: seedDomains } },
    select: { domain: true, universityId: true },
  })
  const domainOwner = new Map(
    claimedDomains.map(domain => [domain.domain, domain.universityId]),
  )

  for (const item of universities) {
    const expectedUniversityId = universityIdBySlug.get(item.slug)
    for (const domain of [item.domain, item.officialDomain]) {
      const existingOwnerId = domainOwner.get(domain)
      if (!existingOwnerId) continue
      if (!expectedUniversityId || existingOwnerId !== expectedUniversityId) {
        throw new Error(
          `Seed domain ownership conflict: ${domain} already belongs to another university. Resolve the domain assignment before seeding.`,
        )
      }
    }
  }
}

async function ensureSeedDomain(db, { universityId, domain, createData, updateData }) {
  const existing = await db.universityDomain.findUnique({
    where: { domain },
    select: { universityId: true },
  })
  if (existing && existing.universityId !== universityId) {
    throw new Error(
      `Seed domain ownership conflict: ${domain} already belongs to another university. Resolve the domain assignment before seeding.`,
    )
  }

  return db.universityDomain.upsert({
    where: { domain },
    update: updateData,
    create: { universityId, domain, ...createData },
  })
}

async function main() {
  await prisma.$transaction(async db => {
    await assertSeedDomainOwnership(db)

    for (const item of universities) {
      const { domain, officialDomain, ...university } = item
      const savedUniversity = await db.university.upsert({
        where: { slug: university.slug },
        update: {},
        create: { ...university, status: 'ACTIVE' },
      })
      await ensureSeedDomain(db, {
        universityId: savedUniversity.id,
        domain,
        createData: { isPrimary: false, isVerified: false, isActive: true },
        updateData: { isPrimary: false, isVerified: false },
      })
      await ensureSeedDomain(db, {
        universityId: savedUniversity.id,
        domain: officialDomain,
        createData: { isPrimary: true, isVerified: true, isActive: true },
        updateData: {},
      })
    }
  })

  const verifiedDomains = await prisma.universityDomain.findMany({
    where: { isVerified: true, isActive: true },
  })
  const domainUniversity = new Map(
    verifiedDomains.map(item => [item.domain, item.universityId]),
  )
  const unlinkedUsers = await prisma.user.findMany({
    where: { universityId: null, role: 'STUDENT' },
    select: { id: true, normalizedEmail: true },
  })
  for (const user of unlinkedUsers) {
    const universityId = domainUniversity.get(user.normalizedEmail.split('@')[1])
    if (!universityId) continue
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { universityId } }),
      prisma.studentProfile.updateMany({
        where: { userId: user.id },
        data: { universityId },
      }),
    ])
  }

  // Public catalogue data is database-backed and safe to seed in every environment.
  // Upserts keep this operation repeatable and do not create privileged accounts.
  const universityBySlug = new Map(
    (await prisma.university.findMany()).map(university => [university.slug, university]),
  )
  const sampleContent = [
    {
      slug: 'ai-hackathon-2026', universitySlug: 'muis', type: 'EVENT', visibility: 'NETWORK',
      title: 'AI Hackathon 2026', category: 'Технологи',
      shortDescription: '48 цагийн турш бодит асуудлыг хиймэл оюун ухаан ашиглан шийдэх оюутны тэмцээн.',
      description: 'UniNet сүлжээний оюутнуудад нээлттэй AI hackathon.',
      location: 'МУИС, Номын сан 502', mode: 'On-site', startsAt: new Date('2026-08-15T01:00:00.000Z'),
      deadlineAt: new Date('2026-08-10T15:59:59.000Z'), capacity: 120,
      details: { time: '09:00', popular: 98 },
    },
    {
      slug: 'medical-research-seminar-2026', universitySlug: 'ashuis', type: 'EVENT', visibility: 'PUBLIC',
      title: 'Medical Research Seminar', category: 'Эрүүл мэнд',
      shortDescription: 'Анагаахын судалгааны шинэ арга зүйн нээлттэй семинар.',
      description: 'Судлаач, оюутнуудад зориулсан хосолсон хэлбэрийн семинар.',
      location: 'АШУҮИС, Их танхим', mode: 'Hybrid', startsAt: new Date('2026-08-20T06:00:00.000Z'),
      deadlineAt: new Date('2026-08-18T15:59:59.000Z'), capacity: 80,
    },
    {
      slug: 'frontend-developer-internship-2026', universitySlug: 'shutis', type: 'INTERNSHIP', visibility: 'NETWORK',
      title: 'Frontend Developer Internship', category: 'Программ хангамж',
      shortDescription: 'React хөгжүүлэлтийн гурван сарын дадлага.',
      description: 'Бүтээгдэхүүний багтай хамтран бодит төсөл дээр ажиллах дадлагын хөтөлбөр.',
      organization: 'Tech Solutions ХХК', location: 'Улаанбаатар', mode: 'Hybrid',
      deadlineAt: new Date('2026-08-12T15:59:59.000Z'),
      details: { paid: true, compensation: '1,200,000₮', duration: '3 сар', requirements: ['React-ийн суурь мэдлэг', 'Git ашиглах чадвар'] },
    },
    {
      slug: 'junior-software-engineer-2026', universitySlug: 'muis', type: 'JOB', visibility: 'PUBLIC',
      title: 'Junior Software Engineer', category: 'Software Engineering',
      shortDescription: 'Шинэ төгсөгч болон төгсөх курсын оюутанд зориулсан ажлын байр.',
      description: 'Mentorship бүхий junior хөгжүүлэгчийн нээлттэй ажлын байр.',
      organization: 'Digital Finance ХХК', location: 'Улаанбаатар', mode: 'Hybrid',
      deadlineAt: new Date('2026-08-30T15:59:59.000Z'), details: { employmentType: 'Full-time', salary: '2.5–3.2 сая ₮' },
    },
    {
      slug: 'mongolian-nlp-research-2026', universitySlug: 'muis', type: 'RESEARCH', visibility: 'NETWORK',
      title: 'Монгол хэлний NLP судалгааны баг', category: 'AI',
      shortDescription: 'Монгол хэлний өгөгдөл, хэлний загварын судалгаанд оюутан хамруулна.',
      description: 'NLP судалгааны багийн өгөгдөл бэлтгэх болон model evaluation ажилд оролцоно.',
      location: 'МУИС', deadlineAt: new Date('2026-09-01T15:59:59.000Z'),
      details: { field: 'Natural Language Processing', researchTeam: 'Машин оюуны лаборатори', studentLevel: '2–4 курс' },
    },
    {
      slug: 'uninet-service-update-2026', universitySlug: null, type: 'ANNOUNCEMENT', visibility: 'PUBLIC',
      title: 'UniNet үйлчилгээний шинэчлэл', category: 'Систем',
      shortDescription: 'Сүлжээний хайлт болон мэдэгдлийн үйлчилгээ шинэчлэгдлээ.',
      description: 'UniNet-ийн контент хайлт, мэдэгдлийн урсгал болон dashboard өгөгдөл database-тай холбогдлоо.',
      details: { important: false, pinned: true },
    },
  ]
  for (const item of sampleContent) {
    const { universitySlug, ...content } = item
    const universityId = universitySlug ? universityBySlug.get(universitySlug)?.id : null
    const seedData = /** @type {any} */ ({ ...content, universityId, status: 'PUBLISHED' })
    await prisma.content.upsert({
      where: { slug: content.slug },
      update: {},
      create: { ...seedData, publishedAt: new Date() },
    })
  }

  const muis = universityBySlug.get('muis')
  const partnerUniversities = ['shutis', 'ashuis', 'haais'].map(slug => universityBySlug.get(slug)).filter(Boolean)
  if (muis) {
    for (const partner of partnerUniversities) {
      await prisma.partnership.upsert({
        where: { requesterUniversityId_partnerUniversityId: { requesterUniversityId: muis.id, partnerUniversityId: partner.id } },
        update: {},
        create: {
          requesterUniversityId: muis.id,
          partnerUniversityId: partner.id,
          status: 'ACTIVE',
          activatedAt: new Date(),
        },
      })
    }
  }

  if (process.env.SEED_DEMO_USERS === 'true') {
    const requiredDemoVariables = [
      'SEED_DEMO_EMAIL',
      'SEED_DEMO_PASSWORD',
      'SEED_DEMO_FIRST_NAME',
      'SEED_DEMO_LAST_NAME',
      'SEED_DEMO_UNIVERSITY_SLUG',
      'SEED_DEMO_MAJOR',
    ]
    const missingVariables = requiredDemoVariables.filter(key => !process.env[key]?.trim())
    if (missingVariables.length) {
      throw new Error(`Missing demo seed variables: ${missingVariables.join(', ')}`)
    }
    const demo = {
      email: process.env.SEED_DEMO_EMAIL.trim().toLowerCase(),
      firstName: process.env.SEED_DEMO_FIRST_NAME.trim(),
      lastName: process.env.SEED_DEMO_LAST_NAME.trim(),
      universitySlug: process.env.SEED_DEMO_UNIVERSITY_SLUG.trim(),
      major: process.env.SEED_DEMO_MAJOR.trim(),
    }
    const university = await prisma.university.findUnique({
      where: { slug: demo.universitySlug },
    })
    if (!university) {
      throw new Error(`Demo university slug not found: ${demo.universitySlug}`)
    }
    const passwordHash = await hashPassword(process.env.SEED_DEMO_PASSWORD)
    await prisma.universityMember.upsert({
      where: {
        universityId_normalizedEmail: {
          universityId: university.id,
          normalizedEmail: demo.email,
        },
      },
      update: { enrollmentStatus: 'ACTIVE' },
      create: {
        universityId: university.id,
        email: demo.email,
        normalizedEmail: demo.email,
        firstName: demo.firstName,
        lastName: demo.lastName,
        memberType: 'STUDENT',
        enrollmentStatus: 'ACTIVE',
        major: demo.major,
      },
    })
    await prisma.user.upsert({
      where: { email: demo.email },
      update: {},
      create: {
        email: demo.email,
        normalizedEmail: demo.email,
        passwordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        universityId: university.id,
        studentProfile: {
          create: {
            universityId: university.id,
            firstName: demo.firstName,
            lastName: demo.lastName,
            major: demo.major,
          },
        },
      },
    })
  }

  if (process.env.SEED_ROLE_USERS === 'true') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SEED_ROLE_USERS is for local/demo environments only')
    }
    if (!process.env.SEED_ROLE_PASSWORD?.trim()) {
      throw new Error('SEED_ROLE_PASSWORD is required when SEED_ROLE_USERS=true')
    }

    const passwordHash = await hashPassword(process.env.SEED_ROLE_PASSWORD)
    const roleUsers = []
    for (const universityConfig of universities) {
      const university = universityBySlug.get(universityConfig.slug)
      if (!university) throw new Error(`Role seed university not found: ${universityConfig.slug}`)
      roleUsers.push(
        {
          email: `student@${universityConfig.officialDomain}`,
          role: UserRole.STUDENT,
          universityId: university.id,
          memberType: 'STUDENT',
          firstName: 'Анужин',
          lastName: `${university.shortName} Student`,
          studentId: `${university.slug.toUpperCase()}-STUDENT-DEMO`,
          employeeCode: null,
          department: 'Мэдээллийн технологийн сургууль',
          major: 'Програм хангамж',
          enrollmentYear: new Date().getUTCFullYear() - 2,
          graduationYear: new Date().getUTCFullYear() + 2,
          jobTitle: null,
          permissions: null,
        },
        {
          email: `staff@${universityConfig.officialDomain}`,
          role: UserRole.STAFF,
          universityId: university.id,
          memberType: 'STAFF',
          firstName: 'Тэмүүлэн',
          lastName: `${university.shortName} Staff`,
          studentId: null,
          employeeCode: `${university.slug.toUpperCase()}-STAFF-DEMO`,
          department: 'Карьер хөгжлийн төв',
          major: null,
          enrollmentYear: null,
          graduationYear: null,
          jobTitle: 'Staff',
          permissions: {
            canCreateContent: true,
            canPublish: false,
            canManageRegistrations: true,
            canManageApplications: true,
            canManageSurveys: true,
            canViewReports: true,
          },
        },
        {
          email: `admin@${universityConfig.officialDomain}`,
          role: UserRole.UNIVERSITY_ADMIN,
          universityId: university.id,
          memberType: 'UNIVERSITY_ADMIN',
          firstName: 'Саруул',
          lastName: `${university.shortName} Admin`,
          studentId: null,
          employeeCode: `${university.slug.toUpperCase()}-ADMIN-DEMO`,
          department: 'Дижитал шилжилтийн алба',
          major: null,
          enrollmentYear: null,
          graduationYear: null,
          jobTitle: 'University Admin',
          permissions: {
            canCreateContent: true,
            canPublish: true,
            canManageRegistrations: true,
            canManageApplications: true,
            canManageSurveys: true,
            canViewReports: true,
          },
        },
      )
    }

    const configuredSuperAdminEmail = (process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@uninet.local').trim().toLowerCase()
    roleUsers.push({
      email: configuredSuperAdminEmail,
      role: UserRole.PLATFORM_SUPER_ADMIN,
      universityId: null,
      memberType: null,
      firstName: 'Бат-Эрдэнэ',
      lastName: 'Super Admin',
      studentId: null,
      employeeCode: null,
      department: null,
      major: null,
      enrollmentYear: null,
      graduationYear: null,
      jobTitle: null,
      permissions: null,
    })

    await prisma.$transaction(async db => {
      for (const account of roleUsers) {
        const normalizedEmail = account.email.toLowerCase()
        const existing = await db.user.findUnique({
          where: { normalizedEmail },
          include: { staffProfile: true },
        })
        if (existing && (existing.role !== account.role || existing.universityId !== account.universityId)) {
          throw new Error(`Role seed conflict for ${normalizedEmail}`)
        }

        const user = existing
          ? await db.user.update({
              where: { id: existing.id },
              data: {
                passwordHash,
                status: 'ACTIVE',
                emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
              },
            })
          : await db.user.create({
              data: {
                email: normalizedEmail,
                normalizedEmail,
                passwordHash,
                role: account.role,
                status: 'ACTIVE',
                universityId: account.universityId,
                emailVerifiedAt: new Date(),
              },
            })

        await db.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        })

        if (account.universityId) {
          const rosterMember = await db.universityMember.upsert({
            where: {
              universityId_normalizedEmail: {
                universityId: account.universityId,
                normalizedEmail,
              },
            },
            update: {
              email: normalizedEmail,
              studentId: account.studentId,
              employeeCode: account.employeeCode,
              firstName: account.firstName,
              lastName: account.lastName,
              memberType: account.memberType,
              enrollmentStatus: 'ACTIVE',
              department: account.department,
              major: account.major,
              graduationYear: account.graduationYear,
            },
            create: {
              universityId: account.universityId,
              email: normalizedEmail,
              normalizedEmail,
              studentId: account.studentId,
              employeeCode: account.employeeCode,
              firstName: account.firstName,
              lastName: account.lastName,
              memberType: account.memberType,
              enrollmentStatus: 'ACTIVE',
              department: account.department,
              major: account.major,
              graduationYear: account.graduationYear,
            },
          })

          if (account.role === UserRole.STUDENT) {
            await db.studentProfile.upsert({
              where: { userId: user.id },
              update: {
                universityId: account.universityId,
                rosterMemberId: rosterMember.id,
                studentId: account.studentId,
                firstName: account.firstName,
                lastName: account.lastName,
                department: account.department,
                major: account.major,
                enrollmentYear: account.enrollmentYear,
                graduationYear: account.graduationYear,
              },
              create: {
                userId: user.id,
                universityId: account.universityId,
                rosterMemberId: rosterMember.id,
                studentId: account.studentId,
                firstName: account.firstName,
                lastName: account.lastName,
                department: account.department,
                major: account.major,
                enrollmentYear: account.enrollmentYear,
                graduationYear: account.graduationYear,
              },
            })
          } else if (account.permissions) {
            await db.staffProfile.upsert({
              where: { userId: user.id },
              update: {
                universityId: account.universityId,
                employeeCode: account.employeeCode,
                firstName: account.firstName,
                lastName: account.lastName,
                department: account.department,
                jobTitle: account.jobTitle,
                ...account.permissions,
              },
              create: {
                userId: user.id,
                universityId: account.universityId,
                employeeCode: account.employeeCode,
                firstName: account.firstName,
                lastName: account.lastName,
                department: account.department,
                jobTitle: account.jobTitle,
                ...account.permissions,
              },
            })
          }
        }
      }

    }, {
      maxWait: 10000,
      timeout: 60000,
    })

    // Deterministic final-MVP demo data. These records are creator-scoped to the
    // seeded МУИС Staff account so registration/application management pages are
    // immediately demonstrable after `npm run db:demo-reset` or `npm run db:seed`.
    const numUniversity = universityBySlug.get('muis')
    const numStaff = await prisma.user.findUnique({ where: { normalizedEmail: 'staff@num.edu.mn' } })
    const numStudent = await prisma.user.findUnique({ where: { normalizedEmail: 'student@num.edu.mn' } })
    if (numUniversity && numStaff && numStudent) {
      const demoEvent = await prisma.content.upsert({
        where: { slug: 'final-mvp-num-event' },
        update: {
          universityId: numUniversity.id,
          createdById: numStaff.id,
          status: 'PUBLISHED',
          visibility: 'PRIVATE',
          startsAt: new Date('2026-08-05T02:00:00.000Z'),
          capacity: 2,
        },
        create: {
          slug: 'final-mvp-num-event', universityId: numUniversity.id, createdById: numStaff.id,
          type: 'EVENT', visibility: 'PRIVATE', status: 'PUBLISHED',
          title: 'Final MVP Backend Demo Event',
          shortDescription: 'Registration, attendance, waitlist, notification болон audit demo.',
          description: 'Багшид frontend-ээр backend workflow харуулах тогтсон demo арга хэмжээ.',
          category: 'Demo', location: 'МУИС · 502', mode: 'On-site',
          startsAt: new Date('2026-08-05T02:00:00.000Z'),
          deadlineAt: new Date('2026-08-04T15:59:59.000Z'), capacity: 2, publishedAt: new Date(),
        },
      })
      const demoOpportunity = await prisma.content.upsert({
        where: { slug: 'final-mvp-num-internship' },
        update: { universityId: numUniversity.id, createdById: numStaff.id, status: 'PUBLISHED', visibility: 'PRIVATE' },
        create: {
          slug: 'final-mvp-num-internship', universityId: numUniversity.id, createdById: numStaff.id,
          type: 'INTERNSHIP', visibility: 'PRIVATE', status: 'PUBLISHED',
          title: 'Final MVP Full-stack Internship',
          shortDescription: 'Application state machine, CV, notification болон immutable history demo.',
          description: 'Багшид өргөдлийн backend workflow харуулах тогтсон demo дадлага.',
          category: 'Software Engineering', organization: 'UniNet Demo Lab', location: 'Улаанбаатар', mode: 'Hybrid',
          deadlineAt: new Date('2026-08-20T15:59:59.000Z'), publishedAt: new Date(),
        },
      })
      await prisma.eventRegistration.upsert({
        where: { userId_contentId: { userId: numStudent.id, contentId: demoEvent.id } },
        update: { status: 'CONFIRMED', attendedAt: null, cancelledAt: null, waitlistPosition: null, consentGranted: true },
        create: {
          userId: numStudent.id, contentId: demoEvent.id, status: 'CONFIRMED',
          registrationCode: 'NUM-FINAL-MVP-EVENT-001', consentGranted: true,
        },
      })
      const application = await prisma.application.upsert({
        where: { userId_contentId: { userId: numStudent.id, contentId: demoOpportunity.id } },
        update: { status: 'SUBMITTED', reviewedAt: null, withdrawnAt: null, coverNote: 'Final MVP demo application', consentGranted: true },
        create: {
          userId: numStudent.id, contentId: demoOpportunity.id, status: 'SUBMITTED',
          cvUrl: 'https://example.com/demo-cv.pdf', coverNote: 'Final MVP demo application', consentGranted: true,
        },
      })
      const applicationHistoryCount = await prisma.applicationStatusHistory.count({ where: { applicationId: application.id } })
      if (!applicationHistoryCount) {
        await prisma.applicationStatusHistory.create({
          data: { applicationId: application.id, actorId: numStudent.id, toStatus: 'SUBMITTED', reason: 'Deterministic final MVP seed' },
        })
      }
      let demoSurvey = await prisma.survey.findFirst({ where: { createdById: numStaff.id, title: 'Final MVP Student Feedback' } })
      if (!demoSurvey) {
        demoSurvey = await prisma.survey.create({
          data: {
            universityId: numUniversity.id, createdById: numStaff.id,
            title: 'Final MVP Student Feedback', description: 'Survey authorization, response болон report demo.',
            visibility: 'PRIVATE', status: 'PUBLISHED', publishedAt: new Date(),
            questions: [
              { id: 'q1', title: 'UniNet MVP хэр ойлгомжтой байна вэ?', type: 'RATING', required: true, options: [] },
              { id: 'q2', title: 'Санал хүсэлт', type: 'PARAGRAPH', required: false, options: [] },
            ],
          },
        })
      } else {
        await prisma.survey.update({ where: { id: demoSurvey.id }, data: { status: 'PUBLISHED', visibility: 'PRIVATE', publishedAt: demoSurvey.publishedAt ?? new Date() } })
      }
      for (const notification of [
        { userId: numStudent.id, universityId: numUniversity.id, contentId: demoEvent.id, type: 'DEMO_READY', title: 'Final MVP demo бэлэн', description: 'Арга хэмжээний бүртгэл болон ирцийн workflow-г шалгана уу.', actionUrl: '/student/registrations' },
        { userId: numStaff.id, universityId: numUniversity.id, contentId: demoOpportunity.id, type: 'DEMO_READY', title: 'Өргөдлийн demo бэлэн', description: 'Application management хэсэгт SUBMITTED өргөдөл байна.', actionUrl: '/staff/applications' },
      ]) {
        const existingNotification = await prisma.notification.findFirst({
          where: { userId: notification.userId, type: notification.type, title: notification.title },
        })
        if (!existingNotification) await prisma.notification.create({ data: notification })
      }
    }

    console.info('Local role accounts seeded for all five universities:')
    for (const item of universities) {
      console.info(`  ${item.shortName}: admin@${item.officialDomain}, staff@${item.officialDomain}, student@${item.officialDomain}`)
    }
    console.info(`  Platform: ${configuredSuperAdminEmail}`)
  }

  // Prefer the explicitly requested production address; local/demo databases
  // use the repository's deterministic .edu.mn Staff identity.
  const requestedGoogleStaff = await prisma.user.findUnique({ where: { normalizedEmail: 'staff@num.edu.com' } })
    ?? (process.env.NODE_ENV !== 'production'
      ? await prisma.user.findUnique({ where: { normalizedEmail: 'staff@num.edu.mn' } })
      : null)
  if (requestedGoogleStaff?.role === UserRole.STAFF) {
    await prisma.user.updateMany({
      where: {
        id: { not: requestedGoogleStaff.id },
        gmail: 'batzogsoolb@gmail.com',
      },
      data: { gmail: null },
    })
    await prisma.user.update({
      where: { id: requestedGoogleStaff.id },
      data: { gmail: 'batzogsoolb@gmail.com' },
    })
  }
}

main()
  .then(() => console.info('UniNet seed completed'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
