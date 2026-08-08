import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const createOpaqueToken = () => crypto.randomBytes(32).toString('base64url')
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

export function signAccessToken(user, sessionId, { mfaVerified = false } = {}) {
  /** @type {import('jsonwebtoken').SignOptions} */
  const options = {
    algorithm: 'HS256',
    expiresIn: /** @type {import('jsonwebtoken').SignOptions['expiresIn']} */ (env.JWT_ACCESS_EXPIRES_IN),
    issuer: 'uninet-api',
    audience: 'uninet-web',
  }
  return jwt.sign(
    { sub: user.id, sid: sessionId, role: user.role, universityId: user.universityId, type: 'access', mfa: Boolean(mfaVerified) },
    env.JWT_ACCESS_SECRET,
    options,
  )
}

export function signRefreshToken(user, sessionId) {
  /** @type {import('jsonwebtoken').SignOptions} */
  const options = {
    algorithm: 'HS256',
    expiresIn: /** @type {import('jsonwebtoken').SignOptions['expiresIn']} */ (env.JWT_REFRESH_EXPIRES_IN),
    issuer: 'uninet-api',
    audience: 'uninet-web',
  }
  return jwt.sign(
    { sub: user.id, sid: sessionId, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    options,
  )
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
    issuer: 'uninet-api',
    audience: 'uninet-web',
  })
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
    issuer: 'uninet-api',
    audience: 'uninet-web',
  })
}

export function expiryFromToken(token) {
  const payload = jwt.decode(token)
  if (!payload || typeof payload === 'string' || !payload.exp) throw new Error('Token has no expiry')
  return new Date(payload.exp * 1000)
}
