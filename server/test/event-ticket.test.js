import { describe, expect, it, vi } from 'vitest'
import { createEventTicket, verifyEventTicket } from '../src/tickets/event-ticket.js'

const source = {
  registrationId: '11111111-1111-4111-8111-111111111111',
  contentId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
  registrationCode: 'UNI-1234567890ABCDEF1234567890ABCDEF',
}

describe('event QR ticket signatures', () => {
  it('round-trips a signed, time-bounded ticket', () => {
    const token = createEventTicket({ ...source, expiresAt: new Date(Date.now() + 60_000) })
    expect(verifyEventTicket(token)).toMatchObject(source)
  })

  it('issues a unique QR token on every ticket request', () => {
    const expiresAt = new Date(Date.now() + 60_000)
    const first = createEventTicket({ ...source, expiresAt })
    const second = createEventTicket({ ...source, expiresAt })
    expect(second).not.toBe(first)
    expect(verifyEventTicket(second).jti).not.toBe(verifyEventTicket(first).jti)
  })

  it('rejects payload and signature tampering', () => {
    const token = createEventTicket({ ...source, expiresAt: new Date(Date.now() + 60_000) })
    const [payload, signature] = token.split('.')
    const replacement = payload.endsWith('A') ? 'B' : 'A'
    expect(() => verifyEventTicket(`${payload.slice(0, -1)}${replacement}.${signature}`)).toThrowError(expect.objectContaining({ code: 'EVENT_TICKET_SIGNATURE_INVALID' }))
    const signatureReplacement = signature.endsWith('A') ? 'B' : 'A'
    expect(() => verifyEventTicket(`${payload}.${signature.slice(0, -1)}${signatureReplacement}`)).toThrowError(expect.objectContaining({ code: 'EVENT_TICKET_SIGNATURE_INVALID' }))
  })

  it('rejects an expired ticket', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T00:00:00Z'))
    const token = createEventTicket({ ...source, expiresAt: new Date('2026-07-27T00:01:00Z') })
    vi.setSystemTime(new Date('2026-07-27T00:02:00Z'))
    expect(() => verifyEventTicket(token)).toThrowError(expect.objectContaining({ code: 'EVENT_TICKET_EXPIRED' }))
    vi.useRealTimers()
  })
})
