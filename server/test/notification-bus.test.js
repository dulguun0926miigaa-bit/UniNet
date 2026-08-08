import { describe, expect, it, vi } from 'vitest'
import { notificationBus } from '../src/notifications/notification-bus.js'

describe('per-user notification event bus', () => {
  it('publishes only to the subscribed user and unsubscribes cleanly', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = notificationBus.subscribe('user-a', first)
    const stopSecond = notificationBus.subscribe('user-b', second)

    notificationBus.publish('user-a', { refresh: true })
    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()

    stopFirst()
    stopSecond()
    notificationBus.publish('user-a', { refresh: true })
    expect(first).toHaveBeenCalledOnce()
  })
})
