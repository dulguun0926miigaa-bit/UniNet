export class UpstreamCircuitBreaker {
  constructor({ failureThreshold = 5, resetMs = 30_000, now = Date.now } = {}) {
    this.failureThreshold = failureThreshold
    this.resetMs = resetMs
    this.now = now
    this.state = new Map()
  }

  snapshot(key) {
    return this.state.get(key) || { failures: 0, openedAt: null, halfOpenProbe: false }
  }

  canRequest(key) {
    const current = this.snapshot(key)
    if (current.openedAt == null) return { allowed: true, state: 'closed', retryAfterMs: 0 }
    const elapsed = this.now() - current.openedAt
    if (elapsed < this.resetMs) {
      return { allowed: false, state: 'open', retryAfterMs: this.resetMs - elapsed }
    }
    if (current.halfOpenProbe) {
      return { allowed: false, state: 'half_open', retryAfterMs: Math.min(1000, this.resetMs) }
    }
    this.state.set(key, { ...current, halfOpenProbe: true })
    return { allowed: true, state: 'half_open_probe', retryAfterMs: 0 }
  }

  recordSuccess(key) {
    this.state.delete(key)
  }

  recordFailure(key) {
    const current = this.snapshot(key)
    const failures = current.failures + 1
    if (current.halfOpenProbe || failures >= this.failureThreshold) {
      this.state.set(key, { failures, openedAt: this.now(), halfOpenProbe: false })
      return { state: 'open', failures }
    }
    this.state.set(key, { failures, openedAt: null, halfOpenProbe: false })
    return { state: 'closed', failures }
  }
}
