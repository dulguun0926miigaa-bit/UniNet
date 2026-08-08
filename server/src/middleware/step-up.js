import { mfaService } from '../auth/mfa.service.js'
import { AppError } from '../utils/app-error.js'

/**
 * Requires a short-lived step-up token bound to the authenticated user/session.
 * The token is sent in x-step-up-token. Operator-entered reason prompts are
 * intentionally not required; route, method, actor and request id are audited.
 */
export function requireStepUp({ roles = null } = {}) {
  return (req, _res, next) => {
    try {
      if (roles && !roles.includes(req.auth?.user?.role)) return next()
      const token = req.get('x-step-up-token')
      if (!token) throw new AppError('Энэ үйлдлийн өмнө нууц үг болон MFA-гаар дахин баталгаажуулна уу.', 403, 'STEP_UP_REQUIRED')
      const payload = mfaService.verifyStepUp(token, req.auth.user, req.auth.token.sid)
      req.stepUp = { payload, reason: null }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function requireAdminMfa(req, _res, next) {
  try {
    if (!['UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'].includes(req.auth?.user?.role)) return next()
    if (!req.auth?.session?.mfaVerifiedAt || req.auth?.token?.mfa !== true) {
      throw new AppError('Admin session-д MFA баталгаажуулалт шаардлагатай.', 403, 'ADMIN_MFA_REQUIRED')
    }
    next()
  } catch (error) {
    next(error)
  }
}
