import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`Phase 5C smoke failed: ${message}`)
}

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const env = read('server/src/config/env.js')
const envExample = read('.env.example')
const authService = read('server/src/auth/auth.service.js')
const authRepository = read('server/src/auth/auth.repository.js')
const authTests = read('server/test/auth.service.test.js')
const environmentTests = read('server/test/environment-security.test.js')
const seed = read('server/prisma/seed.js')
const membershipValidation = read('server/src/memberships/membership.validation.js')
const membershipRepository = read('server/src/memberships/membership.repository.js')
const membershipService = read('server/src/memberships/membership.service.js')
const membershipRoutes = read('server/src/memberships/membership.routes.js')
const membershipTests = read('server/test/membership.service.test.js')
const membershipClient = read('src/memberships/membershipService.js')
const membershipUi = read('src/memberships/MembershipManagement.jsx')
const membershipClientTests = read('src/memberships/membershipService.test.js')
const operationsClient = read('src/operations/operationsData.js')
const operationsUi = read('src/operations/OperationsExperience.jsx')
const openapi = read('server/src/openapi/openapi.document.js')
const checklist = read('things-to-do.md')
const readme = read('README.md')

check(env.includes("EMAIL_VERIFICATION_ENABLED: z.enum(['true', 'false']).default('false')"), 'email verification feature flag schema missing')
check(env.includes("Production requires email verification."), 'production fail-closed verification rule missing')
check(env.includes('emailVerificationEnabled: result.data.EMAIL_VERIFICATION_ENABLED'), 'runtime email verification flag missing')
check(envExample.includes('EMAIL_VERIFICATION_ENABLED=false'), '.env example bypass setting missing')
check(authService.includes('completeRegistrationWithoutEmailVerification(user.id)'), 'registration bypass completion missing')
check(authService.includes("action: 'EMAIL_VERIFICATION_BYPASSED_DEVELOPMENT'"), 'bypass audit event missing')
check(authService.includes("redirectTo: '/student'"), 'bypass direct-Student redirect missing')
check(authService.includes("code: 'EMAIL_VERIFICATION_DISABLED'") || authService.includes("'EMAIL_VERIFICATION_DISABLED'"), 'disabled verification error contract missing')
check(authRepository.includes('async function resolveStudentRegistration'), 'shared roster resolution missing')
check(authRepository.includes('async completeRegistrationWithoutEmailVerification'), 'repository bypass transaction missing')
check(authTests.includes('can bypass the six-digit email step in local/demo mode'), 'auth bypass unit test missing')
check(environmentTests.includes('does not allow the development email-verification bypass in production'), 'production bypass test missing')

const universityDomains = ['num.edu.mn', 'must.edu.mn', 'msue.edu.mn', 'mnums.edu.mn', 'muls.edu.mn']
for (const domain of universityDomains) {
  check(seed.includes(domain), `seed domain missing: ${domain}`)
}
check(seed.includes('`student@${universityConfig.officialDomain}`'), 'per-university Student seed missing')
check(seed.includes('`staff@${universityConfig.officialDomain}`'), 'per-university Staff seed missing')
check(seed.includes('`admin@${universityConfig.officialDomain}`'), 'per-university University Admin seed missing')
check(seed.includes("process.env.NODE_ENV === 'production'"), 'production role seed guard missing')
check(seed.includes('db.session.updateMany'), 'seed session revocation missing')
check(seed.includes('db.universityMember.upsert'), 'seed roster upsert missing')
check(seed.includes('db.studentProfile.upsert'), 'seed Student profile upsert missing')
check(seed.includes('db.staffProfile.upsert'), 'seed Staff/Admin profile upsert missing')

check(membershipValidation.includes('memberExportSchema'), 'member export validation missing')
check(membershipValidation.includes('rosterExportSchema'), 'roster export validation missing')
check(membershipRepository.includes('exportMembers(input)'), 'member export repository missing')
check(membershipRepository.includes('exportRoster({ universityId'), 'roster export repository missing')
check(membershipRepository.includes('recordExportAudit'), 'export audit repository missing')
check(membershipService.includes("if (/^[=+\\-@]/.test(safe.trimStart())) safe = `'${safe}`"), 'spreadsheet formula protection missing')
check(membershipService.includes('async exportMembers'), 'member export service missing')
check(membershipService.includes('async exportRoster('), 'roster export service missing')
check(membershipService.includes('async exportRosterImportErrors'), 'row error export service missing')
check(membershipRoutes.indexOf("'/students/export.csv'") < membershipRoutes.indexOf("'/students/:id'"), 'student export route must precede dynamic id route')
check(membershipRoutes.indexOf("'/staff/export.csv'") < membershipRoutes.indexOf("'/staff/:id'"), 'staff export route must precede dynamic id route')
check(membershipRoutes.includes("'/roster/export.csv'"), 'roster export route missing')
check(membershipRoutes.includes("'/roster/imports/:id/errors.csv'"), 'row error export route missing')
check(membershipRoutes.includes('sensitiveReadLimiter'), 'export rate limiter missing')
check(membershipTests.includes('tenant-scoped membership CSV exports'), 'membership export unit tests missing')
check(membershipTests.includes("expect(result.csv).toContain(\"'=HYPERLINK\")"), 'formula protection test missing')

check(membershipClient.includes('async downloadMembers'), 'frontend member download client missing')
check(membershipClient.includes('async downloadRoster('), 'frontend roster download client missing')
check(membershipClient.includes('async downloadRosterImportErrors'), 'frontend import-error download client missing')
check(membershipClient.includes('async listRoster('), 'frontend roster list client missing')
check(membershipClient.includes('async downloadRosterTemplate'), 'frontend roster template client missing')
check(membershipClient.includes('async previewRosterImport'), 'frontend roster preview client missing')
check(membershipClient.includes('async listRosterImports'), 'frontend roster import-history client missing')
check(membershipClient.includes('async commitRosterImport'), 'frontend roster commit client missing')
check(membershipClientTests.includes('integrates roster list, CSV preview, and commit endpoints'), 'frontend roster client tests missing')
check(membershipUi.includes('aria-label="CSV экспорт"'), 'accessible member export button missing')
check(membershipUi.includes('membershipService.downloadMembers'), 'member export UI integration missing')
check(membershipUi.includes('function RosterPanel'), 'University Admin roster panel missing')
check(membershipUi.includes('Roster CSV импорт ба экспорт'), 'roster UI heading missing')
check(membershipUi.includes('membershipService.previewRosterImport(file)'), 'roster preview UI integration missing')
check(membershipUi.includes('membershipService.commitRosterImport(job.id)'), 'roster commit UI integration missing')
check(membershipUi.includes('membershipService.downloadRosterImportErrors(job.id)'), 'roster error CSV UI integration missing')
check(membershipUi.includes('label: "Roster импорт"'), 'University Admin roster tab missing')
check(operationsClient.includes('query.set("visibility", visibility)'), 'Survey visibility query client missing')
check(operationsUi.includes('setVisibility("PRIVATE")'), 'Survey visibility editor state missing')
check(operationsUi.includes('<option value="PARTNERS">PARTNERS</option>'), 'Survey PARTNERS selector missing')
check(operationsUi.includes('surveyVisibility'), 'Survey visibility filter missing')
check(operationsUi.includes('{title.trim().length}/3+ тэмдэгт'), 'Survey title feedback missing')
check(operationsUi.includes('setError("")'), 'stale validation cleanup missing')

check(/version: '1\.[2-9]\.0'/.test(openapi), 'OpenAPI version 1.2.0 or later missing')
check(openapi.includes('/api/memberships/students/export.csv'), 'OpenAPI student export missing')
check(openapi.includes('/api/memberships/roster/export.csv'), 'OpenAPI roster export missing')
check(openapi.includes('/api/memberships/roster/imports/{id}/errors.csv'), 'OpenAPI import error export missing')
check(openapi.includes("enum: ['/verify-email', '/student']"), 'OpenAPI direct-registration responses missing')
check(checklist.includes('## 29. Phase 5C'), 'Phase 5C checklist section missing')
check(checklist.includes('[x] Tenant-scoped Student/Staff membership CSV export'), 'membership checklist item not completed')
check(checklist.includes('[x] Roster export-ийг University Admin authorization'), 'roster checklist item not completed')
check(readme.includes('student@<official-domain>'), 'README multi-university account guide missing')

const syntaxFiles = [
  'server/prisma/seed.js',
  'server/src/config/env.js',
  'server/src/auth/auth.repository.js',
  'server/src/auth/auth.service.js',
  'server/src/memberships/membership.validation.js',
  'server/src/memberships/membership.repository.js',
  'server/src/memberships/membership.service.js',
  'server/src/memberships/membership.routes.js',
  'server/src/openapi/openapi.document.js',
  'server/test/auth.service.test.js',
  'server/test/environment-security.test.js',
  'server/test/membership.service.test.js',
]
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  check(result.status === 0, `${file} syntax error: ${result.stderr}`)
}

console.log(`Phase 5C smoke passed: ${assertions} assertions.`)
