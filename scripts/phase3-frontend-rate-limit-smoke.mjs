import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const assertions = []
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
  assertions.push(message)
}

const landing = read('src/Uninetlanding.jsx')
const student = read('src/student/StudentExperience.jsx')
const dashboard = read('src/dashboard/DashboardLayout.jsx')
const schema = read('server/prisma/schema.prisma')
const migration = read('server/prisma/migrations/20260727153000_phase3_registration_enrollment_year/migration.sql')
const validation = read('server/src/auth/validation.js')
const authService = read('server/src/auth/auth.service.js')
const rateLimits = read('server/src/middleware/rate-limits.js')
const authRoutes = read('server/src/auth/auth.routes.js')
const app = read('server/src/app.js')
const openApi = read('server/src/openapi/openapi.document.js')

assert(landing.includes('name="lastName"') && landing.includes('name="firstName"'), 'Registration renders separate lastName and firstName fields')
assert(!landing.includes('name="fullName"') && !landing.includes('formData.get("fullName")'), 'Registration no longer combines names in one fullName input')
assert(landing.includes('name="enrollmentYear"') && landing.includes('new Date().getFullYear() - index'), 'Enrollment year options use current and past years')
assert(!landing.includes('new Date().getFullYear() - 1 + index'), 'Registration does not generate future enrollment years')
assert(schema.includes('enrollmentYear Int?'), 'StudentProfile stores enrollmentYear separately')
assert(migration.includes('ADD COLUMN "enrollmentYear" INTEGER'), 'Enrollment year migration exists')
assert(validation.includes('.max(currentYear)') && validation.includes('enrollmentYear:'), 'Backend rejects future enrollment years')
assert(authService.includes('enrollmentYear: input.enrollmentYear'), 'Registration persists enrollmentYear')
assert(student.includes('["Элсэх он", "enrollmentYear"]') && student.includes('["Төгсөх он", "graduationYear"]'), 'Student profile separates enrollment and graduation years')

for (const [source, label] of [[student, 'Student'], [dashboard, 'Staff/Admin']]) {
  assert(source.includes('<SidebarNavIcon path={item.path} />'), `${label} expanded sidebar renders route icons`)
  assert(source.includes('collapsed ? "md:hidden" : ""'), `${label} collapsed sidebar keeps text hidden on desktop`)
  assert(source.includes('collapsed ? "justify-center" : "gap-3"'), `${label} expanded sidebar aligns icon and text together`)
}

assert(rateLimits.includes("code: 'API_RATE_LIMITED'") && rateLimits.includes('limit: 600'), 'Global API rate limit exists')
assert(rateLimits.includes("code: 'REGISTRATION_IP_RATE_LIMITED'") && rateLimits.includes("code: 'REGISTRATION_ACCOUNT_RATE_LIMITED'"), 'Registration has IP and normalized-account rate limits')
assert(authRoutes.includes("router.post('/register', registrationIpLimiter, registrationAccountLimiter"), 'Registration route applies dedicated limiters')
assert(app.includes("app.use('/api', globalApiLimiter)"), 'Global API limiter is mounted')
assert(openApi.includes('enrollmentYear:') && openApi.includes('future years are rejected'), 'OpenAPI documents enrollmentYear semantics')

const syntaxFiles = [
  'server/src/app.js',
  'server/src/auth/auth.routes.js',
  'server/src/auth/auth.service.js',
  'server/src/auth/validation.js',
  'server/src/middleware/rate-limits.js',
  'server/src/openapi/openapi.document.js',
  'server/src/settings/settings.routes.js',
  'server/src/student/student.routes.js',
  'server/test/auth.service.test.js',
  'server/test/auth.validation.test.js',
  'server/test/rate-limit.test.js',
  'scripts/email-verification-smoke.mjs',
]
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  assert(result.status === 0, `JavaScript syntax is valid: ${file}${result.stderr ? `\n${result.stderr}` : ''}`)
}

console.log(`Phase 3 frontend and rate-limit smoke checks passed (${assertions.length} assertions).`)
