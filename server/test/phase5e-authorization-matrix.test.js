import { describe, expect, it } from 'vitest'
import {
  assertContentManagement,
  assertPermission,
  assertTenantAccess,
  contentManagementScope,
  surveyManagementScope,
  tenantScope,
} from '../src/authorization/policy.js'
import { assertManagedContentAccess, managedContentScope } from '../src/operations/workflow.policy.js'

const user = (role, universityId = 'tenant-a', permissions = {}, id = `${role.toLowerCase()}-a`) => ({
  id, role, universityId, staffProfile: permissions,
})

const matrix = [
  { name: 'Student cannot manage content', actor: user('STUDENT'), run: actor => assertContentManagement(actor, { universityId: 'tenant-a', createdById: 'staff-a' }, 'read'), allowed: false },
  { name: 'Staff creator can edit own content', actor: user('STAFF', 'tenant-a', { canCreateContent: true }, 'staff-a'), run: actor => assertContentManagement(actor, { universityId: 'tenant-a', createdById: 'staff-a' }, 'edit'), allowed: true },
  { name: 'Staff cannot edit peer content', actor: user('STAFF', 'tenant-a', { canCreateContent: true }, 'staff-a'), run: actor => assertContentManagement(actor, { universityId: 'tenant-a', createdById: 'staff-b' }, 'edit'), allowed: false },
  { name: 'Publisher can review tenant content', actor: user('STAFF', 'tenant-a', { canPublish: true }, 'publisher-a'), run: actor => assertContentManagement(actor, { universityId: 'tenant-a', createdById: 'staff-b' }, 'status', 'APPROVED'), allowed: true },
  { name: 'Publisher cannot cross tenant', actor: user('STAFF', 'tenant-a', { canPublish: true }, 'publisher-a'), run: actor => assertContentManagement(actor, { universityId: 'tenant-b', createdById: 'staff-b' }, 'status', 'APPROVED'), allowed: false },
  { name: 'University Admin can manage tenant registration', actor: user('UNIVERSITY_ADMIN'), run: actor => assertManagedContentAccess(actor, { universityId: 'tenant-a', createdById: 'staff-b' }, 'canManageRegistrations'), allowed: true },
  { name: 'University Admin cannot manage foreign application', actor: user('UNIVERSITY_ADMIN'), run: actor => assertManagedContentAccess(actor, { universityId: 'tenant-b', createdById: 'staff-b' }, 'canManageApplications'), allowed: false },
  { name: 'Staff registration manager can manage own event', actor: user('STAFF', 'tenant-a', { canManageRegistrations: true }, 'staff-a'), run: actor => assertManagedContentAccess(actor, { universityId: 'tenant-a', createdById: 'staff-a' }, 'canManageRegistrations'), allowed: true },
  { name: 'Staff registration manager cannot manage peer event', actor: user('STAFF', 'tenant-a', { canManageRegistrations: true }, 'staff-a'), run: actor => assertManagedContentAccess(actor, { universityId: 'tenant-a', createdById: 'staff-b' }, 'canManageRegistrations'), allowed: false },
  { name: 'Platform Super Admin can cross tenant', actor: user('PLATFORM_SUPER_ADMIN', null), run: actor => assertTenantAccess(actor, 'tenant-b'), allowed: true },
]

describe('Phase 5E critical role × permission × tenant matrix', () => {
  for (const entry of matrix) {
    it(entry.name, () => {
      if (entry.allowed) expect(() => entry.run(entry.actor)).not.toThrow()
      else expect(() => entry.run(entry.actor)).toThrow()
    })
  }

  it('fails closed for missing tenant and unknown permissions', () => {
    expect(tenantScope(user('STAFF', null))).toEqual({ universityId: '00000000-0000-0000-0000-000000000000' })
    expect(() => assertTenantAccess(user('UNIVERSITY_ADMIN', null), null)).toThrow()
    expect(() => assertPermission(user('STAFF', 'tenant-a', { madeUp: true }), 'madeUp')).toThrow()
  })

  it('builds creator and tenant scopes without trusting frontend role guards', () => {
    expect(contentManagementScope(user('STAFF', 'tenant-a', { canCreateContent: true }, 'staff-a'))).toEqual({ universityId: 'tenant-a', createdById: 'staff-a' })
    expect(surveyManagementScope(user('STAFF', 'tenant-a', { canManageSurveys: true }, 'staff-a'), 'survey-a')).toEqual({ id: 'survey-a', universityId: 'tenant-a', createdById: 'staff-a' })
    expect(managedContentScope(user('STAFF', 'tenant-a', { canManageApplications: true }, 'staff-a'), 'canManageApplications', ['JOB', 'INTERNSHIP'])).toEqual({ type: { in: ['JOB', 'INTERNSHIP'] }, universityId: 'tenant-a', createdById: 'staff-a' })
  })
})
