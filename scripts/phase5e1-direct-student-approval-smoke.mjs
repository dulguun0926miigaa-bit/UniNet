import fs from 'node:fs'

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const authRepository = read('server/src/auth/auth.repository.js')
const migration = read('server/prisma/migrations/20260806170000_phase5j_student_access_qr_profile/migration.sql')
const membershipRepository = read('server/src/memberships/membership.repository.js')
const membershipUi = read('src/memberships/MembershipManagement.jsx')
const membershipService = read('server/src/memberships/membership.service.js')

const assertions = [
  [authRepository.includes("const nextStatus = 'ACTIVE'"), 'verified Student registration now activates directly'],
  [migration.includes("SET \"status\" = 'ACTIVE'"), 'migration activates verified legacy pending Students'],
  [!membershipUi.includes('id: "pending-students"'), 'pending Student approval tab is removed'],
  [!membershipUi.includes('function PendingStudentsPanel'), 'pending Student approval panel is removed'],
  [!membershipUi.includes('approvePendingStudent'), 'normal admin UI no longer calls approval mutation'],
  [membershipRepository.includes("approvalMode = rosterMember ? 'ROSTER_AUTO_LINKED' : 'DIRECT_ADMIN_APPROVAL'"), 'legacy recovery approval remains compatible'],
  [membershipService.includes('approvalMode: result.approvalMode'), 'legacy recovery service still exposes audit mode'],
]

const failed = assertions.filter(([ok]) => !ok)
for (const [ok, label] of assertions) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
if (failed.length) process.exit(1)
console.log(`Phase 5E.1 direct Student activation smoke passed: ${assertions.length} assertions`)
