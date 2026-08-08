import { describe, expect, it } from 'vitest'
import { sessionIdleExpired, shouldTouchSession } from '../src/auth/session-policy.js'

describe('session idle policy', () => {
  const now = new Date('2026-08-03T06:00:00.000Z')

  it('expires a session after the configured inactivity window', () => {
    expect(sessionIdleExpired({ lastUsedAt: new Date('2026-08-03T05:00:00.000Z') }, now, 30)).toBe(true)
    expect(sessionIdleExpired({ lastUsedAt: new Date('2026-08-03T05:45:00.000Z') }, now, 30)).toBe(false)
  })

  it('touches session activity at a bounded interval instead of every request', () => {
    expect(shouldTouchSession({ lastUsedAt: new Date('2026-08-03T05:54:00.000Z') }, now, 5)).toBe(true)
    expect(shouldTouchSession({ lastUsedAt: new Date('2026-08-03T05:58:00.000Z') }, now, 5)).toBe(false)
  })
})
