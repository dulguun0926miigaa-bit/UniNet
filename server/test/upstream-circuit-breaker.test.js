import { describe, expect, it } from 'vitest'
import { UpstreamCircuitBreaker } from '../src/services/upstream-circuit-breaker.js'

describe('API gateway upstream circuit breaker', () => {
  it('opens after the configured failures and allows one half-open probe after reset', () => {
    let now = 1_000
    const breaker = new UpstreamCircuitBreaker({ failureThreshold: 2, resetMs: 5_000, now: () => now })
    expect(breaker.canRequest('identity').allowed).toBe(true)
    expect(breaker.recordFailure('identity').state).toBe('closed')
    expect(breaker.recordFailure('identity').state).toBe('open')
    expect(breaker.canRequest('identity')).toMatchObject({ allowed: false, state: 'open' })
    now += 5_001
    expect(breaker.canRequest('identity')).toMatchObject({ allowed: true, state: 'half_open_probe' })
    expect(breaker.canRequest('identity')).toMatchObject({ allowed: false, state: 'half_open' })
    breaker.recordSuccess('identity')
    expect(breaker.canRequest('identity')).toMatchObject({ allowed: true, state: 'closed' })
  })
})
