import { env } from '../config/env.js'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { AppError } from '../utils/app-error.js'
import { hashPassword } from '../utils/password.js'
import { createOpaqueToken, hashToken } from '../utils/tokens.js'
import { emailService } from '../auth/email.service.js'
import { membershipRepository } from './membership.repository.js'
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationListSchema,
  memberIdSchema,
  memberListSchema,
  memberExportSchema,
  pendingStudentListSchema,
  staffStatusSchema,
  studentStatusSchema,
  approveStudentSchema,
  rejectStudentSchema,
  updatePermissionsSchema,
  rosterListSchema,
  rosterExportSchema,
  rosterStatusSchema,
  importIdSchema,
  importListSchema,
} from './membership.validation.js'
import { parseRosterCsv, rosterTemplateCsv } from './roster-import.js'

const durationToMs = value => {
  const match = /^(\d+)([mhd])$/.exec(value)
  if (!match) throw new Error('Invalid duration')
  return Number(match[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]
}

const forbidden = (message = 'You cannot manage members outside your university.') => (
  new AppError(message, 403, 'MEMBERSHIP_FORBIDDEN')
)
const notFound = () => new AppError('Member was not found.', 404, 'MEMBER_NOT_FOUND')
const auditFrom = (actor, context = {}) => ({
  actorId: actor.id,
  ipAddress: context.ipAddress,
  userAgent: context.userAgent,
})

const assertUniversityAdmin = actor => {
  if (actor.role !== 'UNIVERSITY_ADMIN' || !actor.universityId) throw forbidden()
  return actor.universityId
}

const invitationScope = (actor, input) => {
  if (actor.role === 'UNIVERSITY_ADMIN') {
    if (!actor.universityId || (input.universityId && input.universityId !== actor.universityId)) throw forbidden()
    if (input.role && input.role !== 'STAFF') {
      throw forbidden('University Admin can invite Staff only.')
    }
    return { universityId: actor.universityId, role: 'STAFF' }
  }
  if (actor.role === 'PLATFORM_SUPER_ADMIN') {
    if (!input.universityId) {
      throw new AppError('universityId is required for a platform invitation.', 422, 'UNIVERSITY_REQUIRED')
    }
    if (input.role && input.role !== 'UNIVERSITY_ADMIN') {
      throw forbidden('Platform Super Admin can use this flow to invite University Admin only.')
    }
    return { universityId: input.universityId, role: 'UNIVERSITY_ADMIN' }
  }
  throw forbidden()
}

const publicMember = user => ({
  id: user.id,
  universityId: user.universityId,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerifiedAt: user.emailVerifiedAt,
  firstName: user.staffProfile?.firstName,
  lastName: user.staffProfile?.lastName,
})

const rosterFileNameSchema = z.string().trim().min(1).max(160).refine(
  value => value.toLowerCase().endsWith('.csv') && !/[\\/\0]/u.test(value),
  'A safe .csv filename is required.',
)

const rosterTextSchema = z.string().min(1).max(1_000_000)

const csvCell = value => {
  let safe = String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  if (/^[=+\-@]/.test(safe.trimStart())) safe = `'${safe}`
  return `"${safe.replaceAll('"', '""')}"`
}
const csvDocument = rows => `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`
const iso = value => value ? new Date(value).toISOString() : ''


export function createMembershipService(repository = membershipRepository, mailer = emailService) {
  return {
    async createInvitation(actor, payload, context) {
      const input = createInvitationSchema.parse(payload)
      const scope = invitationScope(actor, input)
      const university = await repository.findUniversity(scope.universityId)
      if (!university || university.status !== 'ACTIVE') {
        throw new AppError('The target university is not active.', 409, 'UNIVERSITY_NOT_ACTIVE')
      }
      const emailDomain = input.email.split('@')[1]
      if (!university.domains.some(domain => domain.domain === emailDomain)) {
        throw new AppError(
          'Invitation email must use an active, verified domain owned by the university.',
          422,
          'INVITATION_EMAIL_DOMAIN_MISMATCH',
        )
      }
      if (await repository.findUserByEmail(input.email)) {
        throw new AppError('A user with this email already exists.', 409, 'INVITATION_USER_EXISTS')
      }

      const token = createOpaqueToken()
      const invitation = await repository.createInvitation({
        universityId: scope.universityId,
        invitedById: actor.id,
        email: input.email,
        normalizedEmail: input.email,
        role: scope.role,
        tokenHash: hashToken(token),
        employeeCode: input.employeeCode || null,
        department: input.department || null,
        jobTitle: input.jobTitle || null,
        permissions: scope.role === 'STAFF' ? (input.permissions ?? {}) : {},
        expiresAt: new Date(Date.now() + durationToMs(env.INVITATION_TOKEN_EXPIRES_IN)),
      }, auditFrom(actor, context))

      try {
        const delivery = await mailer.sendInvitation({ to: invitation.email, token })
        if (!delivery?.delivered) throw new Error('Invitation email delivery is disabled')
      } catch {
        await repository.revokeInvitationAfterDeliveryFailure(invitation.id)
        throw new AppError(
          'The invitation could not be delivered. No active invitation was left behind.',
          503,
          'INVITATION_DELIVERY_FAILED',
        )
      }

      return { invitation }
    },

    async listInvitations(actor, query) {
      const input = invitationListSchema.parse(query)
      const scope = invitationScope(actor, input)
      const result = await repository.listInvitations({ ...input, ...scope })
      return {
        items: result.items,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / input.pageSize),
        },
      }
    },

    async revokeInvitation(actor, id, query, context) {
      memberIdSchema.parse({ id })
      const scopeInput = invitationListSchema.pick({ universityId: true }).parse(query)
      const scope = invitationScope(actor, scopeInput)
      const result = await repository.revokeInvitation({ id, ...scope }, auditFrom(actor, context))
      if (result.status === 'notFound') {
        throw new AppError('Invitation was not found.', 404, 'INVITATION_NOT_FOUND')
      }
      if (result.status !== 'revoked') {
        throw new AppError('Only a pending invitation can be revoked.', 409, 'INVITATION_NOT_PENDING')
      }
      return { status: 'REVOKED' }
    },

    async acceptInvitation(payload) {
      const input = acceptInvitationSchema.parse(payload)
      const result = await repository.acceptInvitation({
        tokenHash: hashToken(input.token),
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
      })
      if (result.status !== 'accepted') {
        throw new AppError(
          'Invitation is invalid, expired, revoked, or already used.',
          400,
          'INVITATION_INVALID',
        )
      }
      return { user: publicMember(result.user), redirectTo: '/login' }
    },

    async listMembers(actor, role, query) {
      const universityId = assertUniversityAdmin(actor)
      const input = memberListSchema.parse(query)
      const result = await repository.listMembers({ ...input, universityId, role })
      return {
        items: result.items,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / input.pageSize),
        },
      }
    },


    async exportMembers(actor, role, query, context) {
      const universityId = assertUniversityAdmin(actor)
      const input = memberExportSchema.parse(query)
      const items = await repository.exportMembers({ ...input, universityId, role })
      const rows = [[
        'email', 'role', 'status', 'lastName', 'firstName', 'department',
        role === 'STUDENT' ? 'studentId' : 'employeeCode', 'lastLoginAt', 'createdAt',
      ], ...items.map(item => {
        const profile = role === 'STUDENT' ? item.studentProfile : item.staffProfile
        return [
          item.email,
          item.role,
          item.status,
          profile?.lastName,
          profile?.firstName,
          profile?.department,
          role === 'STUDENT' ? profile?.studentId : profile?.employeeCode,
          iso(item.lastLoginAt),
          iso(item.createdAt),
        ]
      })]
      await repository.recordExportAudit({
        universityId,
        actorId: actor.id,
        action: `${role}_MEMBERS_EXPORTED`,
        resourceName: role.toLowerCase(),
        count: items.length,
      }, auditFrom(actor, context))
      return { csv: csvDocument(rows), count: items.length }
    },

    async getMember(actor, role, id) {
      const universityId = assertUniversityAdmin(actor)
      memberIdSchema.parse({ id })
      const member = await repository.findMember({ id, universityId, role })
      if (!member) throw notFound()
      return { member }
    },

    async listPendingStudents(actor, query) {
      const universityId = assertUniversityAdmin(actor)
      const input = pendingStudentListSchema.parse(query)
      const result = await repository.listMembers({ ...input, universityId, role: 'STUDENT', status: 'PENDING_REVIEW' })
      return {
        items: result.items,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / input.pageSize),
        },
      }
    },

    async approvePendingStudent(actor, id, payload, context) {
      const universityId = assertUniversityAdmin(actor)
      memberIdSchema.parse({ id })
      const input = approveStudentSchema.parse(payload)
      const result = await repository.approvePendingStudent(
        { id, universityId, ...input, reason: input.reason ?? 'Approved by University Admin' },
        auditFrom(actor, context),
      )
      const errors = {
        notFound: () => notFound(),
        invalidState: () => new AppError('Зөвхөн PENDING_REVIEW төлөвтэй оюутныг батална.', 409, 'STUDENT_REVIEW_INVALID_STATE'),
        emailNotVerified: () => new AppError('Оюутны имэйл баталгаажаагүй байна.', 409, 'STUDENT_EMAIL_NOT_VERIFIED'),
        profileMissing: () => new AppError('Оюутны профайл олдсонгүй.', 409, 'STUDENT_PROFILE_MISSING'),
        rosterMissing: () => new AppError('Оруулсан roster member ID олдсонгүй.', 409, 'ROSTER_MATCH_REQUIRED'),
        rosterTypeMismatch: () => new AppError('Сонгосон roster бичлэг Student төрөл биш байна.', 409, 'ROSTER_MEMBER_TYPE_MISMATCH'),
        rosterInactive: () => new AppError('Roster бичлэг идэвхгүй эсвэл хүчинтэй хугацаа дууссан байна.', 409, 'ROSTER_MEMBER_INACTIVE'),
        identityMismatch: () => new AppError('Оюутны имэйл эсвэл studentId roster бичлэгтэй тохирохгүй байна.', 409, 'ROSTER_IDENTITY_MISMATCH'),
        rosterAlreadyLinked: () => new AppError('Энэ roster бичлэг өөр хэрэглэгчтэй холбогдсон байна.', 409, 'ROSTER_ALREADY_LINKED'),
        studentIdConflict: () => new AppError('Student ID өөр хэрэглэгч дээр бүртгэлтэй байна.', 409, 'STUDENT_ID_CONFLICT'),
      }
      if (result.status !== 'approved') throw (errors[result.status]?.() ?? new AppError('Оюутны бүртгэлийг баталж чадсангүй.', 409, 'STUDENT_REVIEW_FAILED'))
      return {
        user: result.user,
        rosterMember: result.rosterMember,
        approvalMode: result.approvalMode,
        sessionsRevoked: result.sessionsRevoked,
        message: 'Оюутны бүртгэл амжилттай батлагдлаа.',
      }
    },

    async rejectPendingStudent(actor, id, payload, context) {
      const universityId = assertUniversityAdmin(actor)
      memberIdSchema.parse({ id })
      const input = rejectStudentSchema.parse(payload)
      const result = await repository.rejectPendingStudent(
        { id, universityId, ...input, reason: input.reason ?? 'Rejected by University Admin' },
        auditFrom(actor, context),
      )
      if (result.status === 'notFound') throw notFound()
      if (result.status !== 'rejected') {
        throw new AppError('Зөвхөн PENDING_REVIEW төлөвтэй оюутны хүсэлтийг татгалзана.', 409, 'STUDENT_REVIEW_INVALID_STATE')
      }
      return { user: result.user, sessionsRevoked: result.sessionsRevoked, message: 'Оюутны хүсэлтийг амжилттай татгалзлаа.' }
    },

    async updateMemberStatus(actor, role, id, payload, context) {
      const universityId = assertUniversityAdmin(actor)
      memberIdSchema.parse({ id })
      const input = (role === 'STUDENT' ? studentStatusSchema : staffStatusSchema).parse(payload)
      const result = await repository.updateMemberStatus(
        { id, universityId, role, ...input, reason: input.reason ?? 'Status changed by University Admin' },
        auditFrom(actor, context),
      )
      if (!result) throw notFound()
      if (result.status === 'reviewRequired') {
        throw new AppError(
          'Pending эсвэл rejected Student-ийг dedicated approve/reject review flow-оор удирдана.',
          409,
          'STUDENT_REVIEW_WORKFLOW_REQUIRED',
        )
      }
      return result
    },

    async updateStaffPermissions(actor, id, payload, context) {
      const universityId = assertUniversityAdmin(actor)
      memberIdSchema.parse({ id })
      const permissions = updatePermissionsSchema.parse(payload)
      const result = await repository.updateStaffPermissions(
        { id, universityId, permissions },
        auditFrom(actor, context),
      )
      if (!result) throw notFound()
      return result
    },

    async rosterTemplate(actor) {
      assertUniversityAdmin(actor)
      return rosterTemplateCsv()
    },

    async previewRosterImport(actor, fileName, csvText, context) {
      const universityId = assertUniversityAdmin(actor)
      const safeFileName = rosterFileNameSchema.parse(fileName)
      const text = rosterTextSchema.parse(csvText)
      const { university, members } = await repository.rosterContext(universityId)
      if (!university || university.status !== 'ACTIVE') {
        throw new AppError('The university is not active.', 409, 'UNIVERSITY_NOT_ACTIVE')
      }
      const parsed = parseRosterCsv(text, { activeDomains: university.domains.map(item => item.domain), existingMembers: members })
      const job = await repository.createRosterImportPreview({
        universityId,
        uploadedById: actor.id,
        fileName: safeFileName,
        fileSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
        rows: parsed.rows,
        totalRows: parsed.totalRows,
      }, parsed.errors, auditFrom(actor, context))
      return { job }
    },

    async listRosterImports(actor, query) {
      const universityId = assertUniversityAdmin(actor)
      const input = importListSchema.parse(query)
      const result = await repository.listRosterImports({ universityId, ...input })
      return {
        items: result.items,
        pagination: { page: input.page, pageSize: input.pageSize, total: result.total, totalPages: Math.ceil(result.total / input.pageSize) },
      }
    },

    async getRosterImport(actor, id) {
      const universityId = assertUniversityAdmin(actor)
      importIdSchema.parse({ id })
      const job = await repository.findRosterImport({ id, universityId })
      if (!job) throw new AppError('Roster import was not found.', 404, 'ROSTER_IMPORT_NOT_FOUND')
      return { job }
    },

    async commitRosterImport(actor, id, context) {
      const universityId = assertUniversityAdmin(actor)
      importIdSchema.parse({ id })
      const result = await repository.commitRosterImport({ id, universityId, uploadedById: actor.id }, auditFrom(actor, context))
      if (result.status === 'notFound') throw new AppError('Roster import was not found.', 404, 'ROSTER_IMPORT_NOT_FOUND')
      if (result.status === 'hasErrors') throw new AppError('Roster import contains validation errors.', 409, 'ROSTER_IMPORT_HAS_ERRORS')
      if (result.status !== 'committed') throw new AppError('Roster import is no longer available to commit.', 409, 'ROSTER_IMPORT_INVALID_STATE')
      return { job: result.job }
    },

    async listRoster(actor, query) {
      const universityId = assertUniversityAdmin(actor)
      const input = rosterListSchema.parse(query)
      const result = await repository.listRoster({ universityId, ...input })
      return {
        items: result.items,
        pagination: { page: input.page, pageSize: input.pageSize, total: result.total, totalPages: Math.ceil(result.total / input.pageSize) },
      }
    },


    async exportRoster(actor, query, context) {
      const universityId = assertUniversityAdmin(actor)
      const input = rosterExportSchema.parse(query)
      const items = await repository.exportRoster({ universityId, ...input })
      const rows = [[
        'email', 'memberType', 'enrollmentStatus', 'lastName', 'firstName',
        'studentId', 'employeeCode', 'department', 'major', 'graduationYear',
        'validFrom', 'validUntil', 'importedAt',
      ], ...items.map(item => [
        item.email,
        item.memberType,
        item.enrollmentStatus,
        item.lastName,
        item.firstName,
        item.studentId,
        item.employeeCode,
        item.department,
        item.major,
        item.graduationYear,
        iso(item.validFrom),
        iso(item.validUntil),
        iso(item.importedAt),
      ])]
      await repository.recordExportAudit({
        universityId,
        actorId: actor.id,
        action: 'ROSTER_EXPORTED',
        resourceName: 'university-roster',
        count: items.length,
      }, auditFrom(actor, context))
      return { csv: csvDocument(rows), count: items.length }
    },

    async exportRosterImportErrors(actor, id, context) {
      const universityId = assertUniversityAdmin(actor)
      importIdSchema.parse({ id })
      const job = await repository.findRosterImport({ id, universityId })
      if (!job) throw new AppError('Roster import was not found.', 404, 'ROSTER_IMPORT_NOT_FOUND')
      const errors = job.rowErrors || []
      const rows = [[
        'rowNumber', 'field', 'code', 'message', 'rowFingerprint',
      ], ...errors.map(error => [
        error.rowNumber,
        error.field,
        error.code,
        error.message,
        error.rowFingerprint,
      ])]
      await repository.recordExportAudit({
        universityId,
        actorId: actor.id,
        action: 'ROSTER_IMPORT_ERRORS_EXPORTED',
        resourceName: job.fileName,
        count: errors.length,
      }, auditFrom(actor, context))
      return { csv: csvDocument(rows), count: errors.length, fileName: job.fileName }
    },

    async updateRosterStatus(actor, id, payload, context) {
      const universityId = assertUniversityAdmin(actor)
      memberIdSchema.parse({ id })
      const input = rosterStatusSchema.parse(payload)
      const member = await repository.updateRosterStatus({ id, universityId, ...input, reason: input.reason ?? 'Roster status changed by University Admin' }, auditFrom(actor, context))
      if (!member) throw new AppError('Roster member was not found.', 404, 'ROSTER_MEMBER_NOT_FOUND')
      return { member }
    },
  }
}

export const membershipService = createMembershipService()
