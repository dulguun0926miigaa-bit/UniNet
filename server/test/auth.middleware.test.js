import { beforeAll, describe, expect, it, vi } from 'vitest'

let createAuthenticate
let signAccessToken

beforeAll(async () => {
  ;({ createAuthenticate } = await import('../src/middleware/authenticate.js'))
  ;({ signAccessToken } = await import('../src/utils/tokens.js'))
})

const user = {
  id: 'user-id',
  universityId: null,
  role: 'STUDENT',
  status: 'ACTIVE',
  university: null,
}

function responseDouble() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  }
  response.status.mockReturnValue(response)
  return response
}

describe('authentication middleware session binding', () => {
  it('accepts an access token only while its bound session is active', async () => {
    const session = {
      id: 'session-id',
      userId: user.id,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    }
    const repository = {
      findSession: vi.fn(async () => session),
      findUserById: vi.fn(async () => user),
    }
    const request = { headers: { authorization: `Bearer ${signAccessToken(user, session.id)}` } }
    const response = responseDouble()
    const next = vi.fn()

    await createAuthenticate(repository)(request, response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(response.status).not.toHaveBeenCalled()
    expect(request.auth).toMatchObject({ user, session, token: { sid: session.id, type: 'access' } })
  })

  it('rejects an admin access token when the session was not MFA-verified', async () => {
    const admin = { ...user, role: 'UNIVERSITY_ADMIN' }
    const session = {
      id: 'admin-session-id', userId: admin.id, revokedAt: null, compromisedAt: null,
      expiresAt: new Date(Date.now() + 60_000), mfaVerifiedAt: null,
    }
    const repository = {
      findSession: vi.fn(async () => session),
      findUserById: vi.fn(async () => admin),
    }
    const request = { headers: { authorization: `Bearer ${signAccessToken(admin, session.id)}` } }
    const response = responseDouble()
    const next = vi.fn()

    await createAuthenticate(repository)(request, response, next)

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(401)
  })

  it('accepts an admin access token only when both token and session carry MFA proof', async () => {
    const admin = { ...user, role: 'UNIVERSITY_ADMIN' }
    const session = {
      id: 'admin-mfa-session-id', userId: admin.id, revokedAt: null, compromisedAt: null,
      expiresAt: new Date(Date.now() + 60_000), mfaVerifiedAt: new Date(),
    }
    const repository = {
      findSession: vi.fn(async () => session),
      findUserById: vi.fn(async () => admin),
    }
    const request = { headers: { authorization: `Bearer ${signAccessToken(admin, session.id, { mfaVerified: true })}` } }
    const response = responseDouble()
    const next = vi.fn()

    await createAuthenticate(repository)(request, response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(request.auth.token.mfa).toBe(true)
  })

  it('rejects an access token immediately after its session is revoked', async () => {
    const session = {
      id: 'session-id',
      userId: user.id,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    }
    const repository = {
      findSession: vi.fn(async () => session),
      findUserById: vi.fn(async () => user),
    }
    const request = { headers: { authorization: `Bearer ${signAccessToken(user, session.id)}` } }
    const response = responseDouble()
    const next = vi.fn()

    await createAuthenticate(repository)(request, response, next)

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(401)
    expect(repository.findUserById).not.toHaveBeenCalled()
  })

  it('rejects every access token in a compromised refresh family', async () => {
    const session = {
      id: 'session-id',
      userId: user.id,
      revokedAt: null,
      compromisedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    }
    const repository = {
      findSession: vi.fn(async () => session),
      findUserById: vi.fn(async () => user),
    }
    const request = { headers: { authorization: `Bearer ${signAccessToken(user, session.id)}` } }
    const response = responseDouble()
    const next = vi.fn()

    await createAuthenticate(repository)(request, response, next)

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(401)
    expect(repository.findUserById).not.toHaveBeenCalled()
  })
})
