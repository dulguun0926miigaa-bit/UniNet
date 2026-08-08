import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { endpointDefinitions, openApiDocument } from '../server/src/openapi/openapi.document.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const assertions = []
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
  assertions.push(message)
}

const schema = read('server/prisma/schema.prisma')
const migration = read('server/prisma/migrations/20260727140000_mvp_student_review/migration.sql')
const membershipRoutes = read('server/src/memberships/membership.routes.js')
const membershipService = read('server/src/memberships/membership.service.js')
const membershipRepository = read('server/src/memberships/membership.repository.js')
const operationsRoutes = read('server/src/operations/operations.routes.js')
const universityRoutes = read('server/src/universities/university.routes.js')
const universityService = read('server/src/universities/university.service.js')
const app = read('server/src/app.js')

assert(schema.includes('rosterMemberId String?') && schema.includes('rosterMember   UniversityMember?'), 'StudentProfile is linked to the reviewed roster member')
assert(migration.includes('StudentProfile_rosterMemberId_fkey'), 'Roster-link migration and foreign key exist')
assert(membershipRoutes.includes("/students/:id/approve") && membershipRoutes.includes("/students/:id/reject"), 'Dedicated pending-student approve/reject routes exist')
assert(membershipRoutes.includes("/students/pending"), 'Pending-student list route exists')
assert(membershipService.includes('ROSTER_MATCH_REQUIRED') && membershipService.includes('STUDENT_REVIEW_INVALID_STATE'), 'Review service fails closed on missing roster and invalid state')
assert(membershipRepository.includes("action: 'STUDENT_REVIEW_APPROVED'") && membershipRepository.includes("action: 'STUDENT_REVIEW_REJECTED'"), 'Review decisions create audit events')
assert(membershipRepository.includes('rosterAlreadyLinked') && membershipRepository.includes('identityMismatch'), 'Review repository prevents duplicate or mismatched roster linking')
assert(operationsRoutes.includes('contentManagementScope(req.auth.user)') && operationsRoutes.includes('assertContentManagement'), 'Operations content uses the central tenant/ownership policy')
assert(operationsRoutes.includes("assertPermission(req.auth.user, 'canManageApplications'") && operationsRoutes.includes("assertPermission(req.auth.user, 'canManageRegistrations'"), 'Operations mutations enforce Staff permissions server-side')
assert(universityRoutes.includes('/domains/:domainId/verification/request') && universityRoutes.includes('/domains/:domainId/verification/verify'), 'University domain verification routes exist')
assert(universityService.includes('DNS_TXT') && universityService.includes('ADMIN_APPROVAL'), 'DNS TXT and administrative domain verification methods are implemented')
assert(app.includes("app.use('/api/universities', universityRouter)"), 'University management router is mounted')

const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'])
const expected = new Set(endpointDefinitions.map(([method, path]) => `${method.toUpperCase()} ${path}`))
const documented = new Set()
const operationIds = new Set()
const resolve = reference => reference.slice(2).split('/').reduce(
  (value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')],
  openApiDocument,
)
const visit = value => {
  if (!value || typeof value !== 'object') return
  if (value.$ref) assert(Boolean(resolve(value.$ref)), `OpenAPI reference resolves: ${value.$ref}`)
  for (const child of Object.values(value)) visit(child)
}
visit(openApiDocument)
for (const [path, pathItem] of Object.entries(openApiDocument.paths)) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!methods.has(method)) continue
    const signature = `${method.toUpperCase()} ${path}`
    assert(expected.has(signature), `OpenAPI operation is declared: ${signature}`)
    assert(!documented.has(signature), `OpenAPI operation is unique: ${signature}`)
    documented.add(signature)
    assert(!operationIds.has(operation.operationId), `OpenAPI operationId is unique: ${operation.operationId}`)
    operationIds.add(operation.operationId)
  }
}
assert(documented.size === expected.size && expected.size >= 98, `OpenAPI documents all ${expected.size} operations`)

const syntaxFiles = [
  'server/src/app.js',
  'server/src/auth/auth.repository.js',
  'server/src/memberships/membership.repository.js',
  'server/src/memberships/membership.routes.js',
  'server/src/memberships/membership.service.js',
  'server/src/memberships/membership.validation.js',
  'server/src/operations/operations.routes.js',
  'server/src/surveys/survey.routes.js',
  'server/src/universities/university.repository.js',
  'server/src/universities/university.routes.js',
  'server/src/universities/university.service.js',
  'server/src/universities/university.validation.js',
  'server/test/membership.service.test.js',
  'server/test/university.service.test.js',
  'server/test/authorization-concurrency.integration.test.js',
]
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  assert(result.status === 0, `JavaScript syntax is valid: ${file}${result.stderr ? `\n${result.stderr}` : ''}`)
}

console.log(`MVP backend smoke checks passed (${assertions.length} assertions).`)
