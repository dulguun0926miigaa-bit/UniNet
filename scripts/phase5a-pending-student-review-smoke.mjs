import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let checks = 0
const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
const check = (condition, message) => { assert.ok(condition, message); checks += 1 }

// Phase 5J intentionally supersedes the Phase 5A "new Student waits for Admin"
// product rule. Legacy review endpoints remain for historical/recovery records,
// but the normal verified-domain registration UI and repository now activate
// Students directly.
const repository = read('server/src/auth/auth.repository.js')
const membershipUi = read('src/memberships/MembershipManagement.jsx')
const migration = read('server/prisma/migrations/20260806170000_phase5j_student_access_qr_profile/migration.sql')
const routes = read('server/src/memberships/membership.routes.js')
const service = read('server/src/memberships/membership.service.js')

check(repository.includes("const nextStatus = 'ACTIVE'"), 'verified Student registration resolves directly to ACTIVE')
check(repository.includes('Roster matching enriches the profile but no longer blocks first login'), 'roster is enrichment rather than approval gate')
check(!membershipUi.includes('id: "pending-students"'), 'University Admin UI no longer exposes a new-Student approval tab')
check(membershipUi.includes('students: ["ACTIVE", "SUSPENDED", "DEACTIVATED"]'), 'Student management defaults to active lifecycle states')
check(migration.includes("\"status\" = 'ACTIVE'"), 'legacy verified pending Students migrate to ACTIVE')
check(routes.includes("router.post('/students/:id/approve'"), 'legacy recovery approval API remains backward compatible')
check(service.includes('approveStudent'), 'legacy recovery service remains available for exceptional records')

console.log(`Phase 5A legacy compatibility smoke passed: ${checks} assertions (Phase 5J direct activation supersedes the old approval UI).`)
