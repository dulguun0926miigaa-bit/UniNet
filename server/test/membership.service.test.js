import { beforeAll, describe, expect, it } from 'vitest'

let createMembershipService
let hashToken

beforeAll(async () => {
  ;({ createMembershipService } = await import('../src/memberships/membership.service.js'))
  ;({ hashToken } = await import('../src/utils/tokens.js'))
})

const universityId = 'a7ef7cda-8324-48a6-b08c-588d380f9158'
const otherUniversityId = 'f7515579-e6d3-45e6-8459-7756c9022a6f'
const actor = {
  id: 'bcbcadf7-d126-4a9c-b51e-d96bddad6608',
  role: 'UNIVERSITY_ADMIN',
  universityId,
}
const platformActor = {
  id: '536e2aaf-e56c-49b5-954f-df878fc62567',
  role: 'PLATFORM_SUPER_ADMIN',
  universityId: null,
}
const activeUniversity = {
  id: universityId,
  status: 'ACTIVE',
  domains: [{ domain: 'example.edu.mn', isActive: true, isVerified: true }],
}

describe('membership invitation service', () => {
  it('creates a tenant-bound Staff invitation with an opaque, hashed, expiring token', async () => {
    let stored
    let delivered
    const repository = {
      findUniversity: async () => activeUniversity,
      findUserByEmail: async () => null,
      createInvitation: async data => {
        stored = data
        return {
          id: 'invitation-id',
          status: 'PENDING',
          email: data.email,
          universityId: data.universityId,
          role: data.role,
          expiresAt: data.expiresAt,
        }
      },
      revokeInvitationAfterDeliveryFailure: async () => undefined,
    }
    const mailer = {
      sendInvitation: async input => {
        delivered = input
        return { delivered: true }
      },
    }

    const result = await createMembershipService(repository, mailer).createInvitation(actor, {
      email: 'New.Staff@example.edu.mn',
      role: 'STAFF',
      permissions: { canManageSurveys: true },
    }, { ipAddress: '127.0.0.1', userAgent: 'vitest' })

    expect(stored).toMatchObject({
      universityId,
      invitedById: actor.id,
      normalizedEmail: 'new.staff@example.edu.mn',
      role: 'STAFF',
      permissions: { canManageSurveys: true },
    })
    expect(stored.tokenHash).toBe(hashToken(delivered.token))
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(delivered.token).toHaveLength(43)
    expect(result.invitation).not.toHaveProperty('token')
    expect(result.invitation).not.toHaveProperty('tokenHash')
  })

  it('rejects a University Admin attempt to invite another Admin or escape its tenant', async () => {
    const service = createMembershipService({})
    await expect(service.createInvitation(actor, {
      email: 'admin@example.edu.mn',
      role: 'UNIVERSITY_ADMIN',
    })).rejects.toMatchObject({ status: 403, code: 'MEMBERSHIP_FORBIDDEN' })
    await expect(service.createInvitation(actor, {
      universityId: otherUniversityId,
      email: 'staff@example.edu.mn',
      role: 'STAFF',
    })).rejects.toMatchObject({ status: 403, code: 'MEMBERSHIP_FORBIDDEN' })
  })

  it('allows Platform Super Admin to invite only University Admin with explicit tenant scope', async () => {
    const service = createMembershipService({})
    await expect(service.createInvitation(platformActor, {
      email: 'admin@example.edu.mn',
      role: 'UNIVERSITY_ADMIN',
    })).rejects.toMatchObject({ status: 422, code: 'UNIVERSITY_REQUIRED' })
    await expect(service.createInvitation(platformActor, {
      universityId,
      email: 'staff@example.edu.mn',
      role: 'STAFF',
    })).rejects.toMatchObject({ status: 403, code: 'MEMBERSHIP_FORBIDDEN' })
  })

  it('requires the recipient email to use a verified domain owned by the target university', async () => {
    const service = createMembershipService({
      findUniversity: async () => activeUniversity,
      findUserByEmail: async () => null,
    })
    await expect(service.createInvitation(actor, {
      email: 'staff@outside.example',
      role: 'STAFF',
    })).rejects.toMatchObject({ status: 422, code: 'INVITATION_EMAIL_DOMAIN_MISMATCH' })
  })

  it('revokes the stored invitation when email delivery is unavailable', async () => {
    let revokedId
    const repository = {
      findUniversity: async () => activeUniversity,
      findUserByEmail: async () => null,
      createInvitation: async data => ({ id: 'undelivered', email: data.email }),
      revokeInvitationAfterDeliveryFailure: async id => { revokedId = id },
    }
    const service = createMembershipService(repository, {
      sendInvitation: async () => ({ delivered: false }),
    })
    await expect(service.createInvitation(actor, {
      email: 'staff@example.edu.mn',
      role: 'STAFF',
    })).rejects.toMatchObject({ status: 503, code: 'INVITATION_DELIVERY_FAILED' })
    expect(revokedId).toBe('undelivered')
  })

  it('hashes the acceptance password and rejects a second use with one generic error', async () => {
    let acceptedInput
    let calls = 0
    const repository = {
      acceptInvitation: async input => {
        acceptedInput = input
        calls += 1
        if (calls > 1) return { status: 'invalid' }
        return {
          status: 'accepted',
          user: {
            id: 'new-user',
            universityId,
            email: 'staff@example.edu.mn',
            role: 'STAFF',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            staffProfile: { firstName: 'New', lastName: 'Staff' },
          },
        }
      },
    }
    const service = createMembershipService(repository)
    const payload = {
      token: 'a'.repeat(43),
      firstName: 'New',
      lastName: 'Staff',
      password: 'Secure!Pass123',
      confirmPassword: 'Secure!Pass123',
    }

    const result = await service.acceptInvitation(payload)
    expect(acceptedInput.tokenHash).toBe(hashToken(payload.token))
    expect(acceptedInput.passwordHash).toMatch(/^\$argon2id\$/)
    expect(result).toMatchObject({ user: { role: 'STAFF' }, redirectTo: '/login' })
    await expect(service.acceptInvitation(payload)).rejects.toMatchObject({
      status: 400,
      code: 'INVITATION_INVALID',
    })
  })
})

describe('tenant-scoped member management service', () => {
  it('forces list queries to the University Admin tenant and enforces the maximum page size', async () => {
    let received
    const service = createMembershipService({
      listMembers: async input => {
        received = input
        return { items: [], total: 0 }
      },
    })
    const result = await service.listMembers(actor, 'STUDENT', {
      page: '2',
      pageSize: '50',
      sortBy: 'email',
      sortOrder: 'asc',
      search: 'student',
    })
    expect(received).toMatchObject({ universityId, role: 'STUDENT', page: 2, pageSize: 50 })
    expect(result.pagination).toEqual({ page: 2, pageSize: 50, total: 0, totalPages: 0 })

    await expect(service.listMembers(actor, 'STUDENT', { pageSize: '101' })).rejects.toBeTruthy()
    await expect(service.listMembers(platformActor, 'STUDENT', {})).rejects.toMatchObject({ status: 403 })
  })

  it('passes a tenant-scoped status change with reason and audit context to the repository', async () => {
    let received
    const service = createMembershipService({
      updateMemberStatus: async (input, audit) => {
        received = { input, audit }
        return { user: { id: input.id, status: input.status }, sessionsRevoked: 2 }
      },
    })
    const memberId = 'b20cdbb9-f329-46ef-ae2c-20ea464209c5'
    const result = await service.updateMemberStatus(actor, 'STAFF', memberId, {
      status: 'DEACTIVATED',
      reason: 'Employment ended',
    }, { ipAddress: '127.0.0.1', userAgent: 'vitest' })

    expect(received.input).toMatchObject({ id: memberId, universityId, role: 'STAFF' })
    expect(received.audit).toMatchObject({ actorId: actor.id, ipAddress: '127.0.0.1' })
    expect(result.sessionsRevoked).toBe(2)
  })

  it('uses a strict permission allowlist and rejects mass-assigned fields', async () => {
    let received
    const service = createMembershipService({
      updateStaffPermissions: async input => {
        received = input
        return { profile: input.permissions, sessionsRevoked: 1 }
      },
    })
    const memberId = 'b20cdbb9-f329-46ef-ae2c-20ea464209c5'
    await service.updateStaffPermissions(actor, memberId, {
      canPublish: true,
      canManageSurveys: false,
    })
    expect(received).toMatchObject({
      id: memberId,
      universityId,
      permissions: { canPublish: true, canManageSurveys: false },
    })
    await expect(service.updateStaffPermissions(actor, memberId, {
      canPublish: true,
      role: 'UNIVERSITY_ADMIN',
    })).rejects.toBeTruthy()
  })
})

describe('pending student review service', () => {
  const memberId = 'b20cdbb9-f329-46ef-ae2c-20ea464209c5'
  const rosterMemberId = '6f9ad2a6-3fb8-4710-8ee0-5cd4f2865da7'

  it('lists only PENDING_REVIEW students inside the admin tenant', async () => {
    let received
    const service = createMembershipService({
      listMembers: async input => {
        received = input
        return { items: [], total: 0 }
      },
    })
    await service.listPendingStudents(actor, { page: '1', pageSize: '20', search: 'student' })
    expect(received).toMatchObject({ universityId, role: 'STUDENT', status: 'PENDING_REVIEW' })
    await expect(service.listPendingStudents(platformActor, {})).rejects.toMatchObject({ status: 403 })
  })

  it('approves a pending student directly inside the admin tenant and returns the approval mode', async () => {
    let received
    const service = createMembershipService({
      approvePendingStudent: async (input, audit) => {
        received = { input, audit }
        return {
          status: 'approved',
          user: { id: input.id, status: 'ACTIVE' },
          rosterMember: null,
          approvalMode: 'DIRECT_ADMIN_APPROVAL',
          sessionsRevoked: 1,
        }
      },
    })
    const result = await service.approvePendingStudent(actor, memberId, {
      reason: 'University Admin direct approval',
    }, { ipAddress: '127.0.0.1', userAgent: 'vitest' })

    expect(received.input).toEqual({
      id: memberId,
      universityId,
      reason: 'University Admin direct approval',
    })
    expect(received.audit).toMatchObject({ actorId: actor.id, ipAddress: '127.0.0.1' })
    expect(result).toMatchObject({ user: { status: 'ACTIVE' }, rosterMember: null, approvalMode: 'DIRECT_ADMIN_APPROVAL' })
  })

  it('maps an explicitly supplied missing or inactive roster decision to safe conflict errors', async () => {
    const missingService = createMembershipService({ approvePendingStudent: async () => ({ status: 'rosterMissing' }) })
    await expect(missingService.approvePendingStudent(actor, memberId, {
      rosterMemberId,
      reason: 'Manual review completed',
    })).rejects.toMatchObject({ status: 409, code: 'ROSTER_MATCH_REQUIRED' })

    const inactiveService = createMembershipService({ approvePendingStudent: async () => ({ status: 'rosterInactive' }) })
    await expect(inactiveService.approvePendingStudent(actor, memberId, {
      rosterMemberId,
      reason: 'Manual review completed',
    })).rejects.toMatchObject({ status: 409, code: 'ROSTER_MEMBER_INACTIVE' })
  })

  it('rejects a pending student with an audited tenant-scoped decision', async () => {
    let received
    const service = createMembershipService({
      rejectPendingStudent: async (input, audit) => {
        received = { input, audit }
        return { status: 'rejected', user: { id: input.id, status: 'REJECTED' }, sessionsRevoked: 0 }
      },
    })
    const result = await service.rejectPendingStudent(actor, memberId, {
      reason: 'No active enrollment could be confirmed',
    }, { ipAddress: '127.0.0.1', userAgent: 'vitest' })
    expect(received.input).toMatchObject({ id: memberId, universityId })
    expect(result.user.status).toBe('REJECTED')
  })

  it('prevents the generic status endpoint from bypassing the review workflow', async () => {
    const service = createMembershipService({ updateMemberStatus: async () => ({}) })
    await expect(service.updateMemberStatus(actor, 'STUDENT', memberId, {
      status: 'REJECTED',
      reason: 'Trying to bypass review',
    })).rejects.toBeTruthy()
    await expect(service.updateMemberStatus(actor, 'STUDENT', memberId, {
      status: 'PENDING_REVIEW',
      reason: 'Trying to reset review',
    })).rejects.toBeTruthy()

    const guardedService = createMembershipService({
      updateMemberStatus: async () => ({ status: 'reviewRequired', currentStatus: 'PENDING_REVIEW' }),
    })
    await expect(guardedService.updateMemberStatus(actor, 'STUDENT', memberId, {
      status: 'ACTIVE',
      reason: 'Trying to bypass roster approval',
    })).rejects.toMatchObject({ status: 409, code: 'STUDENT_REVIEW_WORKFLOW_REQUIRED' })
  })
})

describe('tenant-scoped membership CSV exports', () => {
  it('exports filtered student membership data with spreadsheet-formula protection and an audit event', async () => {
    let exportInput
    let auditInput
    const service = createMembershipService({
      exportMembers: async input => {
        exportInput = input
        return [{
          email: '=HYPERLINK("https://evil.example")',
          role: 'STUDENT',
          status: 'ACTIVE',
          lastLoginAt: new Date('2026-07-20T10:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          studentProfile: {
            firstName: 'Номин',
            lastName: 'Тест',
            department: 'МТЭС',
            studentId: 'S-001',
          },
          staffProfile: null,
        }]
      },
      recordExportAudit: async (input, audit) => { auditInput = { input, audit } },
    })

    const result = await service.exportMembers(actor, 'STUDENT', {
      status: 'ACTIVE',
      sortBy: 'email',
      sortOrder: 'asc',
    }, { ipAddress: '127.0.0.1', userAgent: 'vitest' })

    expect(exportInput).toMatchObject({ universityId, role: 'STUDENT', status: 'ACTIVE', sortBy: 'email', sortOrder: 'asc' })
    expect(result.count).toBe(1)
    expect(result.csv.startsWith('\uFEFF')).toBe(true)
    expect(result.csv).toContain("'=HYPERLINK")
    expect(auditInput.input).toMatchObject({
      universityId,
      actorId: actor.id,
      action: 'STUDENT_MEMBERS_EXPORTED',
      count: 1,
    })
    expect(auditInput.audit).toMatchObject({ ipAddress: '127.0.0.1' })
  })

  it('exports only the current university roster and records a medium-severity audit through the repository', async () => {
    let received
    let audited
    const service = createMembershipService({
      exportRoster: async input => {
        received = input
        return [{
          email: 'student@example.edu.mn',
          memberType: 'STUDENT',
          enrollmentStatus: 'ACTIVE',
          firstName: 'Student',
          lastName: 'One',
          studentId: 'S-001',
          importedAt: new Date('2026-07-01T00:00:00.000Z'),
        }]
      },
      recordExportAudit: async input => { audited = input },
    })

    const result = await service.exportRoster(actor, {
      memberType: 'STUDENT',
      enrollmentStatus: 'ACTIVE',
      sortBy: 'email',
      sortOrder: 'asc',
    })

    expect(received).toMatchObject({
      universityId,
      memberType: 'STUDENT',
      enrollmentStatus: 'ACTIVE',
      sortBy: 'email',
      sortOrder: 'asc',
    })
    expect(result.count).toBe(1)
    expect(result.csv).toContain('student@example.edu.mn')
    expect(audited).toMatchObject({ universityId, action: 'ROSTER_EXPORTED', count: 1 })
    await expect(service.exportRoster(platformActor, {})).rejects.toMatchObject({ status: 403 })
  })

  it('exports row-level import errors only after tenant-scoped import lookup', async () => {
    let lookup
    let audited
    const importId = '7f7c0222-a2c9-44c5-a780-064a08aac121'
    const service = createMembershipService({
      findRosterImport: async input => {
        lookup = input
        return {
          id: importId,
          fileName: 'students.csv',
          rowErrors: [{
            rowNumber: 4,
            field: 'email',
            code: 'INVALID_EMAIL',
            message: '=bad formula-like value',
            rowFingerprint: 'abc123',
          }],
        }
      },
      recordExportAudit: async input => { audited = input },
    })

    const result = await service.exportRosterImportErrors(actor, importId, { userAgent: 'vitest' })
    expect(lookup).toEqual({ id: importId, universityId })
    expect(result.count).toBe(1)
    expect(result.csv).toContain("'=bad formula-like value")
    expect(audited).toMatchObject({ action: 'ROSTER_IMPORT_ERRORS_EXPORTED', resourceName: 'students.csv' })
  })
})
