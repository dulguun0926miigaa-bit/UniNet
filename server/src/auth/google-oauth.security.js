import { AppError } from '../utils/app-error.js'

export const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com'])
export const CANONICAL_GOOGLE_ISSUER = 'https://accounts.google.com'

export function validateGoogleIdentityClaims(identity, { clientId, expectedNonce, now = Date.now(), clockSkewSeconds = 60 } = {}) {
  const issuer = String(identity?.iss || '')
  const audience = String(identity?.aud || '')
  const subject = String(identity?.sub || '')
  const nonce = String(identity?.nonce || '')
  const expiresAtSeconds = Number(identity?.exp)
  const emailVerified = identity?.email_verified === true || identity?.email_verified === 'true'
  const expiresAtMs = expiresAtSeconds * 1000
  const valid = GOOGLE_ISSUERS.has(issuer)
    && Boolean(subject)
    && audience === clientId
    && nonce === expectedNonce
    && emailVerified
    && Number.isFinite(expiresAtMs)
    && expiresAtMs + clockSkewSeconds * 1000 > now

  if (!valid) {
    throw new AppError('Google identity баталгаажаагүй байна.', 401, 'GOOGLE_IDENTITY_INVALID')
  }
  return {
    issuer: CANONICAL_GOOGLE_ISSUER,
    subject,
    email: String(identity.email || '').trim().toLowerCase(),
    firstName: String(identity.given_name || '').trim(),
    lastName: String(identity.family_name || '').trim(),
    picture: identity.picture || null,
  }
}

export function isAllowedGoogleRedirectUri(value, configuredRedirectUri) {
  if (typeof value !== 'string' || typeof configuredRedirectUri !== 'string') return false
  try {
    return new URL(value).toString() === new URL(configuredRedirectUri).toString()
  } catch {
    return false
  }
}
