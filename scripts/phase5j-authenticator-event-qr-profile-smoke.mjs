import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { openApiDocument } from '../server/src/openapi/openapi.document.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); const read=r=>fs.readFileSync(path.join(root,r),'utf8'); let checks=0
const has=(f,n)=>{assert.ok(read(f).includes(n),`${f} includes ${n}`);checks++}; const lacks=(f,n)=>{assert.ok(!read(f).includes(n),`${f} excludes ${n}`);checks++}
has('src/ui/StyledSelect.jsx','open ? "z-[300]" : "z-20"')
has('src/dashboard/NotificationDropdown.jsx','/notifications/read-all')
has('src/student/StudentExperience.jsx','function StudentNotificationsPage')
has('src/operations/OperationsExperience.jsx','function OperationsNotificationsPage')
has('server/src/auth/auth.repository.js',"const nextStatus = 'ACTIVE'")
lacks('src/memberships/MembershipManagement.jsx','function PendingStudentsPanel')
has('server/src/universities/university.routes.js',"router.patch('/me/profile'")
has('server/prisma/schema.prisma','UNIVERSITY_LOGO')
has('server/src/files/file.routes.js',"router.post('/university/logo'")
has('src/operations/OperationsExperience.jsx','function UniversityProfilePage')
has('src/student/StudentUI.jsx','variant === "ticket"')
// Password recovery evolved in Phase 5M to Resend OTP; Student Authenticator recovery must stay removed.
has('server/src/auth/auth.routes.js',"'/password-reset/verify-otp'")
has('server/src/auth/auth.service.js','sendPasswordResetOtp')
has('src/Uninetlanding.jsx','authView === "forgot-otp"')
lacks('src/Uninetlanding.jsx','forgot-authenticator')
lacks('server/src/auth/auth.routes.js',"'/password-reset/totp")
// Ticket acquisition stays button-driven; signed entry ticket remains.
lacks('src/operations/OperationsExperience.jsx','function EventRegistrationQr')
has('src/student/StudentExperience.jsx','Тасалбар авах')
has('src/student/StudentExperience.jsx','QR тасалбараа үзүүлэхгүй бол арга хэмжээнд нэвтрэх боломжгүй')
has('server/src/student/student.routes.js','createEventTicket')
has('src/operations/OperationsExperience.jsx','function AttendanceScanner')
has('.env.example','APP_URL=http://localhost:5174'); has('.env.example','localhost:5433')
for(const route of ['/api/auth/password-reset/request','/api/auth/password-reset/verify-otp','/api/public/universities/{id}/logo','/api/files/university/logo']){assert.ok(openApiDocument.paths[route],`OpenAPI path missing: ${route}`);checks++}
assert.ok(openApiDocument.components.schemas.FilePurpose.enum.includes('UNIVERSITY_LOGO'));checks++
console.log(`Phase 5J compatibility smoke passed: ${checks} assertions.`)
