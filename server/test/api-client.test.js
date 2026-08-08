import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, setAccessToken, setSessionExpiredHandler } from '../../src/api/apiClient.js'

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
  setSessionExpiredHandler(null)
})

describe('central API client', () => {
  it('queues concurrent 401 requests behind one refresh rotation and retries them', async () => {
    let refreshCalls = 0
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCalls += 1
        await new Promise(resolve => setTimeout(resolve, 5))
        return jsonResponse({ accessToken: 'new-access-token' })
      }
      if (options.headers?.Authorization === 'Bearer new-access-token') return jsonResponse({ ok: true })
      return jsonResponse({ error: { code: 'INVALID_ACCESS_TOKEN', message: 'expired' } }, 401)
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([apiRequest('/student/bootstrap'), apiRequest('/settings')])

    expect(results).toEqual([{ ok: true }, { ok: true }])
    expect(refreshCalls).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('deduplicates concurrent GET requests and serves an explicit short-lived cache', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([
      apiRequest('/public/bootstrap', { auth: false, cacheTtlMs: 1000 }),
      apiRequest('/public/bootstrap', { auth: false, cacheTtlMs: 1000 }),
    ])
    const cached = await apiRequest('/public/bootstrap', { auth: false, cacheTtlMs: 1000 })

    expect(first).toEqual({ value: 1 })
    expect(second).toEqual({ value: 1 })
    expect(cached).toEqual({ value: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a distinct timeout error', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    })))
    await expect(apiRequest('/slow', { auth: false, timeoutMs: 5 })).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' })
  })

  it('reports network failures separately', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection refused')))
    await expect(apiRequest('/offline', { auth: false })).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})
