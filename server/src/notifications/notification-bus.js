import { EventEmitter } from 'node:events'

const emitter = new EventEmitter()
emitter.setMaxListeners(1000)

export const notificationBus = {
  subscribe(userId, listener) {
    const event = `user:${userId}`
    emitter.on(event, listener)
    return () => emitter.off(event, listener)
  },
  publish(userId, payload = { refresh: true }) {
    emitter.emit(`user:${userId}`, payload)
  },
}
