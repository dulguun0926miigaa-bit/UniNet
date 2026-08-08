import { createHash } from 'node:crypto'
import { z } from 'zod'
import { AppError } from '../utils/app-error.js'
import { isSpreadsheetFormula, parseCsvText } from '../security/csv.js'

export const rosterHeaders = [
  'email',
  'memberType',
  'studentId',
  'employeeCode',
  'firstName',
  'lastName',
  'enrollmentStatus',
  'department',
  'major',
  'graduationYear',
  'validFrom',
  'validUntil',
]

const normalizedHeaders = rosterHeaders.map(value => value.toLowerCase())
const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase())
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function parseDate(value, field, issues) {
  if (!value) return null
  if (!datePattern.test(value)) {
    issues.push({ field, code: 'DATE_INVALID', message: `${field} must use YYYY-MM-DD.` })
    return null
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    issues.push({ field, code: 'DATE_INVALID', message: `${field} is not a valid date.` })
    return null
  }
  return parsed.toISOString()
}

function normalizedNullable(value, maximum, field, issues) {
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maximum) issues.push({ field, code: 'VALUE_TOO_LONG', message: `${field} exceeds ${maximum} characters.` })
  if (isSpreadsheetFormula(normalized)) issues.push({ field, code: 'CSV_FORMULA_REJECTED', message: `${field} starts with a spreadsheet formula marker.` })
  return normalized
}

function fingerprint(values) {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex')
}

export function decodeCsvBuffer(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new AppError('CSV must use UTF-8 encoding.', 422, 'CSV_ENCODING_INVALID')
  }
}

export function parseRosterCsv(text, { activeDomains = [], existingMembers = [] } = {}) {
  const records = parseCsvText(text)
  const [header, ...body] = records
  const receivedHeaders = header.map(value => value.trim().toLowerCase())
  if (
    receivedHeaders.length !== normalizedHeaders.length
    || receivedHeaders.some((value, index) => value !== normalizedHeaders[index])
  ) {
    throw new AppError(
      `CSV header must exactly match: ${rosterHeaders.join(',')}`,
      422,
      'CSV_HEADER_INVALID',
    )
  }

  const domains = new Set(activeDomains.map(value => value.toLowerCase()))
  const existingByEmail = new Map(existingMembers.map(item => [item.normalizedEmail, item]))
  const existingStudentIds = new Map(existingMembers.filter(item => item.studentId).map(item => [item.studentId, item]))
  const existingEmployeeCodes = new Map(existingMembers.filter(item => item.employeeCode).map(item => [item.employeeCode, item]))
  const seenEmails = new Map()
  const seenStudentIds = new Map()
  const seenEmployeeCodes = new Map()
  const rows = []
  const errors = []

  body.forEach((record, bodyIndex) => {
    const rowNumber = bodyIndex + 2
    const values = Object.fromEntries(rosterHeaders.map((name, index) => [name, record[index] ?? '']))
    const issues = []
    if (record.length !== rosterHeaders.length) {
      issues.push({ field: null, code: 'COLUMN_COUNT_INVALID', message: `Expected ${rosterHeaders.length} columns.` })
    }

    let email = ''
    const emailResult = emailSchema.safeParse(values.email)
    if (!emailResult.success) issues.push({ field: 'email', code: 'EMAIL_INVALID', message: 'A valid university email is required.' })
    else {
      email = emailResult.data
      const domain = email.split('@')[1]
      if (!domains.has(domain)) issues.push({ field: 'email', code: 'DOMAIN_MISMATCH', message: 'Email must use an active verified university domain.' })
      if (seenEmails.has(email)) issues.push({ field: 'email', code: 'DUPLICATE_IN_FILE', message: `Email duplicates row ${seenEmails.get(email)}.` })
      else seenEmails.set(email, rowNumber)
    }

    const memberType = values.memberType.trim().toUpperCase()
    if (!['STUDENT', 'STAFF'].includes(memberType)) {
      issues.push({ field: 'memberType', code: 'MEMBER_TYPE_INVALID', message: 'memberType must be STUDENT or STAFF.' })
    }
    const enrollmentStatus = (values.enrollmentStatus.trim() || 'ACTIVE').toUpperCase()
    if (!['ACTIVE', 'GRADUATED', 'SUSPENDED', 'WITHDRAWN', 'UNKNOWN'].includes(enrollmentStatus)) {
      issues.push({ field: 'enrollmentStatus', code: 'STATUS_INVALID', message: 'Enrollment status is invalid.' })
    }

    const studentId = normalizedNullable(values.studentId, 60, 'studentId', issues)
    const employeeCode = normalizedNullable(values.employeeCode, 60, 'employeeCode', issues)
    if (memberType === 'STUDENT' && !studentId) issues.push({ field: 'studentId', code: 'STUDENT_ID_REQUIRED', message: 'studentId is required for STUDENT.' })
    if (memberType === 'STAFF' && !employeeCode) issues.push({ field: 'employeeCode', code: 'EMPLOYEE_CODE_REQUIRED', message: 'employeeCode is required for STAFF.' })
    if (studentId) {
      if (seenStudentIds.has(studentId)) issues.push({ field: 'studentId', code: 'DUPLICATE_IN_FILE', message: `studentId duplicates row ${seenStudentIds.get(studentId)}.` })
      else seenStudentIds.set(studentId, rowNumber)
      const owner = existingStudentIds.get(studentId)
      if (owner && owner.normalizedEmail !== email) issues.push({ field: 'studentId', code: 'ROSTER_ID_CONFLICT', message: 'studentId belongs to another roster email.' })
    }
    if (employeeCode) {
      if (seenEmployeeCodes.has(employeeCode)) issues.push({ field: 'employeeCode', code: 'DUPLICATE_IN_FILE', message: `employeeCode duplicates row ${seenEmployeeCodes.get(employeeCode)}.` })
      else seenEmployeeCodes.set(employeeCode, rowNumber)
      const owner = existingEmployeeCodes.get(employeeCode)
      if (owner && owner.normalizedEmail !== email) issues.push({ field: 'employeeCode', code: 'ROSTER_ID_CONFLICT', message: 'employeeCode belongs to another roster email.' })
    }

    const graduationYearText = values.graduationYear.trim()
    const graduationYear = graduationYearText ? Number(graduationYearText) : null
    if (graduationYearText && (!Number.isInteger(graduationYear) || graduationYear < 1900 || graduationYear > 2100)) {
      issues.push({ field: 'graduationYear', code: 'YEAR_INVALID', message: 'graduationYear must be between 1900 and 2100.' })
    }
    const validFrom = parseDate(values.validFrom.trim(), 'validFrom', issues)
    const validUntil = parseDate(values.validUntil.trim(), 'validUntil', issues)
    if (validFrom && validUntil && validFrom > validUntil) {
      issues.push({ field: 'validUntil', code: 'DATE_RANGE_INVALID', message: 'validUntil must be on or after validFrom.' })
    }

    const row = {
      rowNumber,
      email,
      normalizedEmail: email,
      memberType,
      enrollmentStatus,
      studentId: memberType === 'STUDENT' ? studentId : null,
      employeeCode: memberType === 'STAFF' ? employeeCode : null,
      firstName: normalizedNullable(values.firstName, 80, 'firstName', issues),
      lastName: normalizedNullable(values.lastName, 80, 'lastName', issues),
      department: normalizedNullable(values.department, 160, 'department', issues),
      major: normalizedNullable(values.major, 160, 'major', issues),
      graduationYear: Number.isInteger(graduationYear) ? graduationYear : null,
      validFrom,
      validUntil,
    }
    const existing = email ? existingByEmail.get(email) : null
    row.action = existing ? 'UPDATE' : 'INSERT'
    if (existing && existing.memberType !== memberType) {
      issues.push({ field: 'memberType', code: 'MEMBER_TYPE_CONFLICT', message: 'Existing roster member type cannot be changed by CSV.' })
    }
    if (issues.length) {
      errors.push(...issues.map(issue => ({ ...issue, rowNumber, rowFingerprint: fingerprint(record) })))
    } else {
      rows.push(row)
    }
  })

  if (!body.length) throw new AppError('CSV contains no member rows.', 422, 'CSV_NO_DATA_ROWS')
  return { rows, errors, totalRows: body.length }
}

export function rosterTemplateCsv() {
  return `\uFEFF${rosterHeaders.join(',')}\r\nstudent@example.edu.mn,STUDENT,S001,,Bat,Dorj,ACTIVE,Engineering,Software Engineering,2028,2026-09-01,2028-06-30\r\n`
}
