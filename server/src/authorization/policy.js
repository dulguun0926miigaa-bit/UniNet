import { AppError } from '../utils/app-error.js'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const ADMIN_ROLES = new Set(['UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'])
const STAFF_PERMISSIONS = new Set([
  'canCreateContent',
  'canPublish',
  'canManageRegistrations',
  'canManageApplications',
  'canManageSurveys',
  'canViewReports',
])

/**
 * Deny-by-default permission lookup. University and platform administrators have
 * the fixed administrative permission set; Staff need the explicit profile flag.
 * Unknown permission names never grant access.
 *
 * @param {import('@prisma/client').User & { staffProfile?: import('@prisma/client').StaffProfile | null }} user
 * @param {string} permission
 */
export function hasPermission(user, permission) {
  if (!STAFF_PERMISSIONS.has(permission)) return false
  if (ADMIN_ROLES.has(user?.role)) return true
  return user?.role === 'STAFF' && user.staffProfile?.[permission] === true
}

/**
 * @param {import('@prisma/client').User & { staffProfile?: import('@prisma/client').StaffProfile | null }} user
 * @param {string} permission
 * @param {{ code?: string, message?: string }} [options]
 */
export function assertPermission(user, permission, options = {}) {
  if (!hasPermission(user, permission)) {
    throw new AppError(
      options.message ?? 'Шаардлагатай зөвшөөрөл алга.',
      403,
      options.code ?? 'PERMISSION_DENIED',
    )
  }
}

/**
 * A non-platform actor must always have a tenant and it must exactly match the
 * resource tenant. Null === null is intentionally not treated as authorization.
 *
 * @param {import('@prisma/client').User} user
 * @param {string | null | undefined} resourceUniversityId
 */
export function assertTenantAccess(user, resourceUniversityId) {
  if (user?.role === 'PLATFORM_SUPER_ADMIN') return
  if (!user?.universityId || !resourceUniversityId || user.universityId !== resourceUniversityId) {
    throw new AppError('Өөр сургуулийн өгөгдөлд хандах эрхгүй.', 403, 'TENANT_ACCESS_DENIED')
  }
}

/**
 * Mandatory tenant query scope. The all-zero UUID is a safe no-match scope for
 * malformed non-platform identities, keeping reads fail-closed.
 *
 * @param {import('@prisma/client').User} user
 * @returns {{ universityId?: string }}
 */
export function tenantScope(user) {
  if (user?.role === 'PLATFORM_SUPER_ADMIN') return {}
  return { universityId: user?.universityId ?? ZERO_UUID }
}

/**
 * @param {import('@prisma/client').User & { staffProfile?: import('@prisma/client').StaffProfile | null }} user
 * @returns {import('@prisma/client').Prisma.ContentWhereInput}
 */
export function contentManagementScope(user) {
  const tenant = tenantScope(user)
  if (user?.role !== 'STAFF') return tenant
  if (hasPermission(user, 'canPublish')) return tenant
  if (hasPermission(user, 'canCreateContent')) return { ...tenant, createdById: user.id }
  return { ...tenant, id: ZERO_UUID }
}

/**
 * @param {import('@prisma/client').User & { staffProfile?: import('@prisma/client').StaffProfile | null }} user
 * @param {{ universityId?: string | null, createdById?: string | null }} content
 * @param {'read' | 'edit' | 'delete' | 'status'} action
 * @param {string} [targetStatus]
 */
export function assertContentManagement(user, content, action, targetStatus) {
  assertTenantAccess(user, content.universityId)
  if (ADMIN_ROLES.has(user.role)) return
  if (user.role !== 'STAFF') {
    throw new AppError('Контент удирдах эрхгүй.', 403, 'CONTENT_ACCESS_FORBIDDEN')
  }

  const ownsContent = content.createdById === user.id
  const canCreate = hasPermission(user, 'canCreateContent')
  const canPublish = hasPermission(user, 'canPublish')
  if (action === 'read' && (canPublish || (canCreate && ownsContent))) return
  if ((action === 'edit' || action === 'delete') && canCreate && ownsContent) return
  if (action === 'status') {
    if (['DRAFT', 'PENDING_APPROVAL'].includes(targetStatus ?? '') && canCreate && ownsContent) return
    if (canPublish && ['APPROVED', 'PUBLISHED', 'CHANGES_REQUESTED', 'REJECTED', 'ARCHIVED', 'EXPIRED'].includes(targetStatus ?? '')) return
  }

  const code = action === 'read'
    ? 'CONTENT_ACCESS_FORBIDDEN'
    : action === 'edit'
      ? 'CONTENT_UPDATE_FORBIDDEN'
      : action === 'delete'
        ? 'CONTENT_DELETE_FORBIDDEN'
        : 'CONTENT_STATUS_FORBIDDEN'
  throw new AppError('Контент дээр энэ үйлдлийг хийх эрхгүй.', 403, code)
}

/**
 * Survey management is tenant-scoped. Staff may only manage surveys they
 * created; University Admins may manage their tenant; Platform Super Admins
 * may manage the full network.
 *
 * @param {import('@prisma/client').User} user
 * @param {string} [id]
 * @returns {import('@prisma/client').Prisma.SurveyWhereInput}
 */
export function surveyManagementScope(user, id) {
  const where = id ? { id } : {}
  if (user?.role === 'PLATFORM_SUPER_ADMIN') return where
  const scoped = { ...where, universityId: user?.universityId ?? ZERO_UUID }
  return user?.role === 'STAFF' ? { ...scoped, createdById: user.id } : scoped
}

/**
 * Reports use the same object-level ownership boundary as management. A Staff
 * member with canViewReports cannot enumerate another Staff member's survey;
 * tenant administrators can report across their own university.
 *
 * @param {import('@prisma/client').User} user
 * @param {string} [id]
 * @returns {import('@prisma/client').Prisma.SurveyWhereInput}
 */
export function surveyReportScope(user, id) {
  return surveyManagementScope(user, id)
}

/**
 * Build the published-survey audience scope from explicit visibility and
 * currently ACTIVE partnerships. No partner access is inferred from a tenant
 * alone, and malformed tenant identities fail closed.
 *
 * @param {Pick<import('@prisma/client').PrismaClient, 'partnership'>} database
 * @param {import('@prisma/client').User} user
 * @returns {Promise<import('@prisma/client').Prisma.SurveyWhereInput>}
 */
export async function publishedSurveyAudienceScope(database, user) {
  if (user?.role === 'PLATFORM_SUPER_ADMIN') return {}
  if (!user?.universityId) return { visibility: 'PUBLIC' }

  const partnerships = await database.partnership.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { requesterUniversityId: user.universityId },
        { partnerUniversityId: user.universityId },
      ],
    },
    select: { requesterUniversityId: true, partnerUniversityId: true },
  })
  const partnerIds = partnerships.map(partnership => (
    partnership.requesterUniversityId === user.universityId
      ? partnership.partnerUniversityId
      : partnership.requesterUniversityId
  ))

  return {
    OR: [
      { visibility: { in: ['PUBLIC', 'NETWORK'] } },
      { visibility: 'PRIVATE', universityId: user.universityId },
      ...(partnerIds.length
        ? [{ visibility: /** @type {import('@prisma/client').ContentVisibility} */ ('PARTNERS'), universityId: { in: partnerIds } }]
        : []),
    ],
  }
}

/**
 * @param {Pick<import('@prisma/client').PrismaClient, 'partnership'>} database
 * @param {import('@prisma/client').User} user
 * @returns {Promise<import('@prisma/client').Prisma.ContentWhereInput>}
 */
export async function publishedContentAudienceScope(database, user) {
  if (!user?.universityId) return { status: 'PUBLISHED', visibility: 'PUBLIC' }
  const partnerships = await database.partnership.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { requesterUniversityId: user.universityId },
        { partnerUniversityId: user.universityId },
      ],
    },
    select: { requesterUniversityId: true, partnerUniversityId: true },
  })
  const partnerIds = partnerships.map(partnership => (
    partnership.requesterUniversityId === user.universityId
      ? partnership.partnerUniversityId
      : partnership.requesterUniversityId
  ))
  return {
    status: 'PUBLISHED',
    OR: [
      { visibility: { in: ['PUBLIC', 'NETWORK'] } },
      { universityId: user.universityId },
      ...(partnerIds.length ? [{ visibility: /** @type {import('@prisma/client').ContentVisibility} */ ('PARTNERS'), universityId: { in: partnerIds } }] : []),
    ],
  }
}
