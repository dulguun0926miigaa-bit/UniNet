import { describe, expect, it } from 'vitest'
import { parseIdempotencyKey, requestFingerprint } from '../src/middleware/idempotency.js'

describe('idempotency request identity', () => {
  it('creates the same fingerprint regardless of JSON object key order', () => {
    const first = requestFingerprint({ method: 'post', path: '/api/student/events/1/registration', body: { consent: true, nested: { b: 2, a: 1 } } })
    const second = requestFingerprint({ method: 'POST', path: '/api/student/events/1/registration', body: { nested: { a: 1, b: 2 }, consent: true } })
    expect(first).toBe(second)
  })

  it('binds the fingerprint to body, method and exact resource path', () => {
    const base = requestFingerprint({ method: 'POST', path: '/api/student/events/1/registration', body: { consent: true } })
    expect(requestFingerprint({ method: 'POST', path: '/api/student/events/2/registration', body: { consent: true } })).not.toBe(base)
    expect(requestFingerprint({ method: 'POST', path: '/api/student/events/1/registration', body: { consent: false } })).not.toBe(base)
    expect(requestFingerprint({ method: 'PATCH', path: '/api/student/events/1/registration', body: { consent: true } })).not.toBe(base)
  })

  it('accepts UUID-like keys and rejects missing, short or unsafe keys', () => {
    expect(parseIdempotencyKey('018f4fd1-9720-7b24-8a2d-9e44f5075061')).toContain('-')
    for (const value of [undefined, 'short', 'contains whitespace here', '<script>123456789']) {
      expect(() => parseIdempotencyKey(value)).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_KEY_INVALID' }))
    }
  })
})
