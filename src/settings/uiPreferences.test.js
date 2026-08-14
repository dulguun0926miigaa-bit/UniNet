import { describe, expect, it } from 'vitest'
import { normalizeUiPreferences, toIsoFromLocalDateTime, toLocalDateTimeInput } from './uiPreferences.js'

describe('UI preferences', () => {
  it('fills missing settings with stable defaults', () => {
    expect(normalizeUiPreferences({ appearance: { theme: 'dark' } })).toMatchObject({
      appearance: { theme: 'dark', density: 'comfortable' },
      locale: { language: 'Монгол', timezone: 'Asia/Ulaanbaatar', dateFormat: 'YYYY.MM.DD', hourFormat: '24' },
    })
  })

  it('round-trips event inputs through the configured Ulaanbaatar timezone', () => {
    const iso = toIsoFromLocalDateTime('2026-08-20T09:30')
    expect(iso).toBe('2026-08-20T01:30:00.000Z')
    expect(toLocalDateTimeInput(iso)).toBe('2026-08-20T09:30')
  })

  it('rejects malformed local date-time input', () => {
    expect(toIsoFromLocalDateTime('not-a-date')).toBeNull()
  })
})
