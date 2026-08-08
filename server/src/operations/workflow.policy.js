import { AppError } from '../utils/app-error.js'
import { assertPermission, assertTenantAccess } from '../authorization/policy.js'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

export const applicationTransitions = Object.freeze({
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
})

export function assertApplicationTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return
  if (!applicationTransitions[fromStatus]?.includes(toStatus)) {
    throw new AppError(
      `${fromStatus} төлвөөс ${toStatus} төлөв рүү шилжих боломжгүй.`,
      409,
      'APPLICATION_STATUS_TRANSITION_INVALID',
    )
  }
}

export function managedContentScope(user, permission, contentTypes) {
  assertPermission(user, permission, {
    code: permission === 'canManageRegistrations' ? 'REGISTRATION_MANAGE_FORBIDDEN' : 'APPLICATION_MANAGE_FORBIDDEN',
    message: permission === 'canManageRegistrations'
      ? 'Арга хэмжээний бүртгэл удирдах зөвшөөрөл алга.'
      : 'Өргөдөл удирдах зөвшөөрөл алга.',
  })
  const base = {
    type: { in: contentTypes },
    ...(user.role === 'PLATFORM_SUPER_ADMIN' ? {} : { universityId: user.universityId ?? ZERO_UUID }),
  }
  return user.role === 'STAFF' ? { ...base, createdById: user.id } : base
}

export function assertManagedContentAccess(user, content, permission) {
  assertPermission(user, permission, {
    code: permission === 'canManageRegistrations' ? 'REGISTRATION_MANAGE_FORBIDDEN' : 'APPLICATION_MANAGE_FORBIDDEN',
    message: permission === 'canManageRegistrations'
      ? 'Арга хэмжээний бүртгэл удирдах зөвшөөрөл алга.'
      : 'Өргөдөл удирдах зөвшөөрөл алга.',
  })
  assertTenantAccess(user, content.universityId)
  if (user.role === 'STAFF' && content.createdById !== user.id) {
    throw new AppError(
      'Өөр Staff-ийн үүсгэсэн контентын бүртгэл эсвэл өргөдөлд хандах эрхгүй.',
      403,
      'RESOURCE_OWNERSHIP_DENIED',
    )
  }
}

export function toRegistrationApiStatus(status) {
  return status === 'CONFIRMED' ? 'REGISTERED' : status
}

export function toRegistrationDatabaseStatus(status) {
  return status === 'REGISTERED' ? 'CONFIRMED' : status
}
