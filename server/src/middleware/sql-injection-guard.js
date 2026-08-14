import { prisma } from '../lib/prisma.js'
import { findSuspiciousSqlInput } from '../security/sql-injection-detection.js'

export function sqlInjectionGuard(req, res, next) {
  const finding = findSuspiciousSqlInput({ params: req.params, query: req.query, body: req.body })
  if (!finding) return next()
  const audit = /** @type {import('@prisma/client').Prisma.AuditLogUncheckedCreateInput} */ ({
    action: 'SECURITY_SQL_INJECTION_BLOCKED',
    resourceType: 'HTTP_REQUEST',
    resourceName: `${req.method} ${req.path}`.slice(0, 500),
    severity: 'CRITICAL',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500),
    nextData: { field: finding.path, signature: finding.signature, requestId: req.id },
  })
  prisma.auditLog.create({ data: audit }).catch(() => {})
  return res.status(400).json({
    error: {
      code: 'SUSPICIOUS_INPUT_BLOCKED',
      message: 'Аюулгүй байдлын шүүлтүүр хүсэлтийг хориглолоо.',
      requestId: req.id,
    },
  })
}
