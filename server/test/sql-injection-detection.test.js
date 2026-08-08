import { describe, expect, it } from 'vitest'
import { findSuspiciousSqlInput } from '../src/security/sql-injection-detection.js'

describe('SQL injection request detection', () => {
  it('allows ordinary university search text', () => {
    expect(findSuspiciousSqlInput({ search: 'Мэдээллийн технологийн сургууль' })).toBeNull()
    expect(findSuspiciousSqlInput({ description: 'Research and innovation' })).toBeNull()
  })

  it.each([
    "' UNION SELECT password FROM users --",
    "1 OR 1=1",
    "; DROP TABLE users",
    "pg_sleep(10)",
    "information_schema.tables",
  ])('detects a suspicious signature: %s', value => {
    expect(findSuspiciousSqlInput({ query: { search: value } })).toMatchObject({ path: 'request.query.search' })
  })
})
