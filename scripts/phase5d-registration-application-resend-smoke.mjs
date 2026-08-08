import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`Phase 5D smoke failed: ${message}`)
}
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const policy = read('server/src/operations/workflow.policy.js')
const routes = read('server/src/operations/workflow.routes.js')
const app = read('server/src/app.js')
const operationsRoutes = read('server/src/operations/operations.routes.js')
const studentRoutes = read('server/src/student/student.routes.js')
const fileAuth = read('server/src/files/file-authorization.js')
const fileService = read('server/src/files/file.service.js')
const email = read('server/src/auth/email.service.js')
const env = read('server/src/config/env.js')
const envExample = read('.env.example')
const client = read('src/operations/operationsData.js')
const ui = read('src/operations/OperationsExperience.jsx')
const openapi = read('server/src/openapi/openapi.document.js')
const checklist = read('things-to-do.md')
const policyTest = read('server/test/workflow.policy.test.js')
const integrationTest = read('server/test/workflow-management.integration.test.js')
const fileTest = read('server/test/secure-files.test.js')

check(policy.includes('applicationTransitions'), 'application transition map missing')
check(policy.includes("SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN']"), 'SUBMITTED transition policy missing')
check(policy.includes("UNDER_REVIEW: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN']"), 'UNDER_REVIEW transition policy missing')
check(policy.includes("SHORTLISTED: ['ACCEPTED', 'REJECTED', 'WITHDRAWN']"), 'SHORTLISTED transition policy missing')
check(policy.includes("createdById: user.id"), 'Staff creator scope missing')
check(policy.includes('RESOURCE_OWNERSHIP_DENIED'), 'Staff ownership denial missing')
check(policy.includes("status === 'CONFIRMED' ? 'REGISTERED'"), 'REGISTERED API mapping missing')

check(app.includes("app.use('/api/operations', workflowRouter)"), 'workflow router mount missing')
check(routes.includes("router.get('/registrations'"), 'registration list endpoint missing')
check(routes.includes("router.get('/registrations/:id'"), 'registration detail endpoint missing')
check(routes.includes("router.patch('/registrations/:id/attendance'"), 'manual attendance endpoint missing')
check(routes.includes("router.get('/applications'"), 'application list endpoint missing')
check(routes.includes("router.get('/applications/:id'"), 'application detail endpoint missing')
check(routes.includes("router.patch('/applications/:id/status'"), 'application status endpoint missing')
check(routes.includes('pageSize: z.coerce.number().int().min(1).max(50)'), 'workflow page-size limit missing')
check(routes.includes("sortBy: z.enum(['createdAt', 'updatedAt', 'status'])"), 'registration sort allowlist missing')
check(routes.includes("sortBy: z.enum(['submittedAt', 'updatedAt', 'status'])"), 'application sort allowlist missing')
check(routes.includes('assertManagedContentAccess'), 'object-level workflow authorization missing')
check(routes.includes('requireIdempotency'), 'workflow idempotency missing')
check(routes.includes("action: 'EVENT_ATTENDANCE_RECORDED'"), 'attendance audit missing')
check(routes.includes('APPLICATION_STATUS_CONFLICT'), 'application concurrent status protection missing')
check(routes.includes('applicationStatusHistory.create'), 'immutable application history missing')
check(routes.includes("type: 'APPLICATION_STATUS'"), 'application notification missing')
check(routes.includes('sendApplicationStatus'), 'application email trigger missing')
check(routes.includes('sendEventAttendance'), 'attendance email trigger missing')
check(operationsRoutes.includes("assertManagedContentAccess(req.auth.user, application.content, 'canManageApplications')"), 'legacy application action ownership hardening missing')

check(studentRoutes.includes("action: existing ? 'EVENT_REGISTRATION_REACTIVATED' : 'EVENT_REGISTRATION_CREATED'"), 'registration create audit missing')
check(studentRoutes.includes("action: 'EVENT_REGISTRATION_CANCELLED'"), 'registration cancellation audit missing')
check(studentRoutes.includes("action: 'EVENT_WAITLIST_PROMOTED'"), 'waitlist promotion audit missing')
check(studentRoutes.includes('sendWaitlistPromotion'), 'waitlist promotion email trigger missing')
check(studentRoutes.includes("action: existing ? 'APPLICATION_RESUBMITTED' : 'APPLICATION_SUBMITTED'"), 'application submission audit missing')
check(studentRoutes.includes("action: 'APPLICATION_WITHDRAWN'"), 'application withdrawal audit missing')

check(fileAuth.includes("application.content?.createdById === user.id"), 'Staff CV ownership rule missing')
check(fileService.includes('createdById: true'), 'CV authorization query creator field missing')
check(fileTest.includes("id: 'staff-other'"), 'CV cross-Staff denial test missing')

check(env.includes("EMAIL_DELIVERY_MODE: z.enum(['console', 'smtp', 'resend', 'disabled'])"), 'Resend delivery mode missing')
check(env.includes('RESEND_API_KEY'), 'Resend API key validation missing')
check(env.includes("RESEND_API_URL: z.string().url().default('https://api.resend.com/emails')"), 'Resend API URL missing')
check(env.includes('Production requires SMTP or Resend email delivery.'), 'production email fail-closed rule missing')
check(envExample.includes('EMAIL_DELIVERY_MODE=console'), 'email delivery mode example missing')
check(envExample.includes('RESEND_API_KEY='), 'Resend key env placeholder missing')
check(envExample.includes('RESEND_REPLY_TO='), 'Resend reply-to env placeholder missing')
check(email.includes('Authorization: `Bearer ${env.RESEND_API_KEY}`'), 'Resend bearer authorization missing')
check(email.includes("'User-Agent': 'UniNet/Phase5D'"), 'Resend direct HTTP User-Agent header missing')
check(email.includes("method: 'POST'"), 'Resend POST request missing')
check(email.includes('AbortSignal.timeout(15_000)'), 'Resend timeout missing')
check(email.includes('async sendApplicationStatus'), 'application status email template missing')
check(email.includes('async sendEventAttendance'), 'attendance email template missing')
check(email.includes('async sendWaitlistPromotion'), 'waitlist email template missing')

check(client.includes('async listRegistrations'), 'registration frontend API client missing')
check(client.includes('async markRegistrationAttended'), 'attendance frontend mutation missing')
check(client.includes('async listApplications'), 'application frontend API client missing')
check(client.includes('async getApplication'), 'application detail frontend client missing')
check(client.includes('async updateApplicationStatus'), 'application status frontend client missing')
check(client.includes('async downloadApplicationCv'), 'authorized CV download frontend client missing')
check(ui.includes('function RegistrationManagementPage'), 'registration management UI missing')
check(ui.includes('"REGISTERED", "WAITLISTED", "CANCELLED", "ATTENDED"'), 'registration status filter UI missing')
check(ui.includes('Ирц батлах'), 'manual attendance UI action missing')
check(ui.includes('function ApplicationManagementPage'), 'application management UI missing')
check(ui.includes('nextApplicationStatuses'), 'application UI state machine missing')
check(ui.includes('CV татах'), 'CV download UI missing')
check(ui.includes('Төлөвийн түүх'), 'application history UI missing')
check(ui.includes('<PaginationControls'), 'workflow pagination UI missing')

check(/version: '1\.[3-9]\.0'/.test(openapi), 'OpenAPI 1.3.0 or later missing')
for (const endpoint of [
  '/api/operations/registrations',
  '/api/operations/registrations/{id}/attendance',
  '/api/operations/applications',
  '/api/operations/applications/{id}/status',
]) check(openapi.includes(endpoint), `OpenAPI endpoint missing: ${endpoint}`)
check(openapi.includes('ApplicationStatusUpdateRequest'), 'OpenAPI application status schema missing')
check(openapi.includes('WorkflowPageSize'), 'OpenAPI workflow page-size parameter missing')

check(policyTest.includes('enforces the linear review-shortlist-decision state machine'), 'workflow policy unit test missing')
check(integrationTest.includes('keeps Staff registration reads creator-scoped'), 'registration integration test missing')
check(integrationTest.includes('enforces Staff application ownership'), 'application integration test missing')
check(integrationTest.includes("action: { startsWith: 'APPLICATION_' }"), 'application audit integration assertion missing')
check(checklist.includes('## 30. Phase 5D'), 'Phase 5D checklist section missing')
check(checklist.includes('[x] Frontend registration page-д search/filter/pagination'), 'registration UI checklist not completed')
check(checklist.includes('[x] `EMAIL_DELIVERY_MODE=resend`'), 'Resend checklist not completed')
check(checklist.includes('[ ] Windows Node 24 + PostgreSQL'), 'honest final verification item missing')

const syntaxFiles = [
  'server/src/app.js',
  'server/src/operations/workflow.policy.js',
  'server/src/operations/workflow.routes.js',
  'server/src/operations/operations.routes.js',
  'server/src/student/student.routes.js',
  'server/src/files/file-authorization.js',
  'server/src/files/file.service.js',
  'server/src/auth/email.service.js',
  'server/src/config/env.js',
  'server/src/openapi/openapi.document.js',
  'server/test/workflow.policy.test.js',
  'server/test/workflow-management.integration.test.js',
  'server/test/secure-files.test.js',
  'server/test/environment-security.test.js',
]
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  check(result.status === 0, `${file} syntax error: ${result.stderr}`)
}

console.log(`Phase 5D smoke passed: ${assertions} assertions.`)
