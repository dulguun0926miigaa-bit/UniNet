import { describe, expect, it } from 'vitest'
import { contentInput } from '../src/operations/operations.routes.js'

const baseContent = {
  title: 'Career networking evening',
  shortDescription: 'Students and employers meet.',
  description: 'A scheduled university networking event.',
  type: 'EVENT',
}

describe('event schedule validation', () => {
  it('requires both start and end date-time values for every event, including drafts', () => {
    expect(contentInput.safeParse(baseContent).success).toBe(false)
    expect(contentInput.safeParse({ ...baseContent, startsAt: '2026-08-20T09:00:00+08:00' }).success).toBe(false)
  })

  it('rejects an end date-time that is not after the start date-time', () => {
    const result = contentInput.safeParse({
      ...baseContent,
      startsAt: '2026-08-20T10:00:00+08:00',
      endsAt: '2026-08-20T09:00:00+08:00',
    })
    expect(result.success).toBe(false)
    expect(result.error.issues.some(issue => issue.path[0] === 'endsAt')).toBe(true)
  })

  it('normalizes valid event date-times to Date objects', () => {
    const result = contentInput.parse({
      ...baseContent,
      startsAt: '2026-08-20T09:00:00+08:00',
      endsAt: '2026-08-20T11:30:00+08:00',
    })
    expect(result.startsAt).toBeInstanceOf(Date)
    expect(result.endsAt.getTime()).toBeGreaterThan(result.startsAt.getTime())
  })
})
