import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

let passed = 0
function check(condition, message) {
  assert.ok(condition, message)
  passed += 1
}
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const env = read('server/src/config/env.js')
for (const token of [
  'GATEWAY_UPSTREAM_TIMEOUT_MS',
  'GATEWAY_CIRCUIT_FAILURE_THRESHOLD',
  'GATEWAY_CIRCUIT_RESET_MS',
  'SESSION_IDLE_TIMEOUT_MINUTES',
  'SESSION_TOUCH_INTERVAL_MINUTES',
]) check(env.includes(token), `environment schema includes ${token}`)

const envExample = read('.env.example')
for (const token of [
  'GATEWAY_UPSTREAM_TIMEOUT_MS=15000',
  'GATEWAY_CIRCUIT_FAILURE_THRESHOLD=5',
  'GATEWAY_CIRCUIT_RESET_MS=30000',
  'SESSION_IDLE_TIMEOUT_MINUTES=720',
  'SESSION_TOUCH_INTERVAL_MINUTES=5',
]) check(envExample.includes(token), `.env.example documents ${token}`)

const breaker = read('server/src/services/upstream-circuit-breaker.js')
check(breaker.includes('export class UpstreamCircuitBreaker'), 'circuit breaker is reusable')
check(breaker.includes("state: 'open'"), 'circuit breaker exposes open state')
check(breaker.includes("state: 'half_open_probe'"), 'circuit breaker supports half-open probe')
check(breaker.includes('recordSuccess(key)'), 'circuit breaker closes on success')
check(breaker.includes('recordFailure(key)'), 'circuit breaker records failures')

const gateway = read('server/src/services/api-gateway.js')
check(gateway.includes("from './upstream-circuit-breaker.js'"), 'gateway uses circuit breaker module')
check(gateway.includes('UPSTREAM_CIRCUIT_OPEN'), 'gateway returns circuit-open error code')
check(gateway.includes("'retry-after'"), 'gateway returns retry-after for open circuits')
check(gateway.includes('proxyReq.setTimeout(env.GATEWAY_UPSTREAM_TIMEOUT_MS'), 'gateway enforces configurable upstream timeout')
check(gateway.includes("error.code = 'UPSTREAM_TIMEOUT'"), 'gateway distinguishes upstream timeout')
check(gateway.includes("req.on('aborted'"), 'gateway cancels upstream request after client abort')
check(gateway.includes("res.on('close'"), 'gateway cancels upstream after client response closes')
check(gateway.includes('circuitBreaker.recordFailure(targetName)'), 'gateway reports upstream failure to breaker')
check(gateway.includes('circuitBreaker.recordSuccess(targetName)'), 'gateway resets breaker after success')

const sessionPolicy = read('server/src/auth/session-policy.js')
check(sessionPolicy.includes('sessionIdleExpired'), 'session idle-expiry policy exists')
check(sessionPolicy.includes('shouldTouchSession'), 'bounded session-touch policy exists')
check(sessionPolicy.includes('SESSION_IDLE_TIMEOUT_MINUTES'), 'idle policy uses validated env')
check(sessionPolicy.includes('SESSION_TOUCH_INTERVAL_MINUTES'), 'touch policy uses validated env')

const authenticate = read('server/src/middleware/authenticate.js')
check(authenticate.includes('sessionIdleExpired'), 'authentication rejects idle-expired session')
check(authenticate.includes('shouldTouchSession'), 'authentication bounds session writes')
check(authenticate.includes('touchSession'), 'authentication updates session activity')

const authRepository = read('server/src/auth/auth.repository.js')
check(authRepository.includes('touchSession(id, now = new Date())'), 'repository exposes session touch operation')
check(authRepository.includes('findUserByGoogleIdentity(googleIssuer, googleId)'), 'repository queries OAuth identity using issuer and subject')
check(authRepository.includes("token.user.authProvider === 'GOOGLE' ? 'PASSWORD_GOOGLE'"), 'password reset gives Google-only account a safe local recovery path')

const authService = read('server/src/auth/auth.service.js')
check(authService.includes('sessionIdleExpired(session'), 'refresh enforces idle timeout')

const oauthSecurity = read('server/src/auth/google-oauth.security.js')
check(oauthSecurity.includes('GOOGLE_ISSUERS'), 'Google issuer allowlist exists')
check(oauthSecurity.includes('CANONICAL_GOOGLE_ISSUER'), 'canonical issuer is persisted')
check(oauthSecurity.includes('audience === clientId'), 'OAuth audience is verified')
check(oauthSecurity.includes('nonce === expectedNonce'), 'OIDC nonce is verified')
check(oauthSecurity.includes('emailVerified'), 'verified Google email is required')
check(oauthSecurity.includes('expiresAtMs + clockSkewSeconds * 1000 > now'), 'ID-token expiration is verified')
check(oauthSecurity.includes('isAllowedGoogleRedirectUri'), 'exact redirect URI helper exists')

const oauthService = read('server/src/auth/google-oauth.service.js')
check(oauthService.includes('googleIssuer: identity.googleIssuer, googleId: identity.googleId'), 'Google identity lookup uses issuer plus subject')
check(oauthService.includes('googleIssuer: identity.googleIssuer'), 'Google issuer is persisted')
check(oauthService.includes("authProvider: 'PASSWORD_GOOGLE'"), 'manual account link records combined provider')
check(oauthService.includes('async unlink(userId, currentPassword, context)'), 'OAuth unlink service exists')
check(oauthService.includes("GOOGLE_OAUTH_ACCOUNT_UNLINKED"), 'OAuth unlink is audited')
check(oauthService.includes('sessionsRevoked'), 'OAuth unlink revokes sessions')
check(oauthService.includes('googleLinkedAt: user.googleLinkedAt'), 'public auth user exposes link state')

const authRoutes = read('server/src/auth/auth.routes.js')
check(authRoutes.includes("router.post('/google/unlink'"), 'authenticated Google unlink route exists')
check(authRoutes.includes('currentPassword: z.string().min(1).max(200)'), 'unlink body is strictly validated')
check(authRoutes.includes("req.query.error === 'access_denied'"), 'Google cancellation has stable error mapping')
check(authRoutes.includes('oauth=error&code='), 'OAuth callback redirects to fixed application error state')

const schema = read('server/prisma/schema.prisma')
check(/googleIssuer\s+String\?/.test(schema), 'User schema stores OAuth issuer')
check(schema.includes('@@unique([googleIssuer, googleId])'), 'issuer and subject are unique together')
check(existsSync(new URL('../server/prisma/migrations/20260803140000_phase5h_oauth_identity_key/migration.sql', import.meta.url)), 'OAuth identity migration exists')
const migration = read('server/prisma/migrations/20260803140000_phase5h_oauth_identity_key/migration.sql')
check(migration.includes('ADD COLUMN "googleIssuer"'), 'migration adds Google issuer')
check(migration.includes('CREATE UNIQUE INDEX'), 'migration creates issuer/subject uniqueness')

const errorMessages = read('src/errors/errorMessages.js')
for (const code of [
  'GOOGLE_AUTH_CANCELLED',
  'GOOGLE_AUTH_FAILED',
  'GOOGLE_IDENTITY_INVALID',
  'GOOGLE_ACCOUNT_NOT_LINKED',
  'LOCAL_PASSWORD_REQUIRED_BEFORE_UNLINK',
  'UPSTREAM_CIRCUIT_OPEN',
  'UPSTREAM_TIMEOUT',
]) check(errorMessages.includes(code), `frontend maps ${code}`)

const landing = read('src/Uninetlanding.jsx')
check(landing.includes('oauth === "error"'), 'landing handles OAuth callback error state')
check(landing.includes('mongolianErrorMessage'), 'OAuth errors use Mongolian mapping')
check(landing.includes('cacheTtlMs: 30000'), 'public bootstrap has explicit short cache TTL')

const apiClient = read('src/api/apiClient.js')
check(apiClient.includes('const inflightGetRequests = new Map()'), 'API client deduplicates concurrent GETs')
check(apiClient.includes('const responseCache = new Map()'), 'API client provides explicit response cache')
check(apiClient.includes('export function invalidateApiCache'), 'API cache can be invalidated')
check(apiClient.includes('cacheTtlMs'), 'GET callers opt in to bounded cache TTL')
check(apiClient.includes('if (!["GET", "HEAD"].includes(method)) invalidateApiCache()'), 'mutations invalidate cached reads')
check(apiClient.includes('if (next !== accessToken) responseCache.clear()'), 'session identity change clears cached responses')

const authFrontend = read('src/auth/authService.js')
check(authFrontend.includes('unlinkGoogle(currentPassword)'), 'frontend auth service exposes Google unlink')
check(authFrontend.includes('/auth/google/unlink'), 'frontend invokes unlink API')

const settings = read('src/settings/SettingsPage.jsx')
check(settings.includes('Google account холбогдсон'), 'settings shows linked Google identity')
check(settings.includes('Google холбоос салгах'), 'settings exposes unlink action')
check(settings.includes('googlePassword'), 'unlink requires password re-authentication in UI')

const openapi = read('server/src/openapi/openapi.document.js')
check(openapi.includes("'/api/auth/google/unlink'"), 'OpenAPI documents unlink endpoint')
check(openapi.includes('GoogleUnlinkRequest'), 'OpenAPI documents unlink request')
check(openapi.includes('GoogleUnlinkResponse'), 'OpenAPI documents unlink response')
check(/version: '1\.[6-9]\.0'/.test(openapi), 'OpenAPI contract remains at or above the Phase 5H 1.6.0 baseline')
const openapiModule = await import('../server/src/openapi/openapi.document.js')
check(openapiModule.endpointDefinitions.length >= 124, 'OpenAPI preserves at least the 124 Phase 5H operations')

for (const file of [
  'server/test/google-oauth.security.test.js',
  'server/test/google-oauth.source-contract.test.js',
  'server/test/upstream-circuit-breaker.test.js',
  'server/test/session-policy.test.js',
  'config/license-policy.json',
  'scripts/check-licenses.mjs',
  'scripts/generate-sbom.mjs',
  'artifacts/sbom.cyclonedx.json',
  'docs/security/dependency-registry-policy.md',
]) check(existsSync(new URL(`../${file}`, import.meta.url)), `${file} exists`)

const pkg = JSON.parse(read('package.json'))
check(pkg.scripts['security:licenses'] === 'node scripts/check-licenses.mjs', 'package exposes license gate')
check(pkg.scripts['security:sbom'] === 'node scripts/generate-sbom.mjs', 'package exposes SBOM generation')
check(pkg.scripts['test:phase5h-smoke'] === 'node scripts/phase5h-checklist-closure-smoke.mjs', 'package exposes Phase 5H smoke')

const workflow = read('../.github/workflows/ci.yml')
check(workflow.includes('Generate CycloneDX SBOM'), 'CI generates SBOM')
check(workflow.includes('actions/upload-artifact'), 'CI stores SBOM evidence')
check(workflow.includes('Dependency license policy'), 'CI enforces license policy')

const sbom = JSON.parse(read('artifacts/sbom.cyclonedx.json'))
check(sbom.bomFormat === 'CycloneDX', 'generated artifact is CycloneDX')
check(sbom.specVersion === '1.6', 'generated SBOM uses CycloneDX 1.6')
check(Array.isArray(sbom.components) && sbom.components.length > 500, 'SBOM includes locked dependency graph')

const checklist = read('things-to-do.md')
const checked = (checklist.match(/- \[x\]/g) || []).length
const unchecked = (checklist.match(/- \[ \]/g) || []).length
check(checked >= 689, `checklist preserves at least 689 implemented items, received ${checked}`)
check(unchecked <= 222, `checklist does not reopen Phase 5H items; received ${unchecked}`)
check(checked + unchecked >= 911, 'checklist total preserves the Phase 5H baseline including honest split rows')
check(checklist.includes('- [x] Package-lock-оос CycloneDX 1.6 SBOM'), 'SBOM checklist item is evidenced')
check(checklist.includes('- [x] API Gateway upstream timeout'), 'gateway resilience checklist item is evidenced')
check(checklist.includes('- [x] Refresh-token absolute expiry'), 'session idle checklist item is evidenced')
check(checklist.includes('OpenAPI'), 'checklist keeps OpenAPI evidence')

console.log(`Phase 5H checklist closure smoke passed: ${passed} assertions`)
