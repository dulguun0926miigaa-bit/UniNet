import { describe, expect, it } from 'vitest'
import {
  assertContentManagement,
  hasPermission,
  publishedContentAudienceScope,
  publishedSurveyAudienceScope,
  surveyManagementScope,
  surveyReportScope,
} from '../src/authorization/policy.js'

const staff = permissions => ({ id: 'staff-a', role: 'STAFF', universityId: 'university-a', staffProfile: permissions })

describe('central authorization policy', () => {
  it('denies unknown permissions and requires an explicit Staff permission', () => {
    expect(hasPermission(staff({ canManageSurveys: true }), 'canManageSurveys')).toBe(true)
    expect(hasPermission(staff({ canManageSurveys: false }), 'canManageSurveys')).toBe(false)
    expect(hasPermission(staff({ canManageSurveys: true }), 'madeUpPermission')).toBe(false)
  })

  it('limits survey audience to explicit public/network, own-private, and active partner scopes', async () => {
    const database = {
      partnership: {
        findMany: async () => [{ requesterUniversityId: 'university-a', partnerUniversityId: 'university-b' }],
      },
    }
    expect(await publishedSurveyAudienceScope(database, { role: 'STUDENT', universityId: 'university-a' })).toEqual({
      OR: [
        { visibility: { in: ['PUBLIC', 'NETWORK'] } },
        { visibility: 'PRIVATE', universityId: 'university-a' },
        { visibility: 'PARTNERS', universityId: { in: ['university-b'] } },
      ],
    })
    expect(await publishedSurveyAudienceScope(database, { role: 'STUDENT', universityId: null })).toEqual({ visibility: 'PUBLIC' })
  })

  it('keeps Staff survey management and reporting creator-scoped inside the tenant', () => {
    const actor = staff({ canManageSurveys: true, canViewReports: true })
    expect(surveyManagementScope(actor, 'survey-a')).toEqual({
      id: 'survey-a',
      universityId: 'university-a',
      createdById: 'staff-a',
    })
    expect(surveyReportScope(actor, 'survey-a')).toEqual({
      id: 'survey-a',
      universityId: 'university-a',
      createdById: 'staff-a',
    })
  })

  it('allows Staff creators to edit only their own content and keeps publication privileged', () => {
    const creator = staff({ canCreateContent: true, canPublish: false })
    expect(() => assertContentManagement(creator, { universityId: 'university-a', createdById: 'staff-a' }, 'edit')).not.toThrow()
    expect(() => assertContentManagement(creator, { universityId: 'university-a', createdById: 'staff-b' }, 'edit')).toThrow(/эрх|permission|access/i)
    expect(() => assertContentManagement(creator, { universityId: 'university-a', createdById: 'staff-a' }, 'status', 'PUBLISHED')).toThrow()
  })

  it('includes a partner university only for explicitly partner-visible published content', async () => {
    const database = {
      partnership: {
        findMany: async () => [{ requesterUniversityId: 'university-a', partnerUniversityId: 'university-b' }],
      },
    }
    const scope = await publishedContentAudienceScope(database, { role: 'STUDENT', universityId: 'university-a' })
    expect(scope).toMatchObject({ status: 'PUBLISHED' })
    expect(scope.OR).toEqual(expect.arrayContaining([
      { visibility: { in: ['PUBLIC', 'NETWORK'] } },
      { universityId: 'university-a' },
      { visibility: 'PARTNERS', universityId: { in: ['university-b'] } },
    ]))
  })
})

it('gives publishing Staff tenant-wide review scope but keeps creator-only edit scope', () => {
  const publisher = staff({ canCreateContent: false, canPublish: true })
  expect(() => assertContentManagement(
    publisher,
    { universityId: 'university-a', createdById: 'staff-b' },
    'status',
    'APPROVED',
  )).not.toThrow()
  expect(() => assertContentManagement(
    publisher,
    { universityId: 'university-b', createdById: 'staff-b' },
    'status',
    'APPROVED',
  )).toThrow()
})
