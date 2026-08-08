import { describe, expect, it } from 'vitest'
import { CANONICAL_GOOGLE_ISSUER, isAllowedGoogleRedirectUri, validateGoogleIdentityClaims } from '../src/auth/google-oauth.security.js'

const baseIdentity = {
  iss: 'https://accounts.google.com',
  aud: 'client-id.apps.googleusercontent.com',
  sub: 'google-subject-123',
  nonce: 'expected-nonce',
  exp: Math.floor(Date.now() / 1000) + 300,
  email_verified: 'true',
  email: 'Student@Gmail.com',
  given_name: 'Test',
  family_name: 'Student',
}

describe('Google OIDC claim validation', () => {
  it('accepts Google issuer, audience, expiry, verified email and nonce together', () => {
    expect(validateGoogleIdentityClaims(baseIdentity, {
      clientId: baseIdentity.aud,
      expectedNonce: baseIdentity.nonce,
    })).toMatchObject({
      issuer: CANONICAL_GOOGLE_ISSUER,
      subject: baseIdentity.sub,
      email: 'student@gmail.com',
    })
  })

  it.each([
    ['issuer', { iss: 'https://evil.example' }],
    ['audience', { aud: 'other-client' }],
    ['nonce', { nonce: 'replayed-nonce' }],
    ['verified email', { email_verified: 'false' }],
    ['expiry', { exp: Math.floor(Date.now() / 1000) - 300 }],
  ])('rejects invalid %s', (_name, patch) => {
    expect(() => validateGoogleIdentityClaims({ ...baseIdentity, ...patch }, {
      clientId: baseIdentity.aud,
      expectedNonce: baseIdentity.nonce,
      clockSkewSeconds: 0,
    })).toThrowError(expect.objectContaining({ code: 'GOOGLE_IDENTITY_INVALID' }))
  })

  it('uses an exact configured redirect URI rather than an open redirect', () => {
    const configured = 'http://localhost:4000/api/auth/google/callback'
    expect(isAllowedGoogleRedirectUri(configured, configured)).toBe(true)
    expect(isAllowedGoogleRedirectUri('http://localhost:4000/api/auth/google/callback?next=https://evil.example', configured)).toBe(false)
    expect(isAllowedGoogleRedirectUri('https://evil.example/callback', configured)).toBe(false)
  })
})
