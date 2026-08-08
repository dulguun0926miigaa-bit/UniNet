import { describe, expect, it } from 'vitest'
import { assertTrustedOrigin, refreshCookieName, refreshCookieOptions } from '../src/auth/auth.routes.js'

const requestWithOrigin = origin => ({ get: header => header === 'origin' ? origin : undefined })

describe('refresh cookie security', () => {
  it('uses an HttpOnly, strict same-site, auth-scoped cookie', () => {
    expect(refreshCookieName).toBe('uninet.refresh')
    expect(refreshCookieOptions).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: '/api/auth',
    })
  })

  it('allows configured/no origin and rejects cross-site refresh attempts', () => {
    expect(() => assertTrustedOrigin(requestWithOrigin(undefined))).not.toThrow()
    expect(() => assertTrustedOrigin(requestWithOrigin('http://localhost:5173'))).not.toThrow()
    expect(() => assertTrustedOrigin(requestWithOrigin('https://attacker.example'))).toThrowError(/origin/)
  })
})
