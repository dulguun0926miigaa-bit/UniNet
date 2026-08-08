import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeBase32, encodeBase32, findTotpStep, generateTotp } from '../server/src/auth/mfa-totp.js'
import { assertNotCommonBreachedPassword } from '../server/src/auth/password-policy.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let assertions = 0
const ok = (condition, message) => { assert.ok(condition, message); assertions += 1 }
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1 }
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const includesAll = (relative, needles) => {
  const text = source(relative)
  for (const needle of needles) ok(text.includes(needle), `${relative} must include ${needle}`)
}

const secretBytes = Buffer.from('UniNet Phase 5I MFA smoke secret')
const encoded = encodeBase32(secretBytes)
ok(encoded.length > 20, 'Base32 secret should be non-trivial')
ok(decodeBase32(encoded).equals(secretBytes), 'Base32 should round-trip')
equal(generateTotp('JBSWY3DPEHPK3PXP', 0), '282760', 'HOTP counter 0')
equal(generateTotp('JBSWY3DPEHPK3PXP', 1), '996554', 'HOTP counter 1')
equal(generateTotp('JBSWY3DPEHPK3PXP', 2), '602287', 'HOTP counter 2')
equal(findTotpStep('JBSWY3DPEHPK3PXP', generateTotp('JBSWY3DPEHPK3PXP', 500), 500 * 30_000), 500, 'TOTP window')
equal(findTotpStep('JBSWY3DPEHPK3PXP', '000000', 500 * 30_000), null, 'invalid TOTP')
assert.throws(() => assertNotCommonBreachedPassword('Password123!')); assertions += 1
assert.throws(() => assertNotCommonBreachedPassword('UniNetDev!2026')); assertions += 1
assert.doesNotThrow(() => assertNotCommonBreachedPassword('Orbit!Cedar9-Falcon#27')); assertions += 1

includesAll('server/prisma/schema.prisma', [
  'model OAuthAccount', 'providerSubject', 'providerEmailVerified', '@@unique([issuer, providerSubject])',
  'model MfaTotpCredential', 'secretCiphertext', 'secretIv', 'secretTag', 'lastUsedStep',
  'model MfaRecoveryCode', 'codeHash', 'model PasswordHistory', 'model LoginSecurityState',
  'model EmailChangeRequest', 'mfaVerifiedAt',
])
includesAll('server/prisma/migrations/20260804110000_phase5i_security_controls/migration.sql', [
  'CREATE TABLE "OAuthAccount"', 'CREATE TABLE "MfaTotpCredential"', 'CREATE TABLE "MfaRecoveryCode"',
  'CREATE TABLE "PasswordHistory"', 'CREATE TABLE "LoginSecurityState"', 'CREATE TABLE "EmailChangeRequest"',
  'OAuthAccount_issuer_providerSubject_key', 'providerEmailVerified', 'ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt"',
])
includesAll('server/src/auth/mfa.service.js', [
  "createCipheriv('aes-256-gcm'", 'MFA_CODE_REPLAYED', 'MFA_RECOVERY_CODES_REGENERATED',
  'ADMIN_MFA_REQUIRED', 'STEP_UP_SUCCEEDED', 'mfaVerifiedAt', 'RECOVERY_CODE',
])
includesAll('server/src/auth/login-security.service.js', [
  'LOGIN_BACKOFF_ACTIVE', 'Math.min', 'SUSPICIOUS_LOGIN_ALERTED', 'SECURITY_ALERT',
])
includesAll('server/src/auth/email-change.service.js', [
  'EMAIL_CHANGE_REQUESTED', 'EMAIL_CHANGED', 'EMAIL_CHANGE_DOMAIN_MISMATCH', 'EMAIL_ALREADY_REGISTERED',
  'sessionsRevoked', 'tokenHash',
])
includesAll('server/src/auth/password-security.js', [
  'PASSWORD_HISTORY_REUSE_FORBIDDEN', 'PASSWORD_REUSE_FORBIDDEN', 'passwordHistory.findMany',
])
includesAll('server/src/middleware/authenticate.js', [
  "['UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN']", 'session.mfaVerifiedAt', 'payload.mfa !== true',
])
includesAll('server/src/middleware/step-up.js', [
  'x-step-up-token', 'requireStepUp', 'requireAdminMfa',
])
for (const routeFile of [
  'server/src/universities/university.routes.js',
  'server/src/operations/operations.routes.js',
  'server/src/operations/workflow.routes.js',
  'server/src/memberships/membership.routes.js',
  'server/src/surveys/survey.routes.js',
]) ok(!source(routeFile).includes('requirePlatformMutationStepUp'), `${routeFile} must not require automatic admin mutation step-up`)
includesAll('server/src/auth/auth.routes.js', [
  "'/mfa/login/verify'", "'/mfa/oauth/verify'", "'/mfa/bootstrap/start'", "'/mfa/bootstrap/confirm'",
  "'/mfa/status'", "'/mfa/enroll/start'", "'/mfa/enroll/confirm'", "'/mfa/recovery-codes/regenerate'",
  "router.delete('/mfa'", "'/step-up'", "'/email-change/request'", "'/email-change/confirm'",
])
includesAll('src/auth/authService.js', [
  'verifyMfaLogin', 'verifyOAuthMfa', 'startMfaEnrollment', 'confirmMfaEnrollment',
  'regenerateMfaRecoveryCodes', 'disableMfa', 'createStepUp', 'requestEmailChange', 'confirmEmailChange',
])
ok(!source('src/auth/authService.js').includes('Admin step-up:'), 'Admin management mutations must not prompt for password/MFA step-up')
ok(!source('src/api/apiClient.js').includes('highRiskMutationHeaderProvider'), 'API client must not inject global admin step-up headers')
includesAll('src/Uninetlanding.jsx', [
  'authView === "mfa-login"', 'authView === "mfa-enroll"', 'Recovery code хадгалсан',
  'emailChangeToken', 'confirmEmailChange',
])
includesAll('src/settings/SettingsPage.jsx', [
  'startMfa', 'confirmMfa', 'regenerateRecoveryCodes', 'disableMfa',
  'requestEmailChange', 'Email солих баталгаажуулалт илгээх', 'createStepUp',
])
includesAll('server/src/openapi/openapi.document.js', [
  "version: '1.9.0'", '/api/auth/mfa/login/verify', '/api/auth/mfa/enroll/start',
  '/api/auth/step-up', '/api/auth/email-change/request', 'MfaEnrollmentStartResponse', 'StepUpResponse',
])
includesAll('server/test/mfa-totp.test.js', ['TOTP primitives', '282760', '996554', '602287'])
includesAll('server/test/password-policy.test.js', ['password risk policy', 'UniNetDev!2026'])
includesAll('server/test/auth.middleware.test.js', ['session was not MFA-verified', 'both token and session carry MFA proof'])
includesAll('server/test/auth.service.test.js', ['returns an MFA challenge', 'requires bootstrap MFA enrollment'])
const checklist = source('things-to-do.md')
const checked = (checklist.match(/- \[x\]/g) || []).length
const unchecked = (checklist.match(/- \[ \]/g) || []).length
equal(checked, 715, 'Phase 5I implemented checklist count')
equal(unchecked, 201, 'Phase 5I remaining checklist count')
equal(checked + unchecked, 916, 'Phase 5I checklist total')
includesAll('things-to-do.md', [
  'AES-256-GCM field encryption', 'mandatory Admin MFA', 'session-bound step-up',
  'one-time expiring token', 'capped exponential login backoff',
])

console.log(`Phase 5I security/MFA/step-up smoke passed: ${assertions} assertions.`)
