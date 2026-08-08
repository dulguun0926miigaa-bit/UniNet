import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {openApiDocument} from '../server/src/openapi/openapi.document.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); const read=r=>fs.readFileSync(path.join(root,r),'utf8'); let n=0; const has=(f,x)=>{assert.ok(read(f).includes(x),`${f} missing ${x}`);n++}; const lacks=(f,x)=>{assert.ok(!read(f).includes(x),`${f} contains ${x}`);n++}
for(const route of ['/api/auth/password-reset/request','/api/auth/password-reset/verify-otp','/api/auth/password-reset/confirm']){assert.ok(openApiDocument.paths[route],`OpenAPI missing ${route}`);n++}
lacks('server/src/auth/auth.routes.js',"'/password-reset/totp")
has('server/src/auth/auth.repository.js','PASSWORD_HISTORY_COUNT'); has('server/src/auth/auth.repository.js','revokedAt: now')
has('src/Uninetlanding.jsx','authView === "forgot-otp"'); has('src/Uninetlanding.jsx','authView === "forgot-new-password"')
has('src/student/StudentExperience.jsx','Тасалбар амжилттай авлаа'); has('src/student/StudentExperience.jsx','QR тасалбараа үзүүлэхгүй бол арга хэмжээнд нэвтрэх боломжгүй')
lacks('src/operations/OperationsExperience.jsx','function EventRegistrationQr'); has('src/operations/OperationsExperience.jsx','function AttendanceScanner'); has('server/src/operations/operations.routes.js','/events/:id/attendance/scan')
lacks('server/src/middleware/step-up.js','x-action-reason'); lacks('src/auth/authService.js','Admin step-up:'); lacks('src/api/apiClient.js','highRiskMutationHeaderProvider')
has('src/dashboard/DashboardLayout.jsx','sticky top-0 z-[1000]'); has('src/dashboard/NotificationDropdown.jsx','z-[1100]'); has('src/ui/StyledSelect.jsx','open ? "z-[300]" : "z-20"')
has('scripts/run-services.mjs','Restarting in ${delay}ms'); has('src/api/apiClient.js','transientRetries'); has('src/api/apiClient.js','[502, 503, 504].includes')
has('docker-compose.yml','ports: ["5433:5432"]'); has('.env.example','localhost:5433')
console.log(`Phase 5K compatibility smoke passed: ${n} assertions.`)
