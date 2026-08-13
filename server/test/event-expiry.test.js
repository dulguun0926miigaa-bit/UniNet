import { describe, expect, it } from 'vitest'
import { activeContentWhere, DEFAULT_EVENT_TICKET_DURATION_MS, eventTicketExpiresAt } from '../src/utils/event-expiry.js'

describe('event expiry policy', () => {
  it('uses endsAt first and otherwise gives a dated event a 24-hour ticket window', () => {
    const startsAt = new Date('2026-08-13T02:00:00.000Z')
    const endsAt = new Date('2026-08-13T05:00:00.000Z')
    expect(eventTicketExpiresAt({ startsAt, endsAt })).toEqual(endsAt)
    expect(eventTicketExpiresAt({ startsAt })).toEqual(new Date(startsAt.getTime() + DEFAULT_EVENT_TICKET_DURATION_MS))
    expect(eventTicketExpiresAt({})).toBeNull()
  })

  it('builds a content filter that excludes events after their ticket window', () => {
    const now = new Date('2026-08-13T08:00:00.000Z')
    const where = activeContentWhere(now)
    expect(where.OR).toContainEqual({ type: 'EVENT', endsAt: { gt: now } })
    expect(where.OR).toContainEqual({
      type: 'EVENT',
      endsAt: null,
      startsAt: { gt: new Date(now.getTime() - DEFAULT_EVENT_TICKET_DURATION_MS) },
    })
  })
})
