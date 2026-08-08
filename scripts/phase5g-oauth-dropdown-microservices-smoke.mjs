import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

let passed = 0
function check(condition, message) {
  assert.ok(condition, message)
  passed += 1
}
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const select = read('src/ui/StyledSelect.jsx')
check(select.includes('role="listbox"'), 'custom select exposes listbox semantics')
check(select.includes('role="option"'), 'custom select exposes option semantics')
check(select.includes('aria-selected'), 'custom select exposes selected state')
check(select.includes('Check'), 'selected option renders a check icon')
check(select.includes('bg-sky-500 text-white'), 'selected option uses highlighted menu row')
check(select.includes('ChevronDown'), 'custom trigger renders dropdown chevron')
check(select.includes('pointerdown'), 'custom select closes on outside pointer interaction')
check(select.includes('ArrowDown'), 'custom select supports keyboard navigation')
check(select.includes('Escape'), 'custom select supports escape close')
check(select.includes('mb-1.5 block'), 'label is outside trigger to prevent label/value overlap')

const studentUi = read('src/student/StudentUI.jsx')
check(studentUi.includes('import StyledSelect'), 'student filters import shared custom select')
check(studentUi.includes('{ value: "ALL", label: "Бүгд" }'), 'student filters provide explicit all option')
check(!studentUi.slice(studentUi.indexOf('export function SelectFilter'), studentUi.indexOf('export function StatCard')).includes('<select'), 'student filter no longer uses native select')

const operations = read('src/operations/OperationsExperience.jsx')
check(operations.includes('label="Visibility"'), 'survey visibility filter uses custom select')
check(operations.includes('label="Арга хэмжээ"'), 'registration event filter uses custom select')
check(operations.includes('label="Боломж"'), 'application opportunity filter uses custom select')
check(operations.includes('ariaLabel={`Асуулт ${index + 1}-ийн төрөл`}'), 'survey question type uses accessible custom select')

const membership = read('src/memberships/MembershipManagement.jsx')
check(membership.includes('label="Эрэмбэлэх"'), 'membership sort uses custom select')
check(membership.includes('label="Чиглэл"'), 'membership order uses custom select')
check(membership.includes('label="Шинэ төлөв"'), 'membership status mutation uses custom select')

const oauth = read('server/src/auth/google-oauth.service.js')
const oauthSecurity = read('server/src/auth/google-oauth.security.js')
check(oauth.includes("code_challenge_method: 'S256'"), 'Google OAuth uses PKCE S256')
check(oauth.includes('code_verifier: codeVerifier'), 'token exchange sends PKCE verifier')
check(oauth.includes("const verifierAudience = 'uninet-google-pkce'"), 'PKCE verifier uses a dedicated signed cookie token')
check(oauthSecurity.includes('nonce === expectedNonce'), 'Google ID token nonce is validated')
check(oauth.includes("payload.mode === 'LINK_EXISTING'"), 'OAuth onboarding supports existing account link mode')
check(oauth.includes("verifyPassword(existing.passwordHash, password)"), 'existing account link requires password re-authentication')
check(oauth.includes("existing.role !== 'STUDENT'"), 'Google self-link is restricted to Student accounts')
check(oauth.includes("OAUTH_ACCOUNT_ALREADY_LINKED"), 'one Student account cannot be silently relinked')
check(oauth.includes("GOOGLE_ACCOUNT_ALREADY_USED"), 'one Google subject cannot own two UniNet accounts')
check(oauth.includes("authProvider: 'PASSWORD_GOOGLE'"), 'linked local account records combined auth provider')
check(oauth.includes("GOOGLE_OAUTH_EXISTING_STUDENT_LINKED"), 'Google account link emits an audit event')
check(oauth.includes("type: 'verification'"), 'unverified Google-linked Student returns email verification state without session')
check(oauth.includes("mode === 'LINK_EXISTING'"), 'new registration and existing login are separate server flows')

const authRoutes = read('server/src/auth/auth.routes.js')
check(authRoutes.includes("const oauthVerifierCookie = 'uninet.oauth.verifier'"), 'PKCE verifier is stored in HttpOnly cookie')
check(authRoutes.includes('verifierCookie: req.cookies[oauthVerifierCookie]'), 'callback reads PKCE verifier cookie')
check(authRoutes.includes('oauth=verify&email='), 'unverified Google-linked account returns dedicated verification UI state')
check(authRoutes.includes("z.discriminatedUnion('mode'"), 'Google onboarding request uses strict mode-specific validation')
check(authRoutes.includes('googleOnboardingSchema.parse(req.body)'), 'Google onboarding route validates request before service execution')

const landing = read('src/Uninetlanding.jsx')
check(landing.includes('Бүртгэлтэй account-аар нэвтрэх'), 'OAuth onboarding renders existing account login button')
check(landing.includes('Шинээр бүртгүүлэх'), 'OAuth onboarding renders new registration button')
check(landing.includes('Google account холбож нэвтрэх'), 'existing Student flow has explicit link-and-login action')
check(landing.includes('Google-ээр шинэ Student бүртгэл үүсгэх'), 'new Student flow has explicit registration action')
check(landing.includes('googleOnboardingMode'), 'frontend keeps OAuth onboarding mode state')
check(landing.includes('payload.profile?.intent === "register"'), 'OAuth intent chooses default onboarding mode')
check(landing.includes('oauth === "verify"'), 'frontend handles linked account email verification')
check(landing.includes('const payload = googleOnboardingMode === "LINK_EXISTING"'), 'frontend sends a mode-specific Google onboarding payload')

const openapi = read('server/src/openapi/openapi.document.js')
check(openapi.includes('GoogleOnboardingRequest'), 'OpenAPI documents mode-specific Google onboarding request')
check(openapi.includes('GoogleOnboardingCompletionResponse'), 'OpenAPI documents active or pending Google onboarding result')

for (const file of [
  'server/src/services/api-gateway.js',
  'server/src/services/identity-service.js',
  'server/src/services/core-service.js',
  'server/src/services/identity.app.js',
  'server/src/services/core.app.js',
  'scripts/run-services.mjs',
]) check(existsSync(new URL(`../${file}`, import.meta.url)), `${file} exists`)

const gateway = read('server/src/services/api-gateway.js')
check(gateway.includes("'/api/auth'"), 'gateway routes authentication to identity service')
check(gateway.includes('env.CORE_SERVICE_URL'), 'gateway routes collaboration APIs to core service')
check(gateway.includes('aggregateReadiness'), 'gateway aggregates service readiness')
check(gateway.includes('UPSTREAM_UNAVAILABLE'), 'gateway returns a stable upstream error envelope')
check(gateway.includes('access-control-allow-credentials'), 'gateway owns browser CORS credentials policy')

const identity = read('server/src/services/identity.app.js')
check(identity.includes("app.use('/api/auth', authRouter)"), 'identity service owns auth routes')
check(identity.includes("app.use('/api/notifications', notificationRouter)"), 'identity service owns notification delivery')
const core = read('server/src/services/core.app.js')
check(core.includes("app.use('/api/surveys', surveyRouter)"), 'core service owns survey routes')
check(core.includes("app.use('/api/memberships', membershipRouter)"), 'core service owns membership routes')
check(core.includes("app.use('/api/universities', universityRouter)"), 'core service owns university routes')

const pkg = JSON.parse(read('package.json'))
check(pkg.scripts['services:dev'] === 'node scripts/run-services.mjs --watch', 'package exposes microservice dev command')
check(pkg.scripts['services:start'] === 'node scripts/run-services.mjs', 'package exposes microservice start command')

const compose = read('docker-compose.yml')
check(compose.includes('identity-service:'), 'compose defines identity service')
check(compose.includes('core-service:'), 'compose defines core service')
check(compose.includes('api-gateway:'), 'compose defines API gateway')
check(compose.includes('db-migrate:'), 'compose runs migrations as a one-shot service')

console.log(`Phase 5G smoke passed: ${passed} assertions`)
