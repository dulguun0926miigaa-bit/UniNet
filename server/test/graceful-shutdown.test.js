import { describe, expect, it, vi } from 'vitest'
import { createGracefulShutdown } from '../src/lifecycle/graceful-shutdown.js'

function loggerDouble() {
  return { info: vi.fn(), error: vi.fn() }
}

describe('graceful shutdown', () => {
  it('stops accepting HTTP traffic, drains idle connections, and disconnects once', async () => {
    const server = {
      close: vi.fn((callback) => queueMicrotask(() => callback())),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
    }
    const database = { $disconnect: vi.fn().mockResolvedValue(undefined) }
    const exit = vi.fn()
    const shutdown = createGracefulShutdown({ server, database, logger: loggerDouble(), exit })

    const first = shutdown('SIGTERM')
    const second = shutdown('SIGINT')

    expect(second).toBe(first)
    await first
    expect(server.close).toHaveBeenCalledOnce()
    expect(server.closeIdleConnections).toHaveBeenCalledOnce()
    expect(database.$disconnect).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('uses a non-zero exit when disconnect fails', async () => {
    const server = { close: vi.fn((callback) => queueMicrotask(() => callback())) }
    const database = { $disconnect: vi.fn().mockRejectedValue(new Error('database unavailable')) }
    const exit = vi.fn()
    const logger = loggerDouble()
    const shutdown = createGracefulShutdown({ server, database, logger, exit })

    await shutdown('uncaughtException', 1)

    expect(exit).toHaveBeenCalledWith(1)
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('forces shutdown after the drain deadline', async () => {
    vi.useFakeTimers()
    const server = {
      close: vi.fn(),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
    }
    const database = { $disconnect: vi.fn().mockResolvedValue(undefined) }
    const exit = vi.fn()
    const shutdown = createGracefulShutdown({
      server,
      database,
      logger: loggerDouble(),
      timeoutMs: 25,
      exit,
    })

    const result = shutdown('SIGTERM')
    await vi.advanceTimersByTimeAsync(25)
    await result

    expect(server.closeAllConnections).toHaveBeenCalledOnce()
    expect(database.$disconnect).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(1)
    vi.useRealTimers()
  })
})

