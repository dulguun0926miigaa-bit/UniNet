import { env } from '../config/env.js'

export function sessionIdleExpired(session, now = new Date(), idleTimeoutMinutes = null) {
  const effectiveIdleMinutes = idleTimeoutMinutes ?? (session.remembered ? env.REMEMBER_ME_DAYS * 24 * 60 : env.SESSION_IDLE_TIMEOUT_MINUTES)
  const lastActivity = session.lastUsedAt || session.createdAt
  if (!lastActivity) return false
  return now.getTime() - new Date(lastActivity).getTime() > effectiveIdleMinutes * 60_000
}

export function shouldTouchSession(session, now = new Date(), touchIntervalMinutes = env.SESSION_TOUCH_INTERVAL_MINUTES) {
  const lastActivity = session.lastUsedAt || session.createdAt
  if (!lastActivity) return true
  return now.getTime() - new Date(lastActivity).getTime() >= touchIntervalMinutes * 60_000
}
