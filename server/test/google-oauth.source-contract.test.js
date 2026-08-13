import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const service = readFileSync(new URL('../src/auth/google-oauth.service.js', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../src/auth/auth.routes.js', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')

describe('Google OAuth account ownership source contract', () => {
  it('uses issuer plus provider subject and gates email prelinks through an explicit allowlist', () => {
    expect(service).toContain('where: { googleIssuer: identity.googleIssuer, googleId: identity.googleId }')
    expect(service).toContain('findUserByGoogleIdentity(identity.googleIssuer, identity.googleId)')
    expect(service).toContain('resolveGoogleAccountPrelink(identity.gmail)')
    expect(service).toContain("user.role !== 'STAFF' || user.status !== 'ACTIVE'")
    expect(schema).toMatch(/@@unique\(\[googleIssuer, googleId\]\)/)
  })

  it('requires password re-authentication for existing Student linking', () => {
    expect(service).toContain("mode === 'LINK_EXISTING'")
    expect(service).toContain('verifyPassword(existing.passwordHash, password)')
    expect(service).toContain("existing.role !== 'STUDENT'")
    expect(service).toContain('OAUTH_LINK_CREDENTIALS_INVALID')
  })

  it('rejects duplicate provider and account ownership conflicts', () => {
    expect(service).toContain('GOOGLE_ACCOUNT_ALREADY_USED')
    expect(service).toContain('OAUTH_ACCOUNT_ALREADY_LINKED')
  })

  it('supports authenticated unlink with re-authentication, session revocation and audit', () => {
    expect(routes).toContain("router.post('/google/unlink'")
    expect(routes).toContain('currentPassword: z.string().min(1).max(200)')
    expect(service).toContain('verifyPassword(user.passwordHash')
    expect(service).toContain("authProvider: 'PASSWORD'")
    expect(service).toContain('session.updateMany')
    expect(service).toContain('GOOGLE_OAUTH_ACCOUNT_UNLINKED')
  })
})
