import { describe, expect, it } from 'vitest'
import { parseRosterCsv, rosterHeaders, rosterTemplateCsv } from '../src/memberships/roster-import.js'

const header = rosterHeaders.join(',')
const validRow = 'student@num.edu.mn,STUDENT,S001,,Bat,Dorj,ACTIVE,Engineering,Software Engineering,2028,2026-09-01,2028-06-30'

describe('university roster CSV validation', () => {
  it('ships an exact, spreadsheet-safe CSV template', () => {
    const template = rosterTemplateCsv()
    expect(template.startsWith('\uFEFF')).toBe(true)
    expect(template).toContain(header)
    expect(template).toContain('STUDENT')
  })

  it('previews a valid active-domain student row for insert', () => {
    const result = parseRosterCsv(`${header}\n${validRow}`, { activeDomains: ['num.edu.mn'] })
    expect(result).toMatchObject({ totalRows: 1, errors: [] })
    expect(result.rows[0]).toMatchObject({
      normalizedEmail: 'student@num.edu.mn', memberType: 'STUDENT', action: 'INSERT', studentId: 'S001',
    })
  })

  it('rejects formula injection, wrong domains and duplicate rows without committing them', () => {
    const malicious = 'bad-email,STAFF,,E001,=cmd|\'/C calc\'!A0,Dorj,ACTIVE,,,,,\nstudent@other.edu.mn,STUDENT,S001,,Bat,Dorj,ACTIVE,,,,,\nstudent@other.edu.mn,STUDENT,S002,,Bat,Dorj,ACTIVE,,,,,'
    const result = parseRosterCsv(`${header}\n${malicious}`, { activeDomains: ['num.edu.mn'] })
    expect(result.rows).toHaveLength(0)
    expect(result.errors.map(error => error.code)).toEqual(expect.arrayContaining([
      'CSV_FORMULA_REJECTED', 'EMAIL_INVALID', 'DOMAIN_MISMATCH', 'DUPLICATE_IN_FILE',
    ]))
  })

  it('detects a roster ID claimed by a different email', () => {
    const result = parseRosterCsv(`${header}\nstudent@num.edu.mn,STUDENT,S001,,Bat,Dorj,ACTIVE,,,,,`, {
      activeDomains: ['num.edu.mn'],
      existingMembers: [{ normalizedEmail: 'other@num.edu.mn', studentId: 'S001', employeeCode: null }],
    })
    expect(result.errors.some(error => error.code === 'ROSTER_ID_CONFLICT')).toBe(true)
  })
})
