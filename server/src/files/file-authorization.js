export function canDownloadFile(user, asset) {
  if (!user || !asset) return false
  if (asset.ownerId === user.id) return true
  if (user.role === 'PLATFORM_SUPER_ADMIN') return true
  const sameTenant = Boolean(asset.universityId && asset.universityId === user.universityId)
  const linkedApplication = asset.applications?.some(application => (
    application.consentGranted
    && application.status !== 'WITHDRAWN'
    && application.content?.universityId === user.universityId
    && (user.role !== 'STAFF' || application.content?.createdById === user.id)
  ))
  if (user.role === 'UNIVERSITY_ADMIN') return sameTenant || Boolean(linkedApplication)
  if (user.role === 'STAFF' && asset.purpose === 'STUDENT_CV') {
    return Boolean(user.staffProfile?.canManageApplications && linkedApplication)
  }
  return false
}

export function canDeleteFile(user, asset) {
  return Boolean(user && asset && asset.ownerId === user.id && user.role === 'STUDENT')
}
