import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
let assertions = 0
async function source(path) { return readFile(resolve(root, path), 'utf8') }
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`Phase 5E smoke failed: ${message}`)
}

const [
  packageJson,
  errorMessages,
  errorScreen,
  apiClient,
  operationsUi,
  operationsClient,
  studentUi,
  roleGuard,
  membershipValidation,
  universityValidation,
  membershipRoutes,
  universityRoutes,
  workflowRoutes,
  resetDemo,
  seed,
  authMatrix,
  idorIntegration,
  frontendErrorTest,
  frontendSecurityTest,
  e2e,
  checklist,
  demoGuide,
  report,
  asvsMap,
] = await Promise.all([
  source('package.json'),
  source('src/errors/errorMessages.js'),
  source('src/errors/HttpErrorState.jsx'),
  source('src/api/apiClient.js'),
  source('src/operations/OperationsExperience.jsx'),
  source('src/operations/operationsData.js'),
  source('src/student/StudentExperience.jsx'),
  source('src/auth/RoleGuard.jsx'),
  source('server/src/memberships/membership.validation.js'),
  source('server/src/universities/university.validation.js'),
  source('server/src/memberships/membership.routes.js'),
  source('server/src/universities/university.routes.js'),
  source('server/src/operations/workflow.routes.js'),
  source('scripts/reset-demo.mjs'),
  source('server/prisma/seed.js'),
  source('server/test/phase5e-authorization-matrix.test.js'),
  source('server/test/phase5e-critical-idor.integration.test.js'),
  source('server/test/frontend-error-messages.test.js'),
  source('server/test/frontend-security-contract.test.js'),
  source('e2e/final-mvp.spec.js'),
  source('things-to-do.md'),
  source('PHASE-5E-UI-BACKEND-DEMO-GUIDE.md'),
  source('PHASE-5E-REPORT.md'),
  source('docs/security/asvs-mvp-evidence.md'),
])

const pkg = JSON.parse(packageJson)
check(pkg.scripts['db:demo-reset'] === 'node scripts/reset-demo.mjs', 'safe demo reset script missing')
check(pkg.scripts['test:phase5e-smoke'] === 'node scripts/phase5e-final-mvp-smoke.mjs', 'Phase 5E smoke package script missing')

for (const code of ['TENANT_ACCESS_DENIED', 'RESOURCE_OWNERSHIP_DENIED', 'REGISTRATION_MANAGE_FORBIDDEN', 'APPLICATION_STATUS_TRANSITION_INVALID', 'UNIVERSITY_VERIFIED_DOMAIN_REQUIRED']) {
  check(errorMessages.includes(code), `Mongolian error mapping missing: ${code}`)
}
for (const status of ['403', '404', '500']) check(errorScreen.includes(`${status}:`), `dedicated ${status} error UI missing`)
check(apiClient.includes('mongolianErrorMessage(errorLike'), 'API error envelope is not mapped centrally')
check(studentUi.includes('<HttpErrorState status={404}'), 'Student unknown route 404 screen missing')
check(roleGuard.includes('<HttpErrorState status={403}'), 'role guard 403 screen missing')
check(operationsUi.includes('errorScreenStatus(error)'), 'Operations root error screen selection missing')
check(operationsUi.includes('UniversityDomainConsole'), 'University/domain management UI missing')
for (const label of ['Домэйн нэмэх', 'Admin approval', 'Primary болгох', 'SUSPEND']) check(operationsUi.includes(label), `domain workflow UI action missing: ${label}`)
for (const method of ['getUniversity', 'addUniversityDomain', 'requestDomainVerification', 'verifyUniversityDomain', 'makePrimaryUniversityDomain', 'revokeUniversityDomain']) check(operationsClient.includes(`async ${method}`), `frontend API integration missing: ${method}`)

check((membershipValidation.match(/max\(50\)/g) || []).length >= 2, 'membership pagination is not capped at 50')
check(universityValidation.includes('pageSize: z.coerce.number().int().min(1).max(50)'), 'university pagination is not capped at 50')
for (const route of ["'/invitations', searchReadLimiter", "'/students', searchReadLimiter", "'/students/pending', searchReadLimiter", "'/staff', searchReadLimiter", "'/roster', searchReadLimiter", "'/roster/imports', searchReadLimiter"]) {
  check(membershipRoutes.includes(route), `membership search limiter missing: ${route}`)
}
check(universityRoutes.includes("requireRole('PLATFORM_SUPER_ADMIN'), searchReadLimiter"), 'university search limiter missing')
check(workflowRoutes.includes("router.get('/registrations', searchReadLimiter"), 'registration search limiter missing')
check(workflowRoutes.includes("router.get('/applications', searchReadLimiter"), 'application search limiter missing')

for (const guard of ['NODE_ENV === \'production\'', 'DEMO_RESET_CONFIRM', 'RESET_UNINET_DEMO', 'Refusing to reset unexpected database']) check(resetDemo.includes(guard), `demo reset safety missing: ${guard}`)
for (const fixture of ['Final MVP Backend Demo Event', 'Final MVP Full-stack Internship', 'Final MVP Student Feedback', 'NUM-FINAL-MVP-EVENT-001']) check(seed.includes(fixture), `deterministic seed fixture missing: ${fixture}`)

for (const moduleName of ['content', 'registration', 'application', 'survey', 'tenant']) check(authMatrix.toLowerCase().includes(moduleName), `authorization matrix coverage missing: ${moduleName}`)
for (const path of ['/api/operations/content/', '/api/surveys/', '/api/operations/registrations/', '/api/operations/applications/', '/api/memberships/students/']) check(idorIntegration.includes(path), `critical IDOR integration coverage missing: ${path}`)
for (const action of ['CONTENT_ARCHIVED', 'SURVEY_STATUS_CHANGED', 'STUDENT_REVIEW_APPROVED']) check(idorIntegration.includes(action), `sensitive audit assertion missing: ${action}`)
check(idorIntegration.includes('pageSize=51'), 'oversized pagination integration assertion missing')
check(idorIntegration.includes('sortBy=password'), 'sort allowlist integration assertion missing')
check(frontendErrorTest.includes('selects dedicated 403, 404 and 500 screens'), 'frontend error mapping test missing')
check(frontendSecurityTest.includes('rejecting raw SQL APIs'), 'SQL injection source contract missing')
check(frontendSecurityTest.includes('neutralizes spreadsheet formula'), 'CSV formula security test missing')
for (const identity of ['staff@num.edu.com', 'student@num.edu.mn', 'superadmin@uninet.local']) check(e2e.includes(identity), `deterministic E2E identity missing: ${identity}`)
check(e2e.includes('/student/does-not-exist'), 'E2E 404 flow missing')
check(e2e.includes('/platform/universities'), 'E2E university/domain flow missing')
check(checklist.includes('Phase 5E — Final MVP stabilization'), 'Phase 5E checklist section missing')
check(demoGuide.includes('Frontend-ээр backend'), 'frontend backend demo guide missing')
check(report.includes('Бүрэн баталгаажуулалтын хязгаар'), 'honest verification boundary missing from report')
check(asvsMap.includes('MVP security objective'), 'ASVS-oriented evidence map missing')
const checked = (checklist.match(/^- \[x\]/gm) || []).length
const unchecked = (checklist.match(/^- \[ \]/gm) || []).length
check(checked / (checked + unchecked) >= 0.70, 'roadmap implementation evidence is below the 70% checkpoint')

console.log(`Phase 5E final MVP smoke passed: ${assertions} assertions`)
