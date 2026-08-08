import { prisma } from '../lib/prisma.js'

const memberSelect = {
  id: true,
  universityId: true,
  email: true,
  normalizedEmail: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  studentProfile: true,
  staffProfile: true,
}

const invitationSelect = {
  id: true,
  universityId: true,
  email: true,
  normalizedEmail: true,
  role: true,
  employeeCode: true,
  department: true,
  jobTitle: true,
  permissions: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  invitedBy: {
    select: { id: true, email: true, staffProfile: { select: { firstName: true, lastName: true } } },
  },
  acceptedUser: { select: { id: true, email: true, status: true } },
}

const insensitive = /** @type {const} */ ('insensitive')

const invitationWhere = ({ universityId, search, status, role }) => {
  const now = new Date()
  return {
    universityId,
    ...(role ? { role } : {}),
    ...(search ? { normalizedEmail: { contains: search.toLowerCase() } } : {}),
    ...(status === 'PENDING' ? { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } : {}),
    ...(status === 'ACCEPTED' ? { acceptedAt: { not: null } } : {}),
    ...(status === 'REVOKED' ? { acceptedAt: null, revokedAt: { not: null } } : {}),
    ...(status === 'EXPIRED' ? { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } } : {}),
  }
}

const memberWhere = ({ universityId, role, search, status, department }) => ({
  universityId,
  role,
  ...(status ? { status } : {}),
  ...(department ? {
    ...(role === 'STUDENT'
      ? { studentProfile: { is: { department: { contains: department, mode: insensitive } } } }
      : { staffProfile: { is: { department: { contains: department, mode: insensitive } } } }),
  } : {}),
  ...(search ? {
    OR: [
      { normalizedEmail: { contains: search.toLowerCase() } },
      ...(role === 'STUDENT' ? [
        { studentProfile: { is: { firstName: { contains: search, mode: insensitive } } } },
        { studentProfile: { is: { lastName: { contains: search, mode: insensitive } } } },
        { studentProfile: { is: { studentId: { contains: search, mode: insensitive } } } },
      ] : [
        { staffProfile: { is: { firstName: { contains: search, mode: insensitive } } } },
        { staffProfile: { is: { lastName: { contains: search, mode: insensitive } } } },
        { staffProfile: { is: { employeeCode: { contains: search, mode: insensitive } } } },
      ]),
    ],
  } : {}),
})

const invitationStatus = (invitation, now = new Date()) => {
  if (invitation.acceptedAt) return 'ACCEPTED'
  if (invitation.revokedAt) return 'REVOKED'
  if (invitation.expiresAt <= now) return 'EXPIRED'
  return 'PENDING'
}

export const membershipRepository = {
  findUniversity(id) {
    return prisma.university.findUnique({
      where: { id },
      include: { domains: { where: { isActive: true, isVerified: true } } },
    })
  },

  findUserByEmail(normalizedEmail) {
    return prisma.user.findUnique({ where: { normalizedEmail }, select: { id: true } })
  },

  async createInvitation(data, audit) {
    return prisma.$transaction(async tx => {
      const now = new Date()
      await tx.universityInvitation.updateMany({
        where: {
          universityId: data.universityId,
          normalizedEmail: data.normalizedEmail,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      })
      const invitation = await tx.universityInvitation.create({
        data,
        select: invitationSelect,
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId: data.universityId,
          action: 'MEMBERSHIP_INVITATION_CREATED',
          resourceType: 'UniversityInvitation',
          resourceId: invitation.id,
          resourceName: invitation.email,
          nextData: { role: invitation.role, expiresAt: invitation.expiresAt },
          severity: invitation.role === 'UNIVERSITY_ADMIN' ? 'HIGH' : 'MEDIUM',
        },
      })
      return { ...invitation, status: invitationStatus(invitation) }
    })
  },

  async revokeInvitationAfterDeliveryFailure(id) {
    return prisma.universityInvitation.updateMany({
      where: { id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  },

  async listInvitations(input) {
    const where = invitationWhere(input)
    const orderBy = { [input.sortBy]: input.sortOrder }
    const [total, items] = await prisma.$transaction([
      prisma.universityInvitation.count({ where }),
      prisma.universityInvitation.findMany({
        where,
        select: invitationSelect,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ])
    return { total, items: items.map(item => ({ ...item, status: invitationStatus(item) })) }
  },

  async revokeInvitation({ id, universityId, role }, audit) {
    return prisma.$transaction(async tx => {
      const invitation = await tx.universityInvitation.findFirst({
        where: { id, universityId, role },
        select: invitationSelect,
      })
      if (!invitation) return { status: 'notFound' }
      if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
        return { status: 'notPending' }
      }
      const revoked = await tx.universityInvitation.updateMany({
        where: { id, universityId, role, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      })
      if (revoked.count !== 1) return { status: 'notPending' }
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'MEMBERSHIP_INVITATION_REVOKED',
          resourceType: 'UniversityInvitation',
          resourceId: id,
          resourceName: invitation.email,
          previousData: { status: 'PENDING', role: invitation.role },
          nextData: { status: 'REVOKED' },
          severity: 'MEDIUM',
        },
      })
      return { status: 'revoked' }
    })
  },

  async acceptInvitation({ tokenHash, passwordHash, firstName, lastName }) {
    return prisma.$transaction(async tx => {
      const now = new Date()
      const invitation = await tx.universityInvitation.findUnique({
        where: { tokenHash },
        include: { university: true },
      })
      if (
        !invitation
        || invitation.acceptedAt
        || invitation.revokedAt
        || invitation.expiresAt <= now
        || invitation.university.status !== 'ACTIVE'
      ) return { status: 'invalid' }

      const existingUser = await tx.user.findUnique({ where: { normalizedEmail: invitation.normalizedEmail } })
      if (existingUser) return { status: 'emailConflict' }

      const rosterMember = await tx.universityMember.findUnique({
        where: {
          universityId_normalizedEmail: {
            universityId: invitation.universityId,
            normalizedEmail: invitation.normalizedEmail,
          },
        },
      })
      const memberType = invitation.role === 'STAFF' ? 'STAFF' : 'UNIVERSITY_ADMIN'
      if (rosterMember && rosterMember.memberType !== memberType) return { status: 'rosterConflict' }

      const claim = await tx.universityInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      })
      if (claim.count !== 1) return { status: 'invalid' }

      const storedPermissions = invitation.permissions && typeof invitation.permissions === 'object' && !Array.isArray(invitation.permissions)
        ? /** @type {Record<string, unknown>} */ (invitation.permissions)
        : {}
      const permissions = invitation.role === 'UNIVERSITY_ADMIN'
        ? {
            canCreateContent: true,
            canPublish: true,
            canManageRegistrations: true,
            canManageApplications: true,
            canManageSurveys: true,
            canViewReports: true,
          }
        : {
            canCreateContent: storedPermissions.canCreateContent === true,
            canPublish: storedPermissions.canPublish === true,
            canManageRegistrations: storedPermissions.canManageRegistrations === true,
            canManageApplications: storedPermissions.canManageApplications === true,
            canManageSurveys: storedPermissions.canManageSurveys === true,
            canViewReports: storedPermissions.canViewReports === true,
          }
      const user = await tx.user.create({
        data: {
          universityId: invitation.universityId,
          email: invitation.email,
          normalizedEmail: invitation.normalizedEmail,
          passwordHash,
          role: invitation.role,
          status: 'ACTIVE',
          emailVerifiedAt: now,
          staffProfile: {
            create: {
              universityId: invitation.universityId,
              employeeCode: invitation.employeeCode,
              firstName,
              lastName,
              department: invitation.department,
              jobTitle: invitation.jobTitle,
              ...permissions,
            },
          },
        },
        select: memberSelect,
      })

      await tx.universityMember.upsert({
        where: {
          universityId_normalizedEmail: {
            universityId: invitation.universityId,
            normalizedEmail: invitation.normalizedEmail,
          },
        },
        create: {
          universityId: invitation.universityId,
          email: invitation.email,
          normalizedEmail: invitation.normalizedEmail,
          employeeCode: invitation.employeeCode,
          firstName,
          lastName,
          memberType,
          enrollmentStatus: 'ACTIVE',
          department: invitation.department,
          importedByUserId: invitation.invitedById,
        },
        update: {
          email: invitation.email,
          employeeCode: invitation.employeeCode,
          firstName,
          lastName,
          enrollmentStatus: 'ACTIVE',
          department: invitation.department,
        },
      })
      await tx.universityInvitation.update({
        where: { id: invitation.id },
        data: { acceptedUserId: user.id },
      })
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          universityId: invitation.universityId,
          action: 'MEMBERSHIP_INVITATION_ACCEPTED',
          resourceType: 'User',
          resourceId: user.id,
          resourceName: user.email,
          previousData: { invitationId: invitation.id, status: 'PENDING' },
          nextData: { role: user.role, status: user.status },
          severity: invitation.role === 'UNIVERSITY_ADMIN' ? 'HIGH' : 'MEDIUM',
        },
      })
      return { status: 'accepted', user }
    })
  },

  async listMembers(input) {
    const where = memberWhere(input)
    const orderBy = { [input.sortBy]: input.sortOrder }
    const [total, items] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: memberSelect,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ])
    return { total, items }
  },

  exportMembers(input) {
    return prisma.user.findMany({
      where: memberWhere(input),
      select: memberSelect,
      orderBy: { [input.sortBy]: input.sortOrder },
      take: 10_000,
    })
  },

  recordExportAudit({ universityId, actorId, action, resourceName, count }, audit) {
    return prisma.auditLog.create({
      data: {
        ...audit,
        actorId,
        universityId,
        action,
        resourceType: 'CSV_EXPORT',
        resourceName,
        nextData: { count },
        severity: 'MEDIUM',
      },
    })
  },

  findMember({ id, universityId, role }) {
    return prisma.user.findFirst({
      where: { id, universityId, role },
      select: {
        ...memberSelect,
        _count: {
          select: {
            sessions: true,
            eventRegistrations: true,
            applications: true,
            createdContent: true,
            createdSurveys: true,
          },
        },
      },
    })
  },

  async approvePendingStudent({ id, universityId, rosterMemberId = undefined, reason }, audit) {
    return prisma.$transaction(async tx => {
      const now = new Date()
      const current = await tx.user.findFirst({
        where: { id, universityId, role: 'STUDENT' },
        include: { studentProfile: true },
      })
      if (!current) return { status: 'notFound' }
      if (current.status !== 'PENDING_REVIEW') return { status: 'invalidState', currentStatus: current.status }
      if (!current.emailVerifiedAt) return { status: 'emailNotVerified' }
      if (!current.studentProfile) return { status: 'profileMissing' }

      const rosterWhere = rosterMemberId
        ? { id: rosterMemberId, universityId }
        : {
            universityId,
            OR: [
              { normalizedEmail: current.normalizedEmail },
              ...(current.studentProfile.studentId ? [{ studentId: current.studentProfile.studentId }] : []),
            ],
          }
      const rosterMember = await tx.universityMember.findFirst({ where: rosterWhere })

      // A deliberately supplied roster UUID must still be valid. When no UUID is
      // supplied, University Admin may approve directly; a matching active roster
      // row is linked automatically when one exists.
      if (!rosterMember && rosterMemberId) return { status: 'rosterMissing' }

      if (rosterMember) {
        if (rosterMember.memberType !== 'STUDENT') return { status: 'rosterTypeMismatch' }
        if (
          rosterMember.enrollmentStatus !== 'ACTIVE'
          || (rosterMember.validFrom && rosterMember.validFrom > now)
          || (rosterMember.validUntil && rosterMember.validUntil < now)
        ) return { status: 'rosterInactive' }

        const emailMatches = rosterMember.normalizedEmail === current.normalizedEmail
        const studentIdMatches = Boolean(
          rosterMember.studentId
          && current.studentProfile.studentId
          && rosterMember.studentId === current.studentProfile.studentId,
        )
        if (!emailMatches && !studentIdMatches) return { status: 'identityMismatch' }

        const linkedProfile = await tx.studentProfile.findFirst({
          where: { rosterMemberId: rosterMember.id, userId: { not: current.id } },
          select: { id: true },
        })
        if (linkedProfile) return { status: 'rosterAlreadyLinked' }

        if (rosterMember.studentId) {
          const duplicateStudentId = await tx.studentProfile.findFirst({
            where: {
              userId: { not: current.id },
              universityId,
              studentId: rosterMember.studentId,
            },
            select: { id: true },
          })
          if (duplicateStudentId) return { status: 'studentIdConflict' }
        }
      }

      const profileData = {
        universityId,
        ...(rosterMember ? {
          rosterMemberId: rosterMember.id,
          ...(rosterMember.studentId ? { studentId: rosterMember.studentId } : {}),
          ...(rosterMember.firstName ? { firstName: rosterMember.firstName } : {}),
          ...(rosterMember.lastName ? { lastName: rosterMember.lastName } : {}),
          ...(rosterMember.department ? { department: rosterMember.department } : {}),
          ...(rosterMember.major ? { major: rosterMember.major } : {}),
          ...(rosterMember.graduationYear ? { graduationYear: rosterMember.graduationYear } : {}),
        } : {}),
      }
      const profile = await tx.studentProfile.update({
        where: { userId: current.id },
        data: profileData,
      })
      const user = await tx.user.update({
        where: { id: current.id },
        data: { status: 'ACTIVE' },
        select: memberSelect,
      })
      const sessions = await tx.session.updateMany({
        where: { userId: current.id, revokedAt: null },
        data: { revokedAt: now },
      })
      await tx.notification.create({
        data: {
          userId: current.id,
          universityId,
          type: 'ACCOUNT_REVIEW',
          title: 'Бүртгэл баталгаажлаа',
          description: 'Таны оюутны бүртгэлийг сургуулийн админ баталгаажууллаа. Одоо нэвтэрч болно.',
          actionUrl: '/login',
        },
      })
      const approvalMode = rosterMember ? 'ROSTER_AUTO_LINKED' : 'DIRECT_ADMIN_APPROVAL'
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'STUDENT_REVIEW_APPROVED',
          resourceType: 'User',
          resourceId: current.id,
          resourceName: current.email,
          previousData: { status: current.status, rosterMemberId: current.studentProfile.rosterMemberId },
          nextData: {
            status: 'ACTIVE',
            rosterMemberId: rosterMember?.id ?? null,
            approvalMode,
            reason,
            sessionsRevoked: sessions.count,
          },
          severity: 'HIGH',
        },
      })
      return {
        status: 'approved',
        user,
        profile,
        rosterMember: rosterMember ?? null,
        approvalMode,
        sessionsRevoked: sessions.count,
      }
    })
  },

  async rejectPendingStudent({ id, universityId, reason }, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.user.findFirst({
        where: { id, universityId, role: 'STUDENT' },
        select: { id: true, email: true, status: true },
      })
      if (!current) return { status: 'notFound' }
      if (current.status !== 'PENDING_REVIEW') return { status: 'invalidState', currentStatus: current.status }
      const now = new Date()
      const user = await tx.user.update({
        where: { id: current.id },
        data: { status: 'REJECTED' },
        select: memberSelect,
      })
      const sessions = await tx.session.updateMany({
        where: { userId: current.id, revokedAt: null },
        data: { revokedAt: now },
      })
      await tx.notification.create({
        data: {
          userId: current.id,
          universityId,
          type: 'ACCOUNT_REVIEW',
          title: 'Бүртгэлийн хүсэлт татгалзагдлаа',
          description: reason,
          actionUrl: '/login',
        },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'STUDENT_REVIEW_REJECTED',
          resourceType: 'User',
          resourceId: current.id,
          resourceName: current.email,
          previousData: { status: current.status },
          nextData: { status: 'REJECTED', reason, sessionsRevoked: sessions.count },
          severity: 'HIGH',
        },
      })
      return { status: 'rejected', user, sessionsRevoked: sessions.count }
    })
  },

  async updateMemberStatus({ id, universityId, role, status, reason }, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.user.findFirst({
        where: { id, universityId, role },
        select: { id: true, email: true, status: true },
      })
      if (!current) return null
      if (
        role === 'STUDENT'
        && ['PENDING_VERIFICATION', 'PENDING_REVIEW', 'REJECTED'].includes(current.status)
      ) return { status: 'reviewRequired', currentStatus: current.status }
      if (current.status === status) return { user: current, sessionsRevoked: 0, unchanged: true }

      const user = await tx.user.update({
        where: { id: current.id },
        data: { status },
        select: { id: true, email: true, role: true, status: true, updatedAt: true },
      })
      const sessions = await tx.session.updateMany({
        where: { userId: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: `${role}_STATUS_CHANGED`,
          resourceType: 'User',
          resourceId: current.id,
          resourceName: current.email,
          previousData: { status: current.status },
          nextData: { status, reason, sessionsRevoked: sessions.count },
          severity: status === 'ACTIVE' ? 'MEDIUM' : 'HIGH',
        },
      })
      return { user, sessionsRevoked: sessions.count, unchanged: false }
    })
  },

  async updateStaffPermissions({ id, universityId, permissions }, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.user.findFirst({
        where: { id, universityId, role: 'STAFF' },
        select: { id: true, email: true, staffProfile: true },
      })
      if (!current?.staffProfile) return null
      const previous = Object.fromEntries(Object.keys(permissions).map(key => [key, current.staffProfile[key]]))
      const profile = await tx.staffProfile.update({
        where: { userId: current.id },
        data: permissions,
      })
      const sessions = await tx.session.updateMany({
        where: { userId: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'STAFF_PERMISSIONS_CHANGED',
          resourceType: 'StaffProfile',
          resourceId: profile.id,
          resourceName: current.email,
          previousData: previous,
          nextData: { ...permissions, sessionsRevoked: sessions.count },
          severity: 'HIGH',
        },
      })
      return { profile, sessionsRevoked: sessions.count }
    })
  },

  async rosterContext(universityId) {
    const [university, members] = await prisma.$transaction([
      prisma.university.findUnique({
        where: { id: universityId },
        include: {
          domains: {
            where: { isActive: true, isVerified: true, verificationStatus: 'VERIFIED' },
            select: { domain: true },
          },
        },
      }),
      prisma.universityMember.findMany({ where: { universityId } }),
    ])
    return { university, members }
  },

  async createRosterImportPreview(data, errors, audit) {
    return prisma.$transaction(async tx => {
      const job = await tx.rosterImportJob.create({
        data: {
          universityId: data.universityId,
          uploadedById: data.uploadedById,
          fileName: data.fileName,
          fileSha256: data.fileSha256,
          validatedRows: data.rows,
          totalRows: data.totalRows,
          validRows: data.rows.length,
          invalidRows: errors.length ? new Set(errors.map(item => item.rowNumber)).size : 0,
          rowErrors: {
            create: errors.map(error => ({
              rowNumber: error.rowNumber,
              field: error.field,
              code: error.code,
              message: error.message,
              rowFingerprint: error.rowFingerprint,
            })),
          },
        },
        include: { rowErrors: { orderBy: [{ rowNumber: 'asc' }, { field: 'asc' }] } },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId: data.universityId,
          action: 'ROSTER_IMPORT_PREVIEWED',
          resourceType: 'RosterImportJob',
          resourceId: job.id,
          resourceName: data.fileName,
          nextData: {
            fileSha256: data.fileSha256,
            totalRows: job.totalRows,
            validRows: job.validRows,
            invalidRows: job.invalidRows,
          },
          severity: job.invalidRows ? 'MEDIUM' : 'INFO',
        },
      })
      return job
    })
  },

  async listRosterImports({ universityId, page, pageSize, status = undefined }) {
    const where = { universityId, ...(status ? { status } : {}) }
    const [items, total] = await prisma.$transaction([
      prisma.rosterImportJob.findMany({
        where,
        select: {
          id: true,
          fileName: true,
          fileSha256: true,
          status: true,
          totalRows: true,
          validRows: true,
          invalidRows: true,
          insertedRows: true,
          updatedRows: true,
          skippedRows: true,
          failureCode: true,
          createdAt: true,
          committedAt: true,
          uploadedBy: { select: { id: true, email: true } },
          _count: { select: { rowErrors: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.rosterImportJob.count({ where }),
    ])
    return { items, total }
  },

  findRosterImport({ id, universityId }) {
    return prisma.rosterImportJob.findFirst({
      where: { id, universityId },
      include: { rowErrors: { orderBy: [{ rowNumber: 'asc' }, { field: 'asc' }] } },
    })
  },

  async commitRosterImport({ id, universityId, uploadedById }, audit) {
    return prisma.$transaction(async tx => {
      const job = await tx.rosterImportJob.findFirst({ where: { id, universityId, uploadedById } })
      if (!job) return { status: 'notFound' }
      if (job.status !== 'PREVIEWED') return { status: 'invalidState', job }
      if (job.invalidRows > 0) return { status: 'hasErrors', job }
      const claimed = await tx.rosterImportJob.updateMany({
        where: { id, universityId, uploadedById, status: 'PREVIEWED' },
        data: { status: 'COMMITTING' },
      })
      if (claimed.count !== 1) return { status: 'invalidState', job }

      // Prisma represents JSON as JsonValue. It was validated before the preview
      // job was persisted, and is kept private until this one-time commit.
      const rows = /** @type {Array<Record<string, any>>} */ (Array.isArray(job.validatedRows) ? job.validatedRows : [])
      let insertedRows = 0
      let updatedRows = 0
      for (const row of rows) {
        const existing = await tx.universityMember.findUnique({
          where: { universityId_normalizedEmail: { universityId, normalizedEmail: row.normalizedEmail } },
          select: { id: true },
        })
        await tx.universityMember.upsert({
          where: { universityId_normalizedEmail: { universityId, normalizedEmail: row.normalizedEmail } },
          create: {
            universityId,
            email: row.email,
            normalizedEmail: row.normalizedEmail,
            studentId: row.studentId,
            employeeCode: row.employeeCode,
            firstName: row.firstName,
            lastName: row.lastName,
            memberType: row.memberType,
            enrollmentStatus: row.enrollmentStatus,
            department: row.department,
            major: row.major,
            graduationYear: row.graduationYear,
            validFrom: row.validFrom ? new Date(row.validFrom) : null,
            validUntil: row.validUntil ? new Date(row.validUntil) : null,
            importedByUserId: uploadedById,
            importJobId: id,
          },
          update: {
            email: row.email,
            studentId: row.studentId,
            employeeCode: row.employeeCode,
            firstName: row.firstName,
            lastName: row.lastName,
            enrollmentStatus: row.enrollmentStatus,
            department: row.department,
            major: row.major,
            graduationYear: row.graduationYear,
            validFrom: row.validFrom ? new Date(row.validFrom) : null,
            validUntil: row.validUntil ? new Date(row.validUntil) : null,
            importedByUserId: uploadedById,
            importJobId: id,
          },
        })
        if (existing) updatedRows += 1
        else insertedRows += 1
      }
      const skippedRows = Math.max(0, job.totalRows - insertedRows - updatedRows)
      const committedAt = new Date()
      const completed = await tx.rosterImportJob.update({
        where: { id },
        data: {
          status: 'COMMITTED',
          insertedRows,
          updatedRows,
          skippedRows,
          committedAt,
          validatedRows: [],
        },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'ROSTER_IMPORT_COMMITTED',
          resourceType: 'RosterImportJob',
          resourceId: id,
          resourceName: job.fileName,
          previousData: { status: 'PREVIEWED', validRows: job.validRows },
          nextData: { status: 'COMMITTED', insertedRows, updatedRows, skippedRows },
          severity: 'MEDIUM',
        },
      })
      return { status: 'committed', job: completed }
    }, { timeout: 30_000 })
  },

  markRosterImportFailed({ id, universityId, uploadedById, failureCode }) {
    return prisma.rosterImportJob.updateMany({
      where: { id, universityId, uploadedById, status: { in: ['PREVIEWED', 'COMMITTING'] } },
      data: { status: 'FAILED', failureCode, validatedRows: [] },
    })
  },

  async listRoster({ universityId, page, pageSize, search = undefined, memberType = undefined, enrollmentStatus = undefined, sortBy, sortOrder }) {
    const where = {
      universityId,
      ...(memberType ? { memberType } : {}),
      ...(enrollmentStatus ? { enrollmentStatus } : {}),
      ...(search ? {
        OR: [
          { normalizedEmail: { contains: search.toLowerCase() } },
          { firstName: { contains: search, mode: insensitive } },
          { lastName: { contains: search, mode: insensitive } },
          { studentId: { contains: search, mode: insensitive } },
          { employeeCode: { contains: search, mode: insensitive } },
        ],
      } : {}),
    }
    const [items, total] = await prisma.$transaction([
      prisma.universityMember.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.universityMember.count({ where }),
    ])
    return { items, total }
  },

  listAllRoster(universityId) {
    return prisma.universityMember.findMany({ where: { universityId }, orderBy: { email: 'asc' } })
  },

  exportRoster({ universityId, search = undefined, memberType = undefined, enrollmentStatus = undefined, sortBy, sortOrder }) {
    const where = {
      universityId,
      ...(memberType ? { memberType } : {}),
      ...(enrollmentStatus ? { enrollmentStatus } : {}),
      ...(search ? {
        OR: [
          { normalizedEmail: { contains: search.toLowerCase() } },
          { firstName: { contains: search, mode: insensitive } },
          { lastName: { contains: search, mode: insensitive } },
          { studentId: { contains: search, mode: insensitive } },
          { employeeCode: { contains: search, mode: insensitive } },
        ],
      } : {}),
    }
    return prisma.universityMember.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      take: 10_000,
    })
  },

  async updateRosterStatus({ id, universityId, enrollmentStatus, validFrom = undefined, validUntil = undefined, reason }, audit) {
    return prisma.$transaction(async tx => {
      const current = await tx.universityMember.findFirst({ where: { id, universityId } })
      if (!current) return null
      const member = await tx.universityMember.update({
        where: { id },
        data: { enrollmentStatus, ...(validFrom !== undefined ? { validFrom } : {}), ...(validUntil !== undefined ? { validUntil } : {}) },
      })
      await tx.auditLog.create({
        data: {
          ...audit,
          universityId,
          action: 'ROSTER_MEMBER_STATUS_CHANGED',
          resourceType: 'UniversityMember',
          resourceId: id,
          resourceName: current.email,
          previousData: { enrollmentStatus: current.enrollmentStatus, validFrom: current.validFrom, validUntil: current.validUntil },
          nextData: { enrollmentStatus, validFrom: member.validFrom, validUntil: member.validUntil, reason },
          severity: enrollmentStatus === 'ACTIVE' ? 'INFO' : 'MEDIUM',
        },
      })
      return member
    })
  },
}
