import { describe, expect, it } from 'vitest'
import { createEventTicket, EVENT_TICKET_PREFIX, hashEventTicket } from '../src/tickets/event-ticket.js'

const firstRegistrationId = '11111111-1111-4111-8111-111111111111'
const secondRegistrationId = '22222222-2222-4222-8222-222222222222'

describe('database-backed event QR tokens', () => {
  it('returns the same opaque QR token for repeated requests for one registration', () => {
    const first = createEventTicket({ registrationId: firstRegistrationId })
    const second = createEventTicket({ registrationId: firstRegistrationId })

    expect(second).toBe(first)
    expect(first).toMatch(new RegExp(`^${EVENT_TICKET_PREFIX}\\.[A-Za-z0-9_-]{43}$`))
    expect(first).not.toContain(firstRegistrationId)
  })

  it('creates a different token for a different registration', () => {
    expect(createEventTicket({ registrationId: secondRegistrationId }))
      .not.toBe(createEventTicket({ registrationId: firstRegistrationId }))
  })

  it('hashes the scanned token to a stable SHA-256 database key', () => {
    const token = createEventTicket({ registrationId: firstRegistrationId })
    const tokenHash = hashEventTicket(token)

    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(hashEventTicket(token)).toBe(tokenHash)
    expect(tokenHash).not.toContain(token)
  })

  it('rejects random and non-UniNet QR values before lookup', () => {
    for (const token of ['https://example.com/random-qr', 'external-ticket.' + 'x'.repeat(43), '', null]) {
      expect(() => hashEventTicket(token)).toThrowError(expect.objectContaining({ code: 'EVENT_TICKET_INVALID' }))
    }
  })
})
