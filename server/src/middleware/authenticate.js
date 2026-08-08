import { authRepository } from '../auth/auth.repository.js'
import { hasPermission } from '../authorization/policy.js'
import { verifyAccessToken } from '../utils/tokens.js'
import { sessionIdleExpired, shouldTouchSession } from '../auth/session-policy.js'

export function createAuthenticate(repository = authRepository) {
  return async function authenticate(req, res, next) {
    try {
      const [scheme, token] = (req.headers.authorization || '').split(' ')
      if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Нэвтэрнэ үү.' } })
      }
      const payload = verifyAccessToken(token)
      if (typeof payload === 'string') throw new Error('Invalid access token payload')
      if (payload.type !== 'access') throw new Error('Invalid token type')
      if (!payload.sid || typeof payload.sid !== 'string') throw new Error('Access token has no session')
      const session = await repository.findSession(payload.sid)
      const now = new Date()
      if (
        !session
        || session.userId !== payload.sub
        || session.revokedAt
        || session.compromisedAt
        || session.expiresAt <= now
        || sessionIdleExpired(session, now)
      ) throw new Error('Inactive session')
      const user = await repository.findUserById(payload.sub)
      if (!user || user.status !== 'ACTIVE') throw new Error('Inactive user')
      if (user.university && user.university.status !== 'ACTIVE') throw new Error('Inactive university')
      if (['UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'].includes(user.role) && (!session.mfaVerifiedAt || payload.mfa !== true)) {
        throw new Error('Admin MFA required')
      }
      if (shouldTouchSession(session, now) && typeof repository.touchSession === 'function') {
        repository.touchSession(session.id, now).catch(() => {})
        session.lastUsedAt = now
      }
      req.auth = { user, session, token: payload }
      next()
    } catch {
      res.status(401).json({
        error: { code: 'INVALID_ACCESS_TOKEN', message: 'Нэвтрэх эрх хүчингүй эсвэл хугацаа дууссан байна.' },
      })
    }
  }
}

export const authenticate = createAuthenticate()

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.user.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Хандах эрх хүрэлцэхгүй байна.' } })
    }
    next()
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.auth?.user
    if (!user || !hasPermission(user, permission)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Шаардлагатай зөвшөөрөл алга.' } })
    }
    next()
  }
}
