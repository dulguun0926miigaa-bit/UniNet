import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`Phase 5B smoke failed: ${message}`)
}

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const schema = read('server/prisma/schema.prisma')
const migration = read('server/prisma/migrations/20260728160000_survey_visibility_hardening/migration.sql')
const policy = read('server/src/authorization/policy.js')
const routes = read('server/src/surveys/survey.routes.js')
const validation = read('server/src/surveys/survey.validation.js')
const studentRoutes = read('server/src/student/student.routes.js')
const rateLimits = read('server/src/middleware/rate-limits.js')
const openapi = read('server/src/openapi/openapi.document.js')
const integration = read('server/test/authorization-concurrency.integration.test.js')
const unitPolicy = read('server/test/authorization-policy.test.js')
const unitValidation = read('server/test/survey.validation.test.js')
const checklist = read('things-to-do.md')

check(/model Survey[\s\S]*visibility\s+ContentVisibility\s+@default\(PRIVATE\)/.test(schema), 'Survey visibility schema field missing')
check(schema.includes('@@index([status, visibility, publishedAt])'), 'Survey visibility index missing')
check(schema.includes('@@index([universityId, status, visibility])'), 'Survey tenant visibility index missing')
check(migration.includes('ADD COLUMN "visibility" "ContentVisibility"'), 'Survey visibility migration column missing')
check(migration.includes("SET \"visibility\" = 'NETWORK'"), 'Legacy network survey migration missing')
check(migration.includes('Survey_status_visibility_publishedAt_idx'), 'Survey migration index missing')

check(policy.includes('export async function publishedSurveyAudienceScope(database, user)'), 'Async survey audience policy missing')
check(policy.includes("status: 'ACTIVE'"), 'Active partnership requirement missing from policy')
check(policy.includes("visibility: { in: ['PUBLIC', 'NETWORK'] }"), 'Public/network survey scope missing')
check(policy.includes("visibility: 'PRIVATE', universityId: user.universityId"), 'Own-private survey scope missing')
check(policy.includes("visibility: /** @type {import('@prisma/client').ContentVisibility} */ ('PARTNERS')"), 'Partner survey scope missing')
check(policy.includes('export function surveyReportScope'), 'Survey report scope missing')
check(policy.includes("user?.role === 'STAFF' ? { ...scoped, createdById: user.id }"), 'Staff creator scope missing')

check(routes.includes("requirePermission('canManageSurveys')"), 'Survey management permission middleware missing')
check(routes.includes("requirePermission('canViewReports')"), 'Survey report permission middleware missing')
check(routes.includes('publishedSurveyListQueryInput'), 'Published survey query validation missing')
check(routes.includes('manageSurveyListQueryInput'), 'Manage survey query validation missing')
check(routes.includes('surveyIdParamsInput'), 'Survey UUID params validation missing')
check(routes.includes('searchReadLimiter'), 'Survey search limiter missing')
check(routes.includes('AND: [audience, searchWhere(query.search)]'), 'Audience and search scopes are not safely combined')
check(routes.includes('SURVEY_ACTIVE_PARTNERSHIP_REQUIRED'), 'Partner publish guard missing')
check(routes.includes("['NETWORK', 'PUBLIC'].includes(input.visibility)"), 'Platform survey visibility guard missing')
check(routes.includes('findReportableSurvey'), 'Report object scope missing')

check(validation.includes("SURVEY_VISIBILITIES = ['PRIVATE', 'PARTNERS', 'NETWORK', 'PUBLIC']"), 'Survey visibility validation missing')
check(validation.includes('.max(50).default(20)'), 'Survey page-size bound missing')
check(validation.includes("z.enum(['publishedAt', 'title'])"), 'Published survey sort allowlist missing')
check(validation.includes("z.enum(['updatedAt', 'createdAt', 'title', 'status'])"), 'Manage survey sort allowlist missing')
check(validation.includes('surveyIdParamsInput'), 'UUID param schema missing')
check(studentRoutes.includes('publishedSurveyAudienceScope(prisma, req.auth.user)'), 'Student bootstrap survey audience policy missing')
check(rateLimits.includes("code: 'SEARCH_RATE_LIMITED'"), 'Search rate-limit code missing')
check(rateLimits.includes('limit: 60'), 'Search rate-limit threshold missing')

check(/version: '1\.[1-9]\.0'/.test(openapi), 'OpenAPI survey contract version missing')
check(openapi.includes('SurveyVisibility'), 'OpenAPI survey visibility missing')
check(openapi.includes('SurveyPublishedSortBy'), 'OpenAPI published sort parameter missing')
check(openapi.includes('SurveyManageSortBy'), 'OpenAPI manage sort parameter missing')
check(openapi.includes('SurveyPageSize'), 'OpenAPI survey page-size parameter missing')

check(integration.includes('runs the draft, edit, publish, respond, report, and close lifecycle through HTTP'), 'Survey lifecycle integration test missing')
check(integration.includes('enforces PRIVATE, NETWORK, and active PARTNERS visibility'), 'Survey visibility integration test missing')
check(integration.includes('Cross tenant mutation attempt'), 'Survey cross-tenant integration test missing')
check(integration.includes('requires canManageSurveys before a Staff member can create a survey'), 'Survey permission integration test missing')
check(unitPolicy.includes('keeps Staff survey management and reporting creator-scoped'), 'Survey policy unit test missing')
check(unitValidation.includes('bounded pagination, and sort/filter allowlists'), 'Survey query validation unit test missing')
check(checklist.includes('## 28. Phase 5B — Survey backend authorization hardening'), 'Phase 5B checklist section missing')

const syntaxFiles = [
  'server/src/authorization/policy.js',
  'server/src/middleware/rate-limits.js',
  'server/src/surveys/survey.routes.js',
  'server/src/surveys/survey.validation.js',
  'server/src/student/student.routes.js',
  'server/src/openapi/openapi.document.js',
  'server/test/authorization-policy.test.js',
  'server/test/survey.validation.test.js',
  'server/test/rate-limit.test.js',
  'server/test/integration-fixtures.js',
  'server/test/authorization-concurrency.integration.test.js',
]
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  check(result.status === 0, `${file} syntax error: ${result.stderr}`)
}

console.log(`Phase 5B smoke passed: ${assertions} assertions.`)
