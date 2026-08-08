import { z } from 'zod'
import { passwordPolicy } from '../utils/password.js'

export const staffPermissionNames = [
  'canCreateContent',
  'canPublish',
  'canManageRegistrations',
  'canManageApplications',
  'canManageSurveys',
  'canViewReports',
]

const nullableText = (maximum) => z.string().trim().max(maximum).optional()
const email = z.string().trim().email().transform(value => value.toLowerCase())
const password = z.string().min(passwordPolicy.minLength).regex(
  passwordPolicy.pattern,
  'Password must include uppercase, lowercase, number, and special characters.',
)

export const staffPermissionsSchema = z.object(
  Object.fromEntries(staffPermissionNames.map(name => [name, z.boolean().optional()])),
).strict()

export const createInvitationSchema = z.object({
  universityId: z.string().uuid().optional(),
  email,
  role: z.enum(['STAFF', 'UNIVERSITY_ADMIN']),
  employeeCode: nullableText(60),
  department: nullableText(160),
  jobTitle: nullableText(160),
  permissions: staffPermissionsSchema.optional(),
}).strict()

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(40).max(256),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password,
  confirmPassword: z.string(),
}).strict().refine(value => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
})

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}

export const invitationListSchema = z.object({
  ...pagination,
  universityId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']).optional(),
  role: z.enum(['STAFF', 'UNIVERSITY_ADMIN']).optional(),
  sortBy: z.enum(['createdAt', 'expiresAt', 'email', 'role']).default('createdAt'),
}).strict()

export const memberListSchema = z.object({
  ...pagination,
  status: z.enum(['PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'REJECTED']).optional(),
  department: z.string().trim().max(160).optional(),
  sortBy: z.enum(['createdAt', 'email', 'status', 'lastLoginAt']).default('createdAt'),
}).strict()

export const pendingStudentListSchema = memberListSchema.omit({ status: true })
export const memberExportSchema = memberListSchema.omit({ page: true, pageSize: true })

export const memberIdSchema = z.object({ id: z.string().uuid() }).strict()
export const invitationIdSchema = z.object({ id: z.string().uuid() }).strict()

export const studentStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict()

export const approveStudentSchema = z.object({
  rosterMemberId: z.string().uuid().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict()

export const rejectStudentSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
}).strict()

export const staffStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict()

export const updatePermissionsSchema = staffPermissionsSchema.refine(
  value => Object.keys(value).length > 0,
  { message: 'At least one permission must be provided.' },
)

export const rosterListSchema = z.object({
  ...pagination,
  memberType: z.enum(['STUDENT', 'STAFF']).optional(),
  enrollmentStatus: z.enum(['ACTIVE', 'GRADUATED', 'SUSPENDED', 'WITHDRAWN', 'UNKNOWN']).optional(),
  sortBy: z.enum(['importedAt', 'email', 'memberType', 'enrollmentStatus']).default('importedAt'),
}).strict()

export const rosterExportSchema = rosterListSchema.omit({ page: true, pageSize: true })

export const rosterStatusSchema = z.object({
  enrollmentStatus: z.enum(['ACTIVE', 'GRADUATED', 'SUSPENDED', 'WITHDRAWN', 'UNKNOWN']),
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict().refine(value => !value.validFrom || !value.validUntil || value.validFrom <= value.validUntil, {
  path: ['validUntil'],
  message: 'validUntil must be on or after validFrom.',
})

export const importIdSchema = z.object({ id: z.string().uuid() }).strict()

export const importListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['PREVIEWED', 'COMMITTING', 'COMMITTED', 'FAILED']).optional(),
}).strict()
