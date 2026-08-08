import { describe, expect, it } from 'vitest'
import {
  applicationTransitions,
  assertApplicationTransition,
  assertManagedContentAccess,
  managedContentScope,
  toRegistrationApiStatus,
  toRegistrationDatabaseStatus,
} from '../src/operations/workflow.policy.js'

const staff = (permissions = {}) => ({
  id: 'staff-a',
  role: 'STAFF',
  universityId: 'university-a',
  staffProfile: permissions,
})

describe('registration/application management policy', () => {
  it('maps CONFIRMED storage status to the REGISTERED API vocabulary', () => {
    expect(toRegistrationApiStatus('CONFIRMED')).toBe('REGISTERED')
    expect(toRegistrationDatabaseStatus('REGISTERED')).toBe('CONFIRMED')
    expect(toRegistrationApiStatus('WAITLISTED')).toBe('WAITLISTED')
  })

  it('scopes Staff management to their own content inside their tenant', () => {
    expect(managedContentScope(staff({ canManageApplications: true }), 'canManageApplications', ['JOB'])).toEqual({
      type: { in: ['JOB'] },
      universityId: 'university-a',
      createdById: 'staff-a',
    })
  })

  it('denies another Staff member content even when both are in the same tenant', () => {
    const actor = staff({ canManageApplications: true })
    expect(() => assertManagedContentAccess(actor, {
      universityId: 'university-a',
      createdById: 'staff-b',
    }, 'canManageApplications')).toThrow(/Өөр Staff|ownership|эрх/i)
  })

  it('allows University Admin tenant-wide access but denies another tenant', () => {
    const admin = { id: 'admin-a', role: 'UNIVERSITY_ADMIN', universityId: 'university-a' }
    expect(() => assertManagedContentAccess(admin, { universityId: 'university-a', createdById: 'staff-b' }, 'canManageRegistrations')).not.toThrow()
    expect(() => assertManagedContentAccess(admin, { universityId: 'university-b', createdById: 'staff-b' }, 'canManageRegistrations')).toThrow()
  })

  it('enforces the linear review-shortlist-decision state machine', () => {
    expect(applicationTransitions.SUBMITTED).toEqual(['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'])
    expect(() => assertApplicationTransition('SUBMITTED', 'UNDER_REVIEW')).not.toThrow()
    expect(() => assertApplicationTransition('UNDER_REVIEW', 'SHORTLISTED')).not.toThrow()
    expect(() => assertApplicationTransition('SHORTLISTED', 'ACCEPTED')).not.toThrow()
    expect(() => assertApplicationTransition('SUBMITTED', 'ACCEPTED')).toThrow(/шилжих боломжгүй/i)
    expect(() => assertApplicationTransition('ACCEPTED', 'REJECTED')).toThrow(/шилжих боломжгүй/i)
  })
})
