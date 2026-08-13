import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  token: null,
  apiRequest: vi.fn(),
  restoreAccessSession: vi.fn(),
}))

vi.mock('../api/apiClient.js', () => ({
  API_URL: '/api',
  apiRequest: mocks.apiRequest,
  restoreAccessSession: mocks.restoreAccessSession,
  setAccessToken: token => { mocks.token = token || null },
  getAccessToken: () => mocks.token,
  setSessionExpiredHandler: vi.fn(),
}))

import { authService } from './authService.js'

describe('auth session restoration', () => {
  beforeEach(() => {
    authService.clearSession()
    mocks.apiRequest.mockReset()
    mocks.restoreAccessSession.mockReset()
    mocks.restoreAccessSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.apiRequest.mockResolvedValue({
      user: { id: 'user-1', email: 'student@num.edu.mn', role: 'STUDENT' },
    })
  })

  it('deduplicates concurrent refresh and me requests', async () => {
    const [first, second, third] = await Promise.all([
      authService.restoreSession(),
      authService.restoreSession(),
      authService.restoreSession(),
    ])

    expect(first.id).toBe('user-1')
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(mocks.restoreAccessSession).toHaveBeenCalledTimes(1)
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1)
    expect(mocks.apiRequest).toHaveBeenCalledWith('/auth/me', { retryAuth: false })
  })

  it('reuses the in-memory authenticated session after restoration', async () => {
    await authService.restoreSession()
    await authService.restoreSession()

    expect(mocks.restoreAccessSession).toHaveBeenCalledTimes(1)
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1)
  })
})
