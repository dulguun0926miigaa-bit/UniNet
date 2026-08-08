# UniNet full-stack төслийн хийсэн зүйл ба production roadmap

> Audit хийсэн огноо: 2026-08-04  
> Сүүлийн шинэчлэл: 2026-08-04 — Phase 5I security closure: generic OAuth identity model, encrypted TOTP MFA/recovery codes, mandatory Admin MFA, step-up/reason/audit gate, verified email change, password history/common-password screening болон progressive login backoff/suspicious alert хэрэгжүүлсний дараа дахин шалгав.  
> Audit-ийн хүрээ: `uninet-app/src`, `uninet-app/server/src`, `uninet-app/server/prisma`, tests, package/config файлууд.  
> Тэмдэглэгээ: `[x]` = repository дотор бодитоор хэрэгжсэн нь шалгагдсан. `[ ]` = хийгдээгүй, mock, placeholder, эсвэл production шаардлага хангаагүй.  
> Анхаарах зүйл: UI дээр харагддаг байх нь backend/database-тай ажиллаж байна гэсэн үг биш. Partial ажлыг “хийсэн дэд хэсэг” болон “үлдсэн дэд хэсэг” болгон тусад нь тэмдэглэв.

> 2026-07-27 Phase 1 баталгаажуулалт: email verification + roster matching implementation-д lint, server type-check, Node smoke, repository transaction mock, schema/migration structure болон HTTP/OpenAPI route smoke тест хийсэн. Native Prisma migration deploy болон Vitest/build-ийг clean Windows dependencies + PostgreSQL орчинд дахин ажиллуулах заавар `PHASE-1-TEST-REPORT.md`-д бий.

> 2026-07-27 Phase 3 баталгаажуулалт: Овог/Нэрийг тусдаа input болгож, `enrollmentYear`-ийг `graduationYear`-ээс салган Prisma migration/API/profile/settings-д холбож, Student болон Staff/Admin expanded sidebar-д icon + text зэрэг харагддаг болгож, global API + registration IP/account rate limit нэмсэн. `npm run test:phase3-smoke` source/syntax шалгалт 32 assertion-тай амжилттай болсон; Windows Node 24 орчинд migration, lint, Vitest болон build-ийг дахин ажиллуулна.

> 2026-07-28 Phase 5A баталгаажуулалт: University Admin-д tenant-scoped `PENDING_REVIEW` Student жагсаалт, хайлт/эрэмбэ/хуудслалт, approve/reject reason modal, optional roster record ID, loading/error/empty/success state болон dedicated real API integration нэмсэн. Generic status form-оор review workflow тойрох боломжийг UI дээр хаасан. `npm run test:phase5a-smoke` 23 assertion-тай амжилттай болсон; Windows Node 24 орчинд Vitest/lint/build болон PostgreSQL flow-г дахин ажиллуулна.

> 2026-07-28 Phase 5B баталгаажуулалт: Survey-д explicit `PRIVATE/PARTNERS/NETWORK/PUBLIC` visibility, ACTIVE partnership-aware audience scope, Student bootstrap/read/submit authorization, Staff creator-scoped management/report, University Admin tenant scope, strict UUID/query validation, page-size 50 limit, sort/filter allowlist болон search-specific rate limit нэмсэн. Unit/integration/smoke test source нэмсэн; энэ Linux орчинд Node 24 dependency суулгалт package gateway 503-аар тасарсан тул Prisma generate/Vitest/build-ийг Windows Node 24 + PostgreSQL дээр дахин ажиллуулна.
> 2026-07-29 Phase 5C баталгаажуулалт: local/demo орчинд 6 оронтой email verification-ийг feature flag-аар түр алгасаж roster match эсвэл `PENDING_REVIEW` рүү шууд шилждэг болгосон; production энэ bypass-ийг fail-closed хориглоно. 5 сургуулийн Student/Staff/University Admin seed account, tenant-scoped formula-safe membership/roster/error CSV export, audit, OpenAPI болон Survey frontend visibility/filter integration нэмсэн. Source/smoke/unit test-үүдийг нэмсэн; Windows Node 24 + PostgreSQL дээр full verification үлдсэн.
> 2026-07-29 Phase 5D баталгаажуулалт: event registration болон opportunity application management-д dedicated paginated API/UI, Staff creator ownership, tenant scope, manual attendance, immutable application status history, CV authorization, notification/audit болон Resend delivery environment нэмсэн. Source syntax, policy unit, PostgreSQL integration болон phase smoke test source нэмсэн; Windows Node 24 + PostgreSQL дээр full verification үлдсэн.

> 2026-07-30 Phase 5E баталгаажуулалт: Content/Survey/Registration/Application/Membership critical role × permission × tenant matrix болон foreign-ID HTTP integration test source, sensitive audit assertion, membership/university `pageSize <= 50`, allowlist/search limiter, guarded deterministic demo reset/seed, Монгол error mapping, dedicated 403/404/500 state, University/domain lifecycle frontend integration болон Playwright final MVP source нэмсэн. Source/static smoke-г энэ багц дээр ажиллуулна; PostgreSQL/Vitest/Playwright/lint/type-check/build-ийг Windows Node 24 орчинд final ажиллуулах шаардлагатай.

> 2026-08-04 Phase 5I баталгаажуулалт: Generic `OAuthAccount`, AES-256-GCM encrypted TOTP credential, one-time recovery code, mandatory University/Platform Admin MFA, session-bound step-up token + action reason + audit, verified same-university email change, password history/common-password denylist болон persistent exponential login backoff/suspicious-login notification нэмсэн. Dependency-free Phase 5I source/crypto smoke, бүх JavaScript syntax болон frontend JSX parse шалгалтыг энэ багц дээр ажиллуулсан; Prisma deploy, Vitest/integration, lint/type-check/build болон бодит Google callback-ийг Windows Node 24 + PostgreSQL + Google credentials орчинд дахин баталгаажуулна.

## 0. Одоогийн бодит төлөвийн товч дүгнэлт

- [x] React + Vite frontend ажилладаг.
- [x] Express API серверийн суурь ажилладаг.
- [x] PostgreSQL + Prisma schema, migration, seed бүтэц байна.
- [x] Database-backed student register/login/refresh/me/logout-all auth байна.
- [x] Role-based Student, Staff, University Admin, Platform Super Admin dashboard shell/UI байна.
- [x] Бүртгэлийн Овог, Нэрийг тусдаа `lastName`/`firstName` input болгож backend contract-той шууд холбосон.
- [x] `enrollmentYear`-ийг `graduationYear`-ээс салгаж, бүртгэл дээр зөвхөн одоогийн болон өмнөх он сонгодог болгосон.
- [x] Student болон Staff/Admin sidebar expanded үед icon + text, collapsed үед зөвхөн icon харагддаг болсон.
- [x] Global API болон registration-specific IP/account rate limiting нэмсэн.
- [x] University Admin pending Student review UI-г list/search/pagination/approve/reject real API-тай холбосон.
- [x] Staff/Admin event registration болон application management UI-г dedicated tenant/ownership-scoped API-тай холбосон.
- [x] Database-backed Staff survey үүсгэх, Student survey бөглөх үндсэн flow байна.
- [ ] Төслийг production-ready full-stack гэж үзэхэд хараахан бэлэн биш.
- [x] Student feed, event registration/waitlist/cancel, application/withdraw, saved content, notification read state, survey болон consent history бодит API/database-тай холбогдсон.
- [x] Staff/Admin/Super Admin-ийн bootstrap, content lifecycle, aggregate, partnership, audit, monitoring, membership invitation болон fixed Staff permission өгөгдөл/mutation dynamic болсон.
- [x] University domain verification/onboarding backend workflow хийсэн.
- [ ] Configurable permission matrix зэрэг үлдсэн operations mutation-уудыг дуусгах.
- [x] Settings account/security/preferences/device/consent/export/feedback data бодит API/database ашигладаг.
- [x] Database-backed password reset token, SMTP/Resend adapter, request/confirm flow болон session revocation бодитоор ажилладаг.
- [x] Email verification, verify/resend болон roster resolution backend/frontend flow бодитоор хэрэгжсэн.
- [x] Google OAuth/OIDC Authorization Code + PKCE болон encrypted TOTP MFA, one-time recovery code, Admin mandatory enrollment бодитоор хэрэгжсэн.
- [x] CI quality/migration/security gates, Docker build/runtime config болон structured observability үндсэн суурь хийсэн.
- [ ] Production security/OWASP ASVS external verification, deployed environment evidence болон backup/restore drill үлдсэн.

## 1. P0 — Production-оос өмнө заавал хаах blocker-ууд

- [ ] Frontend-ийн бүх mock data-г бодит API болон PostgreSQL model-оор солих.
- [ ] Multi-tenant data isolation-ийг бүх query, mutation дээр server-side enforce хийх.
- [x] `PATCH /api/auth/me/profile` дээр verified university/email солихыг server-side хаасан.
- [x] Access token-ийг зөвхөн memory-д хадгалж, refresh token-ийг `HttpOnly + SameSite=Strict + production Secure` cookie-д шилжүүлсэн.
- [x] Refresh rotation reuse detection болон token family revocation хийсэн.
- [x] Refresh rotation-ийг atomic compare-and-swap transaction болгож, нэг хуучин session-оос хоёр valid descendant үүсэх race-ийг хаасан.
- [x] OAuth 2.0 / OpenID Connect Authorization Code + PKCE flow хийх.
- [x] Password reset-ийг backend/database/session revocation-тэй бодитоор хийсэн.
- [x] Verified email болон backend-backed TOTP MFA/recovery flow бодитоор хэрэгжсэн.
- [ ] Staff permission-ийг зөвхөн UI биш API бүр дээр enforce хийх (`canManageSurveys`, `canCreateContent`, `canPublish` гэх мэт).
- [x] Survey list/detail/submit/manage/report endpoint-д audience, university, ACTIVE partnership, ownership болон permission authorization enforce хийсэн.
- [x] Content/EventRegistration/Application/Notification/Partnership/Audit model болон үндсэн API-уудыг хийсэн.
- [x] XSS/unsafe URL, CSRF origin, IDOR/BOLA, mass-assignment/injection болон auth/rate-limit security test нэмсэн.
- [ ] Strict CSP/security headers, trusted-proxy болон unsafe production config rejection хийсэн; edge HTTPS certificate, secret manager үлдсэн.
- [ ] Structured audit log, health/readiness хийсэн; security alerting, external error tracking, metrics үлдсэн.
- [ ] Automated database backup + point-in-time recovery + restore drill хийх.
- [x] CI pipeline дээр lint, type-check, unit/coverage, PostgreSQL integration, Chromium E2E/axe, migration/seed, build, dependency/secret security scan ажиллуулдаг болгосон.
- [x] README-ээс local privileged plaintext credential-ийг устгаж, `.env.example` placeholder/seed заавар үлдээсэн.
- [x] Dependency tree-ийн high/moderate findings-ийг compatible override/upgrade-аар засаж, `npm audit --audit-level=moderate` 0 vulnerability болсон.

## 2. Repository, runtime, суурь architecture

### Хийгдсэн

- [x] Frontend: React 19 + Vite 8.
- [x] Styling: Tailwind CSS v4/PostCSS суурь.
- [x] Backend: Express 5 REST API.
- [x] Database access: Prisma Client + PostgreSQL adapter.
- [x] Root package scripts: frontend dev, backend dev/start, build, lint, test, type-check, Prisma generate/migrate/deploy/seed/studio.
- [x] `.env.example`-д database, API URL, JWT, CORS, port болон seed-ийн үндсэн хувьсагчид байна.
- [x] Backend environment variables Zod-оор startup үед validate хийгддэг.
- [x] SIGINT/SIGTERM үед HTTP server болон Prisma connection graceful shutdown хийдэг.
- [x] `/api/health` basic endpoint байна.
- [x] `package-lock.json` dependency version-уудыг lock хийсэн.

### Дутуу

- [ ] Frontend/backend-ийг тусдаа package/workspace болгон цэгцлэх эсвэл monorepo workspace тодорхой болгох.
- [x] Architecture Decision Record (ADR), system context, container/component diagram нэмэх.
- [ ] React Router зэрэг production router ашиглаж, deep-link, nested route, 404, route loader/error boundary хийх. Одоо `history.pushState`-ийг гараар удирдаж байна.
- [x] Одоогийн unversioned `/api` surface-ийг v1 compatibility line гэж ADR/API policy-д тогтоож, backward-compatible OpenAPI baseline test хийсэн.
- [x] OpenAPI 3.1 specification, 78 endpoint-ийн contract болон CSP-safe `/api/docs` index хийсэн.
- [ ] Swagger UI болон generated typed API client хийх.
- [ ] Frontend-ийг TypeScript strict mode руу шилжүүлэх.
- [ ] Backend `checkJs`-ийг `strict: true` болгох эсвэл TypeScript руу шилжүүлэх.
- [ ] Shared domain types/schema contract үүсгэж frontend/backend schema drift-ээс хамгаалах.
- [ ] Request-scoped dependency/context, service/repository/domain layer-ийг бүх module-д жигд хэрэглэх.
- [x] `/live` болон одоогийн бодит dependency болох PostgreSQL-ийг шалгадаг `/ready` endpoint хийсэн.
- [x] Node/npm runtime-ийг `.nvmrc`, `.node-version`, `engines` болон `packageManager`-аар pin хийсэн.
- [x] Multi-stage frontend/backend production Docker build, Nginx SPA runtime болон Compose orchestration нэмсэн.
- [ ] Сонгосон production provider-ийн IaC/deploy configuration болон environment rollout хийх.
- [ ] Git repository-г initialize/repair хийх; audit үед workspace-ийн `.git` usable repository биш байсан бөгөөд `git status` ажиллаагүй.

## 3. PostgreSQL ба Prisma

### Хийгдсэн model ба constraint

- [x] `University` model.
- [x] `UniversityDomain` model; unique domain болон university index.
- [x] `User` model; unique email/normalizedEmail, role/status/university index.
- [x] `UniversityMember` roster model; university+email/studentId/employeeCode unique constraint.
- [x] `StudentProfile` model; user unique, university+studentId unique constraint.
- [x] `StaffProfile` болон permission boolean-ууд.
- [x] `Session` model; hashed refresh token, expiry/revocation metadata.
- [x] `PasswordResetToken` model.
- [x] `Survey` model.
- [x] `SurveyResponse` model; нэг хэрэглэгч нэг survey-д нэг response constraint.
- [x] User, university roster, survey schema-д migration файлууд байна.
- [x] Seed нь 5 university, verified official domain болон opt-in demo/role user үүсгэдэг.
- [x] Seed privileged account-ууд env flag-гүйгээр автоматаар үүсэхгүй.

### Засах болон нэмэх

- [x] `EmailVerificationToken` model болон migration нэмсэн; HMAC-hashed 6 оронтой код, expiry, attempt count, one-time consume metadata-тай.
- [x] Generic `OAuthAccount` model нэмсэн (`provider`, canonical issuer+subject, verified provider email, metadata, linkedAt/lastUsedAt); provider token-ийг хадгалдаггүй.
- [x] MFA TOTP secret-ийг AES-256-GCM encrypted ciphertext/IV/tag хэлбэрээр, recovery code-ийг one-time HMAC hash хэлбэрээр хадгалах model/migration нэмсэн.
- [ ] WebAuthn credential/passkey model болон phishing-resistant authentication нэмэх.
- [x] Session token family, rotatedFrom, compromisedAt, lastUsedAt нэмсэн.
- [x] `Content` үндсэн model болон type/status/visibility enum хийсэн.
- [x] Event-ийн capacity/deadline/location/start/end талбаруудыг `Content` model-д хийсэн.
- [x] Internship/Job/Research/Announcement-ийг typed `Content` болон structured `details`-аар хадгалдаг.
- [ ] Category, tag, content-tag join models хийх.
- [x] Content approval/status history model, actor, reason/review comment metadata хийсэн.
- [ ] Тусдаа approval request aggregate шаардлагатай эсэхийг workflow өргөжих үед шийдэх.
- [x] Cross-university content share/audience rules-ийг `ContentVisibility` болон ACTIVE `Partnership` model/policy-оор хэрэгжүүлсэн.
- [x] Saved content model хийсэн.
- [x] Event registration, waitlist position, cryptographically random registration code болон attendance model хийсэн.
- [x] Application/CV URL/status/review timestamp болон immutable status history model хийсэн.
- [x] Application нь private scanned `CV` FileAsset relation ашиглаж, URL fallback-аас тусдаа object storage metadata хадгалдаг.
- [x] Notification болон read state model хийсэн; delivery attempt/email/push model үлдсэн.
- [x] Partnership үндсэн model/status/shared count хийсэн; invitation expiry/shared scope үлдсэн.
- [x] `UniversityInvitation` model-д tenant, role, hashed token, expiry, accept/revoke metadata хийсэн.
- [x] CSV import job, row error, imported member audit models хийх.
- [x] Consent record grant/revoke history, immutable versioned policy document болон policy acceptance model хийсэн.
- [x] `AuditLog` model хийсэн; DB-level immutability policy үлдсэн.
- [x] User settings/preferences model хийсэн.
- [x] Feedback ticket model хийсэн.
- [x] `FileAsset` owner/tenant/purpose/status/storageKey/hash/detected MIME/name/size/scan metadata model, indexes, migration хийсэн.
- [x] Survey `status`-ийг `SurveyStatus` enum болгосон.
- [x] Draft survey-ийн `publishedAt`-ийг nullable болгосон.
- [x] Survey question JSON-д өсдөг `schemaVersion` хийсэн.
- [x] Survey response-д `surveySchemaVersion` snapshot хадгалдаг болсон.
- [ ] Soft delete (`deletedAt`) болон retention/anonymization strategy нэмэх.
- [x] Content aggregate-д optimistic locking `version` болон 409 conflict хамгаалалт нэмсэн.
- [ ] Бусад race-sensitive aggregate-д шаардлагатай version/locking-ийг query profile-д үндэслэн нэмэх.
- [ ] CreatedBy/updatedBy ownership metadata-г бүх sensitive resource-д нэмэх.
- [ ] Tenant-aware composite index-үүдийг real query plan дээр үндэслэн нэмэх.
- [ ] Migration rollback/forward-fix policy, staging migration test хийх.
- [x] Production migration хийхийн өмнөх backup болон zero-downtime migration runbook хийх.

## 4. Local authentication ба session management

### Хийгдсэн

- [x] Student register endpoint (`POST /api/auth/register`).
- [x] Login endpoint (`POST /api/auth/login`).
- [x] Refresh endpoint (`POST /api/auth/refresh`).
- [x] Authenticated current-user endpoint (`GET /api/auth/me`).
- [x] Logout-all endpoint (`POST /api/auth/logout-all`).
- [x] Email lowercase normalization.
- [x] Client-ээс role/universityId авч privilege escalation хийхгүй; public register үргэлж Student үүсгэдэг.
- [x] Password policy: 12+ тэмдэгт, том/жижиг үсэг, тоо, тусгай тэмдэг.
- [x] Password Argon2id-оор salt-тай hash хийгддэг.
- [x] Access болон refresh JWT-д expiry, issuer, audience, token type бий.
- [x] Refresh token database-д plaintext биш SHA-256 hash-аар хадгалагддаг.
- [x] Refresh хийхэд хуучин session revoke хийгээд шинэ session/token үүсгэдэг.
- [x] User болон university ACTIVE эсэхийг login/auth middleware шалгадаг.
- [x] Login/register/refresh дээр basic rate limiter байна.
- [x] Invalid login-д generic error ашиглаж email enumeration-ийг тодорхой хэмжээнд багасгасан.

### Дутуу/засах

- [x] `EmailVerificationToken` + verify/resend flow хийсэн; expiry, cooldown, max-attempt, generic resend response болон audit event-тэй.
- [x] Бүртгүүлсэн email-ийг баталгаажуулахаас өмнө `emailVerifiedAt = null`, `PENDING_VERIFICATION` болгож session/token олгохгүй болсон.
- [x] Email verification finalize transaction дээр official university хэрэглэгчийг active `UniversityMember` STUDENT roster, enrollment status болон validity хугацаатай тулгаж enforce хийсэн.
- [x] Unknown/free email-ийг university Student гэж автоматаар идэвхжүүлэхгүй; email verify хийсний дараа `PENDING_REVIEW`/unaffiliated flow руу оруулдаг болсон.
- [x] Password forgot/reset request/confirm endpoint, generic response, hashed one-time token flow хийсэн.
- [x] Settings security API/UI-аар current password verify, 12+ complexity, confirmation, Argon2id hash бүхий password change бодитоор хийсэн.
- [x] Password reset үед бүх session revoke хийдэг болсон.
- [x] Password change policy: current session-ийг үлдээж, бусад бүх session болон ашиглаагүй reset token-ийг transaction-аар revoke/consume хийдэг.
- [x] Verified email/university identity өөрчлөлтийг server-side lock хийж, password change-д current password шаарддаг болсон.
- [x] Verified email солихдоо same-university verified domain, uniqueness/pending-conflict, one-time expiring token, email delivery, session revocation болон audit flow хийсэн.
- [x] Verified university болон university email-ийг Student profile/settings mutation дээр server-side өөрчлөхийг хориглосон.
- [x] Single-session `POST /api/auth/logout` endpoint нэмсэн.
- [x] Active session/device list, current-device badge, last-used metadata болон өөрийн нэг session revoke endpoint хийсэн.
- [x] Refresh token-ийг response body/sessionStorage-оос гаргаж `HttpOnly`, production `Secure`, `SameSite=Strict` cookie-д хадгалдаг болсон.
- [x] Access token-ийг module memory-д хадгалж XSS үеийн persistent token theft эрсдэлийг бууруулсан.
- [x] Refresh token reuse detection, token family, replay үед бүх family revoke хийдэг болсон.
- [x] Refresh endpoint дээр user болон university status-ийг дахин шалгадаг болсон.
- [x] Access token бүр session id-тай бөгөөд middleware request бүрт session revocation/status шалгадаг; password reset/suspension бүх session, password change бусад session-ийг revoke хийж access-ийг шууд хаадаг.
- [x] `REDIS_URL` тохируулсан үед TLS-capable Redis-backed distributed rate-limit store ашиглаж, production-д Redis/TLS-ийг fail-fast шаарддаг.
- [x] Authentication дээр тусдаа IP болон SHA-256 account/email key-based throttling хийсэн.
- [x] Persistent email+IP security state, capped exponential login backoff, suspicious failure threshold, in-app security notification болон high-severity audit хийсэн.
- [x] Credential stuffing-ийн IP/account throttling болон generic login error хамгаалалт хийсэн.
- [x] High-confidence common/breached password denylist, obvious-sequence screening болон configurable recent password history/reuse prevention хэрэгжүүлсэн.
- [x] TOTP MFA, QR/manual secret enrollment, login verification, one-time recovery codes, regeneration, replay protection болон optional-account disable flow хийсэн.
- [ ] WebAuthn/passkey enrollment/login/recovery flow нэмэх.
- [x] University Admin болон Platform Super Admin-д first-login TOTP enrollment, MFA-bound session/access token болон disable хориг бүхий mandatory MFA хийсэн.
- [x] Admin management mutation, verified email/password change, data export, device revoke, deactivate/delete-д password + MFA session-bound step-up auth хийсэн.
- [x] Register/login success-failure-blocked, refresh/reuse, logout, password reset болон password change auth event audit хийсэн.
- [x] MFA enroll/login/disable/recovery-code rotation болон step-up success/failure security audit event нэмсэн.
- [x] Refresh-token absolute expiry дээр нэмээд configurable session idle timeout болон bounded `lastUsedAt` touch policy-г backend authentication/refresh дээр enforce хийсэн.
- [x] Cookie refresh/logout flow-д strict SameSite + server-side Origin allowlist хамгаалалт нэмсэн.
- [x] Frontend startup бүрт HttpOnly refresh rotation хийж, дараа нь `GET /api/auth/me`-ээр live session/user/role/status баталгаажуулдаг болсон.
- [x] Frontend “Гарах” үйлдэл server logout-all API дуудаж дараа нь local session цэвэрлэдэг.
- [x] JWT sign/verify дээр `HS256` algorithm allowlist тодорхой заасан.
- [ ] Signing key rotation болон `kid` strategy хэрэгжүүлэх.

## 5. OAuth 2.0 / OpenID Connect / University SSO

> Security reference: [OWASP OAuth2 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html). SPA/login implementation-д Authorization Code + PKCE, transaction-specific `state`/OIDC `nonce`, exact redirect URI болон issuer validation-ийг баримтална.

### Одоогийн төлөв

- [x] Google OpenID Connect provider start/callback/first-login onboarding болон stored Google subject session flow хэрэгжүүлсэн.
- [x] Login болон registration dialog-д Google OAuth entry point нэмсэн; real delivery нь Google Cloud credentials шаарддаг.
- [ ] Microsoft Entra ID / Office 365 login байхгүй.
- [ ] University-specific OIDC/SAML SSO байхгүй.

### Хийх checklist

- [x] Provider strategy сонгосон: Google OpenID Connect-ийг primary provider болгож, Microsoft Entra ID болон university OIDC/SAML-ийг тусдаа future provider гэж баримтжуулсан.
- [x] Google OAuth client ID/secret/redirect/provider endpoint-үүдийг validated environment variable-аар удирддаг болсон.
- [x] Google Authorization Code flow + PKCE S256 ашигладаг; implicit grant ашигладаггүй.
- [x] Per-request cryptographically random signed `state` болон state-cookie equality ашиглан login CSRF-ээс хамгаалсан.
- [x] Per-request OIDC `nonce` үүсгэж signed PKCE cookie болон Google ID token claim-тэй тулган replay-ээс хамгаалсан.
- [x] Google redirect URI-г validated environment-ийн нэг exact callback URI-гаар тогтоож, callback redirect-ийг зөвхөн configured `APP_URL` руу хийдэг; open redirect input хүлээж авдаггүй.
- [x] Google tokeninfo verification дээр issuer, audience, expiry, nonce, `email_verified` болон subject claim-уудыг fail-closed байдлаар validate хийдэг.
- [x] Canonical Google issuer + provider subject (`googleIssuer + googleId`) composite identity key хадгалж, email-ээр silent account auto-link хийдэггүй.
- [x] Existing local Student account-т OAuth account link хийхдээ password re-authentication шаардах.
- [x] Email auto-link-ийг хориглож, password re-auth бүхий manual Student link, password-backed unlink, duplicate provider/Student conflict policy болон session revoke flow хийсэн.
- [x] OAuth onboarding-ийн school email domain-ийг active, verified `UniversityDomain` болон active university-тэй server-side тулгадаг.
- [x] Google callback-аас role/tenant авдаггүй; verified UniNet domain болон database registration workflow-оор Student/tenant тодорхойлдог.
- [ ] Staff/Admin OAuth login-ийг invitation/roster болон admin approval-тэй холбох.
- [x] Google access/ID token-ийг database-д хадгалдаггүй; callback verification дууссаны дараа зөвхөн canonical issuer, subject, Gmail metadata хадгалдаг.
- [x] OAuth cancel, provider error, expired/mismatched state/PKCE/nonce error-ийг fixed app redirect болон Монгол frontend message-ээр харуулдаг.
- [x] OAuth issuer/audience/expiry/nonce/email verification, exact redirect, state/PKCE source contract, duplicate-link болон conflict behavior-ийн security tests нэмсэн.
- [x] Google OAuth onboarding/login/account-create/link/unlink security audit event болон unlink session revocation flow нэмсэн.

## 6. Authorization, RBAC ба multi-tenancy

### Хийгдсэн

- [x] `UserRole` enum: Student, Staff, University Admin, Platform Super Admin.
- [x] Frontend role guard болон role-specific route shell байна.
- [x] Backend bearer-token authentication middleware байна.
- [x] Backend `requireRole` болон `requirePermission` helper байна.
- [x] Survey report query universityId-аар scope хийдэг.
- [x] User/university active төлөвийг auth middleware шалгадаг.

### Дутуу/эрсдэлтэй

- [ ] Frontend guard-ийг security boundary гэж үзэхгүй; API endpoint бүрт authorization policy enforce хийх.
- [x] `POST /api/surveys` дээр `canManageSurveys` permission enforce хийж, permissionгүй Staff-ийн integration test нэмсэн.
- [x] Staff/Admin survey, content болон membership/user management query/mutation-ийг creator/tenant scope-оор хязгаарласан.
- [x] Student зөвхөн visibility/tenant/ACTIVE partnership audience-д нь багтсан survey-г харах болон submit хийх server-side шалгалттай.
- [ ] Student content registration/application audience-ийн бүх edge case-ийг route matrix-аар бүрэн батлах.
- [x] `GET /api/surveys` болон Student bootstrap survey list-ийг `PRIVATE/PARTNERS/NETWORK/PUBLIC`, tenant болон ACTIVE partnership дүрмээр хязгаарласан.
- [x] Survey report/export-д Staff creator ownership + `canViewReports`, University Admin tenant scope, Platform Super Admin network scope policy хийсэн.
- [ ] Object-level authorization буюу BOLA/IDOR test бүх `/:id` endpoint-д хийх.
- [x] Critical content/survey/registration/application flow-ийн role, permission, ownership, tenant rule-ийг central policy modules-д нэгтгэсэн.
- [x] University Admin cross-tenant denial-ийг content, pending student review болон survey mutation integration test-ээр баталсан.
- [x] Protected Platform Super Admin management mutation бүр session-bound step-up token, MFA, 3–500 тэмдэгтийн reason болон high-severity audit шаарддаг болсон.
- [x] Unknown permission, missing tenant болон ownership mismatch дээр fail-closed deny-by-default policy хэрэгжүүлсэн.
- [ ] Database query helper/repository-д mandatory tenant scope хийх; developer tenant filter мартахаас хамгаалах.
- [x] PostgreSQL Row-Level Security ашиглах эсэхийг threat model-оор шийдэх.
- [x] University Admin зөвхөн Staff, Platform Super Admin зөвхөн University Admin урих separation-of-duties rule хийсэн.
- [x] Member status/Staff permission өөрчлөгдөхөд идэвхтэй session-уудыг transaction дотор revoke хийдэг болсон.

## 7. OWASP Top 10:2025 хамгаалалтын checklist

> Current reference: [OWASP Top 10:2025](https://owasp.org/www-project-top-ten/) болон [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/). Эхний тавыг тусгайлан P0/P1 түвшинд оруулав.

### A01:2025 Broken Access Control — Top 5 #1

- [x] Backend role middleware-ийн суурь байна.
- [x] Нэг report query tenant-аар scope хийгдсэн.
- [ ] API бүр дээр deny-by-default function-level болон object-level authorization хийх.
- [x] Critical Content/Survey/Registration/Application/Membership дээр tenant escape болон horizontal/vertical privilege escalation automated tests нэмсэн.
- [x] Auth, survey, workflow, membership, university болон privacy sensitive mutation-уудад strict Zod allowlist хэрэглэсэн.
- [x] Profile/settings API дээр verified email/university unauthorized mutation-ийг server-side хаасан.
- [ ] Admin action бүрийн ownership/tenant/permission policy-г бүх endpoint-д төвлөрүүлж matrix test-ээр бүрэн батлах; step-up/reason/audit gate хэрэгжсэн.
- [x] CORS-оос үл хамааран authentication, role, permission, tenant/ownership checks-ийг server API дээр хэрэгжүүлсэн.

### A02:2025 Security Misconfiguration — Top 5 #2

- [x] Helmet ашигладаг.
- [x] `x-powered-by` disabled.
- [x] CORS allowlist байна.
- [x] JSON body size 100KB limit байна.
- [x] Production 500 error дээр internal detail нуух basic error handler байна.
- [x] API болон SPA edge дээр explicit CSP, production HSTS, Referrer-Policy, Permissions-Policy тохируулж integration/header test нэмсэн.
- [x] SPA CSP-д self assets болон одоогийн Google Fonts origins-ийг explicit allowlist хийж Nginx config/build шалгасан.
- [x] `TRUST_PROXY`-г false эсвэл explicit positive hop count болгож env schema-аар validate хийн зөвхөн тохируулсан үед Express-д хэрэглэдэг болсон.
- [x] Default/demo plaintext credential-ийг repo/document-оос устгаж, opt-in env seed болон placeholder secret ашигладаг болсон.
- [x] Production startup дээр placeholder/equal JWT secret, localhost/non-TLS database, HTTP/wildcard CORS/App URL-ийг reject хийдэг validation/test нэмсэн.
- [x] Production build source map disabled, client error detail generic, structured log redacted бөгөөд admin endpoint-ууд authenticated role/tenant policy-той.
- [x] 404 болон unsupported route/method-д correlation id-тай consistent JSON error өгдөг болсон.
- [ ] Database, object storage, queue, monitoring endpoint-ийг public network-ээс тусгаарлах.

### A03:2025 Software Supply Chain Failures — Top 5 #3

- [x] npm lockfile байна.
- [x] Prisma/find-my-way/valibot болон нэмэлт transitive findings-ийг tested compatible overrides-оор засаж audit-ийг 0 болгосон.
- [x] CI дээр reproducible `npm ci` ашигладаг.
- [x] Dependabot-д npm болон GitHub Actions update setup хийсэн.
- [x] CI дээр production болон full dependency `npm audit` SCA scan ажилладаг.
- [x] CI `npm audit --audit-level=moderate` болон dependency-review moderate+ finding дээр merge gate fail хийдэг.
- [x] Package-lock-оос CycloneDX 1.6 SBOM үүсгэж CI release evidence artifact болгон 90 хоног хадгалдаг.
- [x] Locked dependency бүрийн SPDX license allow/deny policy болон reviewed override бүхий CI license compliance gate хийсэн.
- [x] GitHub Actions болон third-party CI action-уудыг full commit SHA-аар pin хийсэн.
- [ ] Container image/dependency provenance, signing, verification хийх.
- [x] Full-history Gitleaks secret scanning болон PR dependency-review gate хийсэн.
- [x] Public npm registry-г explicit pin хийж, private package нэвтрүүлэх үед `@uninet/*` scope, authenticated registry болон provenance шаардах dependency-confusion policy баримтжуулсан.
- [x] Update SLA, emergency patch process, rollback plan хийх.

### A04:2025 Cryptographic Failures — Top 5 #4

- [x] Password Argon2id hash ашигладаг.
- [x] Refresh token database-д hash хэлбэрээр хадгалагддаг.
- [x] JWT issuer/audience/expiry verify хийдэг.
- [ ] Production HTTPS/TLS-ийг edge-to-app хүртэл enforce хийх.
- [ ] JWT secret-ийг cloud secret manager/KMS-д хадгалж rotation/kid strategy хийх.
- [x] Secret rotation, compromise recovery, zeroization runbook хийх.
- [x] MFA secret-ийг AES-256-GCM field encryption-тэй хадгалж, Google access/ID token-ийг database-д persist хийдэггүй policy хэрэгжүүлсэн.
- [ ] Sensitive PII field classification, encryption-at-rest/key rotation болон future long-lived provider token policy-г бүрэн хэрэгжүүлэх.
- [ ] Database болон backup encryption at rest баталгаажуулах.
- [x] Opaque reset/invitation/registration/ticket/idempotency identifiers crypto RNG ашиглаж, JWT algorithm/QR HMAC tamper-expiry/security tests хийсэн.
- [ ] Криптографийн параметрийн periodic review schedule хэрэгжүүлэх.
- [x] Password reset token-ийг SHA-256 hash, one-time atomic consume, expiry-тэй болгосон.
- [x] Structured log-ийн body/header/query/URL дахь token, password, cookie, PII-г recursive redaction хийдэг болсон.

### A05:2025 Injection — Top 5 #5

- [x] Prisma query builder ашигладаг; одоогийн кодод raw SQL илрээгүй.
- [x] Auth болон survey payload-ийн үндсэн хэсгийг Zod-оор validate хийдэг.
- [x] React text rendering default escaping ашигладаг; `dangerouslySetInnerHTML` илрээгүй.
- [ ] Бүх endpoint-ийн params/query/body/header/file metadata-д strict schema validation хийх.
- [x] Sensitive endpoint-ийн Zod object-уудыг `.strict()` болгож unexpected field-ийг reject хийдэг болсон.
- [x] Survey answer-ийг server дээр question count/type, option allowlist, required, rating болон checkbox uniqueness-тэй тулгаж validate хийдэг болсон.
- [x] CV/portfolio/social URL-д HTTP(S)-only, no embedded credential, GitHub/LinkedIn domain allowlist validation хийж active scheme tests нэмсэн.
- [ ] HTML/rich text feature нэмбэл allowlist sanitizer + contextual output encoding хийх.
- [x] Survey CSV export дээр formula injection (`=`, `+`, `-`, `@`) neutralization хийж automated test нэмсэн.
- [ ] Ирээдүйн бусад CSV import/export бүр дээр ижил shared хамгаалалт хэрэглэх.
- [x] Filename control/path traversal reject, random server object key, archive/unsupported type deny allowlist болон shell command ашигладаггүй file pipeline хийсэн.
- [x] Raw SQL/eval/raw-HTML/template-engine хориг, CSP болон CSV formula neutralization security contract tests нэмсэн.

### A06:2025 Insecure Design

- [x] Threat model: assets, trust boundaries, attacker profiles, data flows, abuse cases хийх.
- [x] Multi-tenant visibility/partnership sharing decision flow-г `docs/authorization.md`-д state diagram-аар баримтжуулсан.
- [x] Content approval/publishing, Survey болон Application lifecycle transition-ийг server-side allowlist state machine болгосон.
- [ ] Invitation болон attendance зэрэг үлдсэн lifecycle-уудыг ижил policy service-д нэгтгэх.
- [x] Duplicate-sensitive authenticated POST-д user+method+resource-scoped persistent idempotency record, request hash, 24 цагийн replay response болон key-reuse conflict хамгаалалт хийсэн.
- [x] Event capacity/waitlist-ийг Serializable transaction, conflict retry, automatic promotion/renumber-оор хамгаалсан.
- [ ] Admin invitation, CSV import, consent, delete/export зэрэг abuse case test хийх.
- [x] Diploma MVP security objectives-ийг repository/test evidence-тэй холбосон ASVS-oriented evidence map нэмсэн.

### A07:2025 Authentication Failures

- [x] Strong password policy, Argon2id, generic login error, basic throttling байна.
- [x] Refresh rotation-ийн үндсэн flow байна.
- [x] Email verification, password reset/session revocation, TOTP MFA болон one-time recovery code бүхий account recovery control хийсэн.
- [x] OAuth/OIDC PKCE/state/nonce хийх.
- [x] Refresh rotation, atomic replay/reuse detection, family revocation tests хийсэн.
- [ ] Admin-д phishing-resistant MFA/passkey дэмжих.
- [x] Давтамжтай login failure anomaly-г persistent threshold/backoff-оор илрүүлж хэрэглэгчид security notification болон audit үүсгэдэг болсон.
- [x] Sensitive settings болон Admin management mutation-д password + MFA step-up re-authentication хийсэн.

### A08:2025 Software or Data Integrity Failures

- [ ] CI/CD artifact signing/provenance хийх.
- [ ] Webhook payload signature, timestamp, replay protection хийх.
- [x] Upload бүрийн SHA-256 DB/S3 metadata integrity check, ClamAV scan болон fail-closed quarantine/infected lifecycle хийсэн.
- [x] PostgreSQL trigger-ээр `AuditLog` UPDATE/DELETE-г хориглосон append-only tamper-resistance хийсэн.
- [x] Public register role/tenant, content owner/status, membership role/tenant болон workflow state-ийг server-side identity/policy-оос derive хийдэг.
- [ ] Backup integrity verification болон restore test хийх.

### A09:2025 Security Logging and Alerting Failures

- [x] Structured JSON logger-д requestId, actor, tenant, action, status, latency бүртгэдэг болсон.
- [x] Register, login success/failure/blocked, refresh/reuse, reset request/complete/failure, logout, password/permission/status/security lifecycle event-үүдийг actor/tenant/context-тэй audit хийдэг.
- [x] Structured logger-д sensitive value recursive redaction хийсэн.
- [ ] Central log aggregation, retention, access control хийх.
- [x] Suspicious login failure threshold дээр user security notification болон high-severity audit alert хийсэн.
- [ ] Rate-limit spike, privilege change, export/delete болон cross-tenant denial alert/aggregation хийх.
- [ ] Metrics/dashboard/on-call alert rule болон incident response runbook хийх.
- [x] Backend structured log, audit/database timestamp болон generated security artifact-д ISO-8601 UTC timestamp тогтмол ашигладаг.
- [ ] Production host/container NTP clock synchronization болон clock-drift alert-ийг deployment орчинд баталгаажуулах.

### A10:2025 Mishandling of Exceptional Conditions

- [x] Central Express error handler basic байдлаар байна.
- [x] Unexpected 500 detail-ийг client-д шууд буцаадаггүй.
- [x] Zod/Prisma/JWT/rate-limit/domain error-ийг consistent status/code envelope болгож map хийсэн.
- [x] Invalid JSON, oversized body, DB unavailable, timeout, duplicate constraint-ийн error-handler tests хийсэн.
- [x] HTTP request/header/keep-alive timeout тохируулсан.
- [x] API Gateway upstream timeout, client-abort cancellation, per-service failure threshold, open/half-open circuit breaker болон `Retry-After` response policy хийсэн.
- [x] Unhandled rejection/uncaught exception үед controlled graceful shutdown хийдэг болсон.
- [x] Frontend app болон dashboard түвшний Error Boundary/recovery UI хийсэн.
- [x] Correlation/request ID middleware болон response header нэмсэн.
- [ ] External error tracking service (Sentry зэрэг) холбох.
- [x] Fail-open биш fail-closed authorization behavior test хийж, missing tenant болон unknown permission-ийг deny болгодог evidence нэмсэн.

## 8. XSS, CSRF болон browser security тусгай checklist

### Хийгдсэн

- [x] React-ийн default text escaping ашигладаг.
- [x] Repository-д `dangerouslySetInnerHTML` ашигласан код илрээгүй.
- [x] Helmet middleware байна.
- [x] API CORS origin allowlist байна.

### Дутуу

- [x] Access/refresh token-ийг `sessionStorage`-д хадгалахаа больж, access=memory, refresh=HttpOnly cookie болгосон.
- [x] Strict Content-Security-Policy-г API Helmet болон production Nginx allowlist-аар тохируулж header test нэмсэн.
- [ ] Inline/event style хэрэгцээг CSP-тэй нийцүүлэх.
- [x] Одоогийн Google Fonts dependency-г SPA CSP-д зөвхөн `fonts.googleapis.com` style болон `fonts.gstatic.com` font origin-оор explicit allowlist хийсэн.
- [ ] User-generated rich text оруулах бол DOMPurify зэрэг audited sanitizer-г зөвхөн шаардлагатай render boundary дээр ашиглах.
- [x] CV/portfolio/GitHub/LinkedIn холбоосын protocol/domain allowlist хийсэн; ирээдүйн image upload URL storage adapter дээр ижил schema хэрэглэнэ.
- [x] SVG/active PDF content reject, magic-byte MIME шалгалт, `Content-Disposition: attachment`, `nosniff`, `no-store` хамгаалалт хийсэн.
- [x] Refresh-cookie auth дээр SameSite=Strict болон Origin allowlist validation хийсэн.
- [x] OAuth дээр state/nonce/PKCE хийх.
- [x] Clickjacking хамгаалалтыг CSP `frame-ancestors 'none'` болон header integration test-ээр баталсан.
- [ ] Trusted Types ашиглах боломжийг үнэлэх.
- [x] Raw HTML/eval/javascript URL static security contract болон Playwright browser security/error-path E2E source нэмсэн.

## 9. Backend API ба business feature-үүд

### Auth API

- [x] Register/login/refresh/me/profile/logout-all route байна.
- [x] Forgot/reset password routes.
- [x] Verify/resend email routes (`POST /api/auth/verify-email`, `POST /api/auth/resend-verification`) хийсэн.
- [x] Settings security endpoint-ээр current password шалгаж password солих backend flow хийсэн.
- [x] Logout current session route.
- [x] Sessions/devices list + нэг session revoke route хийсэн; access JWT session `sid`-тай тул revoke шууд үйлчилнэ.
- [x] MFA login verify, OAuth verify, bootstrap/enroll start-confirm, status, recovery regeneration, disable болон step-up routes хийсэн.
- [x] Google OAuth start/callback/onboarding/link/register/unlink routes Authorization Code + PKCE/state/nonce хамгаалалттай болсон.
- [x] Hashed, expiring, one-time token-той public Admin/Staff invitation accept route хийсэн.

### University ба domain management

- [x] University, domain database models болон initial seed байна.
- [x] Register үед verified active domain string match хийдэг.
- [x] Platform Super Admin university list/create/detail/update/status onboarding API-г `/api/universities` дээр хийсэн.
- [x] DNS TXT challenge болон Platform Super Admin administrative evidence approval-аар domain ownership verification хийсэн.
- [x] Platform Super Admin university suspend/reactivate API, high-severity audit болон non-active үед tenant-ийн бүх session revocation хийсэн.
- [x] Tenant-safe university detail болон user/roster/content/survey/partnership stats API хийсэн.
- [x] Platform Super Admin-д University Admin invitation create/list/revoke/accept API хийсэн; шинэ invite-ээр replacement workflow дэмжинэ.
- [x] Domain add, verification request/verify, verified primary сонгох, non-primary revoke болон audit flow хийсэн.
- [ ] University logo/profile file upload.

### Roster, Staff, Student, role management

- [x] `UniversityMember`, `StudentProfile`, `StaffProfile` models байна.
- [x] Registration verification finalize service active roster match ашиглаж, зөвхөн active STUDENT roster match үед `ACTIVE` болгодог болсон.
- [x] University Admin pending Student review list, direct approve/reject backend болон frontend workflow, optional roster auto-link, notification, session revoke, audit flow хийсэн.
- [x] CSV roster import parser, strict UTF-8/RFC 4180 validation, formula хамгаалалт, preview/row error, atomic commit/transaction rollback хийх.
- [x] CSV row-level error report татах endpoint, formula-safe CSV болон export audit хийсэн.
- [x] Staff invite/accept, list/detail, status/deactivate болон permission update endpoints хийсэн.
- [x] Student tenant-scoped list/detail/status endpoints хийсэн.
- [x] Staff permission allowlist update болон server-side enforcement/session revocation хийсэн.
- [ ] Configurable role/permission matrix CRUD үлдсэн.
- [x] Membership list дээр bounded pagination, search, status filter болон sort allowlist хийсэн.
- [x] Tenant-scoped Student/Staff membership CSV export, filter/sort validation, rate limit болон audit хийсэн.

### Content, events, opportunities

- [x] Content create/list/full detail/edit/delete болон status mutation API хийсэн; delete нь зөвхөн activity-гүй editable төлөвт fail-safe ажиллана.
- [x] Draft/submit/changes-requested/approve/reject/publish/archive үндсэн state transitions.
- [x] Approval/status history actor, өмнөх/дараах төлөв, reason/comment-той хадгалагдаж UI timeline-д харагддаг.
- [x] Visibility: PRIVATE/PARTNERS/NETWORK/PUBLIC read enforcement.
- [x] Event create/edit/safe-delete, capacity, date/deadline болон registration deadline check хийсэн.
- [x] Event register/cancel/waitlist placement болон cancellation дараах automatic promotion/renumber хийсэн.
- [x] HMAC-SHA256 гарын үсэгтэй, хугацаатай QR ticket, tamper/expiry/event/tenant/registration шалгалт, idempotent attendance scan API болон Staff/Admin scanner UI хийсэн.
- [x] Job/internship/research create/list/detail/edit/safe-delete хийсэн.
- [x] Application submit/withdraw, review/shortlist/accept/reject transition болон immutable status history хийсэн.
- [x] CV upload/storage/scan, owner/tenant/consent-aware authenticated stream download/delete authorization хийсэн.
- [ ] CV-гээс бусад generic application attachment purpose/UI нэмэх.
- [x] Announcement create/list/detail/edit/safe-delete хийсэн.
- [ ] Category/tag/search.
- [x] Saved content save/unsave endpoints.

### Survey ба forms

- [x] Staff/Admin survey create endpoint.
- [x] Rich question JSON validation: short, paragraph, multiple choice, checkboxes, dropdown, rating.
- [x] Student response create endpoint.
- [x] Duplicate response unique constraint.
- [x] Staff/Admin report endpoint-ийн basic response list/count.
- [x] Staff Google Forms маягийн builder UI.
- [x] Student rich question renderer болон client-side required check.
- [x] Server-side `canManageSurveys` permission check.
- [x] Survey draft list/detail/update/delete endpoints хийсэн.
- [x] Survey publish/unpublish (response-гүй үед), close/reopen/archive transition endpoints хийсэн.
- [x] Survey GET/report/submit дээр university tenant/owner scope enforce хийсэн; cross-partner audience mode тусдаа үлдсэн.
- [ ] Student eligibility, open/close time, anonymous/named mode enforcement.
- [x] Survey response-д server-side required/type/option/count validation хийсэн.
- [ ] Question reorder/section/branching/validation/file upload support.
- [x] Survey response pagination, per-question aggregate болон injection-safe CSV export хийсэн.
- [ ] XLSX export шаардлагатай бол streaming writer-тай нэмэх.
- [ ] Privacy-preserving anonymous response design; одоо бүх response userId-тай.
- [x] Хариултгүй draft edit, schema version increment, response schema snapshot-аар compatibility хамгаалсан.
- [x] Survey integration үндсэн flow болон auth/security test suite-д шалгалттай.

### Notifications

- [x] Header notification dropdown UI байна.
- [x] Notification model/API/database persistence.
- [x] Student болон operations read/unread/mark-all-read endpoints.
- [x] Role бүрийн header notification-д authenticated 45-second polling + visibility refresh strategy хийсэн.
- [ ] Email/push delivery adapters.
- [x] Application status, waitlist promotion, content publish/approval notification triggers хийсэн.
- [ ] Scheduled event reminder болон survey deadline trigger үлдсэн.
- [ ] Delivery retry/dead-letter/idempotency.
- [x] In-app global болон opportunity/application/waitlist/event/survey/announcement/system category preference-ийг notification create/createMany service дээр server-side enforce хийдэг.
- [ ] Email/push frequency болон daily/weekly digest worker enforcement хийх.

### Partnership

- [x] Partnership list болон approve/reject/end үндсэн status API; шинэ invitation create/expiry/revoke flow үлдсэн.
- [x] Invitation lifecycle, opaque hashed token, expiry, accept/revoke болон audit transaction хэрэгжсэн.
- [x] Explicit `PARTNERS` visibility болон ACTIVE partnership approval-ийг shared content/survey access consent boundary болгосон.
- [x] PARTNERS visibility дээр active partnership-д тулгуурласан cross-university read enforcement.
- [ ] Partnership analytics.

### Settings, privacy, support

- [x] Comprehensive Settings UI tabs байна.
- [x] Help болон Send feedback UI байна.
- [x] Settings service-ийг real API/database руу шилжүүлсэн.
- [x] Notification/privacy/appearance/locale/accessibility preference persistence.
- [x] Password change болон active device/session management real API/database-тай болсон.
- [x] Settings болон login UI-г real TOTP QR enrollment, verify, recovery-code rotate/display, disable/status backend-тэй холбосон; WebAuthn тусдаа үлдсэн.
- [x] Consent history real database/API.
- [x] Personal data/registration/application шууд JSON export; background export job үлдсэн.
- [x] Account deactivate/delete request үндсэн workflow.
- [x] Feedback submit API болон ticket persistence; staff resolution workflow үлдсэн.

## 10. Frontend UI ба product flow

### Хийгдсэн

- [x] Responsive landing page.
- [x] Login/register forms backend auth API-тай холбогдсон.
- [x] Auth session reload basic flow.
- [x] Role-based redirect болон dashboard layout.
- [x] Student dashboard, feed tabs, filters, content cards/detail page UI.
- [x] Staff, University Admin, Super Admin sidebar/routes/layout UI.
- [x] Responsive/collapsible sidebar, mobile drawer, overlay, Escape/focus management.
- [x] Lucide open-source sidebar icon ашиглаж, collapsed sidebar-ийн custom/native tooltip болон title attribute-ыг бүрэн устгасан.
- [x] Notification/profile hover dropdown.
- [x] Settings navigation болон олон section UI.
- [x] Student profile update нь нэг real profile API-тай холбогдсон.
- [x] Staff survey builder болон Student survey response real API-тай холбогдсон.
- [x] Loading/error/empty/toast/modal зэрэг shared UI component-уудын суурь байна.

### Mock эсвэл дутуу

- [x] Student bootstrap-ийн profile/content/events/jobs/applications/registrations/notifications/consent data-г API болгосон.
- [x] Event register/waitlist/registration code/cancel, бодит QR image ticket болон attendance mutation real API integration.
- [x] Application submit/status/withdraw нь scanned CV FileAsset сонгох real API integration-тай; URL fallback мөн validation-тай.
- [x] Saved content real API integration.
- [x] Notification database/read persistence дээр short-lived token бүхий SSE realtime delivery нэмсэн; production email/push болон multi-instance pub/sub үлдсэн.
- [x] Staff/Admin/Super Admin `operationsService` bootstrap/content/status/settings, membership invitation/permission, University Admin pending Student review болон CSV roster import mutation real болсон.
- [ ] Domain verification, university onboarding болон configurable permission зэрэг үлдсэн operations mutation-уудыг дуусгах.
- [x] Settings mock service-ийг real API болгосон.
- [x] Feedback form real API болгосон.
- [x] Student avatar/CV upload UI-г private S3/scan API-тай холбож profile/application дээр бодитоор ашигладаг.
- [x] Central API client-д auth header, base URL, JSON/error parsing, timeout, AbortController хийсэн.
- [x] Access token expiry үед concurrent хүсэлтүүдийг нэг refresh promise-д queue хийж automatic retry хийдэг болсон.
- [x] Refresh failure үед memory session clear хийж app-д `uninet:session-expired` event дамжуулдаг болсон.
- [x] Network offline/server unavailable болон timeout error-ийг тусдаа code/message-ээр ялгадаг болсон.
- [x] Central API client-д concurrent GET deduplication, explicit TTL cache болон mutation/session-change cache invalidation strategy хийсэн.
- [x] App/dashboard Error Boundary суурь дээр тусгай route-level 403/404/500 page, retry/home болон request ID display нэмсэн.
- [ ] Optimistic UI хийвэл rollback/error behavior хийх.
- [ ] Form schema validation-ийг shared Zod schema-тай холбох.
- [x] Registration Terms/Privacy acceptance нь immutable policy version/checksum/timestamp/IP/user-agent/context-тэй user creation transaction-д хадгалагддаг.
- [ ] Unsaved changes warning-ийг бүх editor form-д бодитоор хэрэгжүүлэх.
- [x] Nginx runtime-д `try_files $uri $uri/ /index.html` SPA refresh/deep-link fallback тохируулсан.
- [x] HTML `lang="mn"`, UniNet title/description, favicon, OpenGraph болон theme metadata зассан.
- [ ] SEO robots/sitemap/canonical шаардлагатай эсэхийг шийдэх.
- [ ] Google Fonts dependency-ийг privacy/performance/CSP шаардлагаар self-host хийх эсэхийг шийдэх.
- [x] Student/Operations/Settings dashboard-уудыг lazy chunk болгож main bundle-ийг 486KB болгосон; 500KB warning арилсан.

## 11. Frontend ↔ Backend integration definition

- [x] Auth login/register болон survey-ийн зарим flow HTTP API ашигладаг.
- [x] API base URL env variable байна.
- [ ] Бүх mock service бүрийн replacement API жагсаалт гаргаж contract тогтоох.
- [ ] Generated typed client ашиглах.
- [x] API authorization header, cookie credentials, token refresh/retry queue-г нэг client-д төвлөрүүлсэн.
- [x] Server error code → төвлөрсөн Монгол UI message mapping хийсэн.
- [ ] Pagination/filter/sort params-ийг URL state-тай sync хийх.
- [ ] Upload/download progress, cancellation, retry хийх.
- [x] Registration/application/survey/content/invitation/privacy/account action зэрэг duplicate-sensitive POST-д client-generated `Idempotency-Key`, persistent response replay болон mismatch хамгаалалт хэрэглэдэг.
- [x] API client server-ийн correlation/request ID-г `ApiError.requestId`-д хадгалдаг болсон.
- [ ] UTC API date/time + Mongolia timezone formatting contract тогтоох.
- [ ] Enum/status contract frontend/backend-д shared/generated болгох.
- [x] OpenAPI contract integrity, local reference, security scheme болон frozen backward-compatibility baseline tests хийсэн.

## 12. Email, push, storage, queue, realtime integration

- [x] Production email service adapter-ийг Resend HTTP API-аар env validation, timeout болон Bearer authentication-тэй хийсэн.
- [x] SMTP email adapter болон Docker Compose Mailpit dev inbox хийсэн.
- [x] Verification, password reset, invitation, application, attendance болон waitlist promotion email template хийсэн.
- [ ] Email retry, idempotency, bounce/complaint webhook handling хийх.
- [ ] Push provider/service worker/device subscription хийх.
- [x] Private S3-compatible object storage adapter болон local MinIO bucket orchestration хийсэн.
- [x] Presigned URL-ийн оронд owner/tenant/consent authorization-тай server-streamed private upload/download хийсэн.
- [ ] Том файл/direct-upload хэрэгцээ гарвал quarantine-finalize бүхий short-lived presigned multipart flow нэмэх.
- [x] Magic-byte MIME sniffing, extension/size allowlist, ClamAV scan болон quarantine хийсэн.
- [ ] Background queue/workers (BullMQ/Redis эсвэл managed queue) хийх.
- [ ] Email, export, import, notification, analytics job-уудыг queue-д хийх.
- [ ] Dead-letter queue, retry/backoff, job observability хийх.
- [ ] SSE/WebSocket ашиглах бол authenticated channel + tenant isolation хийх.

## 13. Validation, API quality, resilience

- [x] Auth input Zod validation байна.
- [x] Survey create/response basic Zod validation байна.
- [x] JSON request size limit байна.
- [ ] Route params болон query бүхэнд Zod validation хийх.
- [x] Survey `/:id`, list/manage/report query-д strict Zod validation хийж unknown field reject болгодог болсон.
- [x] Zod/Prisma/JWT/domain/rate-limit/404/500 алдаанд correlation id бүхий consistent `{ error: { code, message, requestId, details? } }` contract тогтоосон.
- [x] Paginated Survey, Registration/Application, Membership/Roster/Invitation болон University list endpoint-үүдэд `pageSize <= 50` enforce хийсэн.
- [x] Survey list/manage/report endpoint-д `pageSize <= 50` enforce хийсэн.
- [x] Paginated Survey, Registration/Application, Membership/Roster/Invitation болон University list endpoint-үүдэд strict sort/filter allowlist хийсэн.
- [x] Survey list/manage endpoint-д explicit sort, order, status, visibility allowlist хийсэн.
- [x] HTTP request/header/keep-alive timeout хийсэн.
- [ ] Database slow-query timeout/statement timeout policy хийх.
- [x] Capacity, waitlist, content approval/status болон survey mutation-д transaction boundary хийсэн.
- [x] Invitation create/delivery-failure revoke/accept/status-permission session revoke lifecycle-д transaction boundary хийсэн.
- [x] Prisma unique constraint conflict-ийг consistent user-friendly 409 error болгосон.
- [x] Persistent 24 цагийн idempotency record, deterministic request fingerprint, completed response replay, in-progress/mismatch conflict хамгаалалт хийсэн.
- [x] Auth-аас гадна Student mutation, survey response/manage, membership/operations mutation, export/report, feedback/account action-д correlated rate limit нэмсэн.
- [x] File upload endpoint-д тусгай 12 request/15 минутын limit нэмсэн.
- [x] User-facing Survey, Registration/Application, Membership/Roster/Invitation болон University search list endpoint-үүдэд dedicated limiter нэмсэн.
- [x] Survey list/manage search-д dedicated 60 request/15 minute correlated limiter нэмсэн.
- [ ] Abuse prevention: spam content/survey, mass export, enumeration, scraper limits.
- [ ] Outbound URL/fetch feature нэмэх үед SSRF allowlist/DNS rebinding protection хийх.

## 14. Testing ба quality gates

### Хийгдсэн

- [x] Vitest setup байна.
- [x] Password hashing unit tests байна.
- [x] Auth validation unit tests байна.
- [x] Auth service unit tests байна.
- [x] ESLint frontend/backend-д ажилладаг.
- [x] Server JS type-check script байна.
- [x] Production frontend build script байна.

### Дутуу

- [ ] Frontend component tests (React Testing Library).
- [x] Playwright + axe serious/critical accessibility smoke test frontend дээр нэмсэн.
- [x] Backend route/integration tests dedicated isolated PostgreSQL database хамгаалалттай.
- [x] Prisma clean migration deploy + deterministic seed + status smoke test CI-д байна.
- [ ] Prisma rollback/representative-data forward-fix smoke test нэмэх.
- [x] Survey create → draft edit → publish → student respond → report → close HTTP integration lifecycle test нэмсэн.
- [ ] Бүх module-ийн role/permission/tenant matrix tests.
- [x] Survey permission, Staff ownership, University Admin tenant, Student visibility/partnership matrix integration tests нэмсэн.
- [x] Auth refresh/revocation/reuse/expiry tests.
- [x] Verified email/university lock болон current-password requirement-ийн HTTP authorization tests нэмсэн.
- [x] OAuth issuer/audience/expiry/nonce/exact-redirect, PKCE/state source contract болон account link/unlink conflict tests нэмсэн.
- [x] Password-reset request/confirm, one-time token, expiry/session-revoke tests.
- [x] Email verification transaction/service tests болон deterministic Base32/TOTP, admin session MFA binding, login challenge/bootstrap enrollment tests нэмсэн.
- [x] Playwright E2E-д auth/session, Student, Staff болон Platform critical demo flow source нэмсэн.
- [ ] Mobile/responsive cross-browser tests.
- [x] MIME spoof, active PDF/SVG, traversal/control filename, size, ownership/tenant/download policy болон integrity tests хийсэн.
- [ ] XSS/SQLi/CSRF/IDOR/BOLA/rate-limit tests.
- [x] Concurrency tests: atomic event capacity/waitlist болон duplicate application/survey response хамгаалалт.
- [ ] Load/performance tests (k6/Artillery).
- [x] V8 coverage HTML/LCOV/JSON report болон statement/branch/function/line minimum threshold CI gate-тэй.
- [ ] Mutation testing эсвэл critical security logic-ийн stronger test strategy.
- [ ] Visual regression tests.
- [x] Dedicated test DB guard, fixture/factory, deterministic seed болон cleanup helper-тэй.
- [x] CI merge gate: lint + type-check + unit/coverage + integration + E2E/axe + migration + build + security scan.

## 15. Logging, audit, monitoring, observability

- [x] Server startup/shutdown console log байна.
- [x] Unexpected server error development/test policy-той basic console error байна.
- [x] Dependency-free structured JSON logger, request/actor/tenant/status/latency context болон recursive redaction хийсэн.
- [ ] OpenTelemetry/Pino collector integration хийх.
- [x] Request ID middleware болон response header хийсэн.
- [x] HTTP access log-д duration, status, actor/tenant context оруулсан.
- [x] Password/token/cookie/authorization header/query/PII redaction хийсэн.
- [x] PostgreSQL append-only trigger хамгаалалттай database-backed audit log migration болон audit access API хийсэн.
- [x] Auth, role/permission, content approval/status, export, consent/delete/deactivate, partnership, attendance, file болон university status audit events хадгалдаг.
- [ ] Metrics: request rate/error/latency, DB pool, queue depth, auth failures, email delivery.
- [ ] Distributed tracing/OpenTelemetry хийх.
- [ ] Error tracking (Sentry гэх мэт) хийх.
- [ ] Dashboards болон SLO/SLI тогтоох.
- [ ] Alerts, escalation, on-call, incident response runbook хийх.
- [x] Monitoring UI-г backend process uptime болон PostgreSQL response latency бүхий real bootstrap telemetry-тэй болгосон.
- [ ] Audit/log retention болон access control тогтоох.

## 16. DevOps, CI/CD, deployment

- [x] Multi-stage frontend Dockerfile болон Nginx runtime config.
- [x] Backend Dockerfile.
- [x] Local PostgreSQL/Redis/Mailpit бүхий `docker-compose.yml`.
- [ ] Non-root, minimal, pinned container image.
- [ ] Container vulnerability scan.
- [x] GitHub Actions pipeline-д install, Prisma generate, lint, type-check, unit test, build, audit болон Docker validation хийсэн.
- [x] Pull request бүрт quality/security workflow trigger хийсэн; required branch-protection тохиргоо repository host дээр үлдсэн.
- [ ] Dev/staging/production тусдаа environment.
- [ ] Infrastructure as Code (Terraform/Pulumi/managed platform config).
- [ ] Secret manager integration; `.env`-ийг production secret store гэж ашиглахгүй.
- [x] `.env.example` болон backend env schema-ийн reset/invitation/email/APP URL хувьсагчдын drift-ийг арилгасан; түр хассан email-verification env-ийг устгасан.
- [x] Production үед placeholder/equal JWT secret, insecure/non-TLS DB URL, wildcard/non-HTTPS CORS болон APP URL-ийг startup дээр reject хийдэг.
- [ ] Automated migration job + backup + failure rollback/forward-fix.
- [ ] Blue/green, rolling эсвэл canary deploy strategy.
- [x] Nginx hashed `/assets/`-д нэг жилийн immutable cache, SPA HTML-д no-cache header хийсэн.
- [ ] Reverse proxy/load balancer + HTTPS certificate automation.
- [ ] Database connection pool sizing болон production limits.
- [x] Session-ийг PostgreSQL-д, rate-limit counter-ийг Redis-д multi-instance shared state болгосон.
- [ ] Background queue/worker-ийг distributed, idempotent design болгох.
- [ ] Automated PostgreSQL backups/PITR.
- [ ] Restore drill, RPO, RTO тодорхойлох.
- [ ] Disaster recovery болон region/provider outage plan.
- [x] Release versioning, changelog, rollback procedure.
- [ ] Production smoke test болон post-deploy verification.

## 17. Privacy, consent, data protection

- [x] Consent/settings/history-ийн UI prototype байна.
- [x] Survey response database model байна.
- [x] Privacy policy болон Terms-ийн versioned, checksum-тай, published үед DB trigger-ээр immutable content хийсэн.
- [x] User acceptance-ийг policy version/checksum, timestamp, IP/user-agent/context-тэй database-д хадгалдаг.
- [x] Data inventory/classification: public/internal/confidential/sensitive PII.
- [ ] Purpose limitation болон least-data collection review хийх.
- [x] Cross-university event/application data sharing consent-ийг server-side literal `true` болон consent record-оор enforce хийсэн.
- [x] Consent withdraw flow нь ownership шалгаж event cancellation/waitlist засвар, application withdraw/CV cleanup зэрэг downstream effect-ийг transaction-аар хийдэг.
- [ ] Data retention schedule болон automated purge/anonymize job хийх.
- [x] Personal data, registration, application history-г authenticated owner-scoped JSON download real API/UI болгосон.
- [ ] Том хэмжээний export-ийг background job, expiry-тэй artifact download болгох.
- [ ] Account deletion/deactivation real workflow, legal hold policy хийх.
- [ ] Survey anonymous mode-ийг үнэхээр identity unlink хийдэг privacy design болгох.
- [ ] Admin/staff access to PII-г least privilege болгох.
- [ ] Sensitive data access audit хийх.
- [ ] Backup дахь deleted data retention/expiry policy хийх.
- [ ] Монголын холбогдох privacy/education regulations болон байгууллагын policy-д legal review хийлгэх.
- [ ] Third-party provider DPA/data residency/subprocessor review хийх.

## 18. Performance ба scalability

- [x] Prisma schema-д үндсэн lookup index-үүдийн зарим нь байна.
- [x] Frontend production build гардаг.
- [x] User-facing large Survey, Registration/Application, Membership/Roster/Invitation болон University list endpoint-үүдийг bounded pagination-тай болгосон.
- [ ] Query plan/slow query monitoring хийх.
- [ ] N+1 query review хийх.
- [ ] Search engine/PostgreSQL full-text/trigram strategy хийх.
- [ ] Cache strategy болон invalidation policy хийх.
- [x] Redis-ийг distributed rate limiting, цаашдын queue/short-lived cache use case-д зориулж env/Compose/readiness/lifecycle-тэй холбосон.
- [x] Frontend role dashboard/component lazy loading хийсэн.
- [x] Build chunk хэмжээг шалгаж 500KB+ main chunk warning арилгасан; visual analyzer artifact тусдаа шаардлагагүй болсон.
- [ ] Image optimization, responsive image, lazy loading хийх.
- [ ] Font self-host/preload/subset хийх.
- [ ] Web Vitals budget ба monitoring хийх.
- [ ] Large table virtualization хийх.
- [ ] Export/import-ийг background job болгох.
- [ ] Load test болон capacity target тогтоох.
- [ ] Database pool, API concurrency, queue throughput sizing хийх.

## 19. Accessibility, responsive, i18n

### Хийгдсэн

- [x] Sidebar toggle-д aria state, keyboard/Escape/focus management-ийн суурь байна.
- [x] Dropdown/modal/form-ийн зарим хэсэг labels/focus state-тай.
- [x] Responsive mobile/tablet/desktop layouts байна.
- [x] Монгол UI үндсэн хэлээр байна.

### Дутуу

- [ ] Semantic landmark/heading hierarchy audit хийх.
- [ ] Бүх icon button-д unique accessible name хийх.
- [ ] Focus trap/restore-ийг бүх modal/dropdown/drawer дээр нэг shared primitive болгох.
- [ ] Hover-only dropdown-ийг touch болон keyboard-д бүрэн баталгаажуулах.
- [ ] Color contrast WCAG 2.2 AA audit хийх.
- [ ] Screen reader flow test хийх.
- [ ] 200% zoom, reflow, reduced motion, high contrast test хийх.
- [ ] Form error summary + field association (`aria-describedby`, `aria-invalid`) хийх.
- [ ] Table caption/header scope, responsive alternative хийх.
- [x] Playwright axe serious/critical gate болон keyboard focus smoke-г CI browser job-д оруулсан.
- [ ] Real i18n framework болон translation keys хийх; hardcoded Mongolian/English string холилдсоныг арилгах.
- [x] Root HTML дээр `<html lang="mn">` тохируулсан.
- [ ] Date/number/time бүрийг `mn-MN` болон хэрэглэгчийн timezone preference-ээр форматлах shared utility хийх.
- [ ] Cyrillic font loading/fallback/FOIT/FOUT production test хийх.

## 20. Documentation ба developer experience

- [x] Backend local setup-ийн basic README байна.
- [x] `.env.example` байна.
- [x] Migration/seed scripts байна.
- [x] Root README-ийн default Vite template-ийг UniNet project documentation болгох.
- [x] Plaintext local role password-ийг README-ээс устгаж opt-in env seed placeholder руу шилжүүлсэн.
- [x] Architecture diagram болон module ownership тайлбарлах.
- [x] `docs/development.md`-д native болон Docker frontend/backend/PostgreSQL/Redis/Mailpit setup-ийг эхнээс нь бичсэн.
- [x] 83 operation бүхий OpenAPI 3.1 JSON endpoint, CSP-safe API index болон compatibility policy docs хийсэн.
- [x] Database ERD хийх.
- [x] Role/permission matrix docs хийх.
- [x] Multi-tenant visibility/partnership rules docs хийх.
- [x] Auth/OAuth/session threat model docs хийх.
- [x] Migration, backup/restore, deploy, rollback runbook хийх.
- [x] Incident response болон vulnerability disclosure policy бичсэн.
- [ ] Бодитоор хянагддаг security contact/channel тохируулах.
- [x] Contribution guide, code style, branch/PR policy хийх.
- [x] Seed/demo data production safety guide шинэчлэх.
- [x] Known mock/incomplete feature жагсаалтыг README-д тодорхой болгох.
- [x] API/environment error troubleshooting guide хийх.
- [x] Changelog/release notes хийх.

## 21. Product role тус бүрийн completion checklist

### Student

- [x] Dashboard/feed/profile/settings UI байна.
- [x] Database-backed auth болон survey response байна.
- [x] Real home feed/content discovery.
- [x] My university/network visibility rules.
- [x] Event registration/waitlist, хугацаатай гарын үсэгтэй QR code, Staff/Admin scan болон attendance бодит болсон.
- [x] Internship/job application, CV URL, status transition болон immutable timeline history бодит болсон.
- [x] Student CV binary file private S3 object storage, ClamAV scan, hash integrity болон authorized download/delete-тэй.
- [x] Saved content.
- [x] Notifications database/read state болон single-instance SSE realtime channel ажилладаг; production email/push/multi-instance pub/sub үлдсэн.
- [x] Real registrations/applications pages.
- [x] Profile text/link persistence болон avatar/CV binary object storage/scan бодит болсон.
- [x] Privacy preference/consent history/data export/deactivate/delete request үндсэн flow.

### Staff

- [x] Layout/routes/dashboard prototype байна.
- [x] Survey builder + publish basic backend flow байна.
- [x] Survey report basic API/UI байна.
- [x] Real content create/list/detail/edit/safe-delete/status lifecycle болон history UI/API байна.
- [x] Draft/approval/publish lifecycle үндсэн flow.
- [x] Registration/application жагсаалт, search/filter/pagination, attendance, CV detail болон бүх үндсэн management UI action бодит API-тай холбогдсон.
- [x] Survey management, draft edit/delete, publish/close/reopen/archive, CSV export, basic per-question analytics хийсэн.
- [ ] Section/branching болон XLSX/advanced analytics үлдсэн.
- [ ] Permission enforcement content/survey/application дээр байна; бүх Staff endpoint/route-д бүрэн биш.
- [x] Report/analytics backend aggregate болон notification dropdown database data ашигладаг; advanced metrics/realtime үлдсэн.

### University Admin

- [x] Layout/routes/pages prototype байна.
- [x] Publish approval backend үндсэн workflow.
- [x] University content oversight backend tenant data/status flow.
- [x] Tenant-scoped Staff/student list/detail/status, pending Student approve/reject frontend integration болон Staff permission management backend.
- [x] Staff/Admin secure invitation backend lifecycle.
- [x] University Admin CSV roster import template, preview, row validation/error, commit болон audit flow хийсэн.
- [ ] Fixed Staff permission update backend хийсэн; configurable roles/permission matrix үлдсэн.
- [ ] Partnership list/status backend байна; invitation create/expiry бүрэн биш.
- [x] University profile/detail болон domain verification backend workflow хийсэн.
- [x] Tenant audit/analytics/reporting үндсэн aggregate.

### Platform Super Admin

- [x] Layout/routes/pages prototype байна.
- [x] Network dashboard real database aggregates.
- [x] University onboarding/management backend-ийн list/create/detail/update/status болон domain lifecycle хийсэн.
- [x] University Admin secure invitation/list/revoke/accept болон status management backend.
- [ ] Global user directory database-backed болсон ч privacy/least-privilege pagination hardening үлдсэн.
- [x] Partnership network database-backed list/status.
- [x] Global analytics үндсэн database aggregate.
- [x] Global audit logs database-backed бөгөөд PostgreSQL append-only trigger UPDATE/DELETE-г DB түвшинд хориглодог.
- [x] API process/PostgreSQL response дээр суурилсан basic system monitoring.
- [ ] Platform settings/feature flags/config management.
- [x] Admin high-risk management mutation-д password+MFA step-up, operator reason болон pre-mutation high-severity audit gate хийсэн.

## 22. Санал болгож буй хэрэгжүүлэх дараалал

### Milestone 1 — Security ба API foundation

- [x] Verified email/university profile-switch vulnerability болон survey tenant leak-ийг зассан.
- [x] Refresh reuse detection/atomic family revocation болон HttpOnly Strict refresh-cookie session strategy хийсэн.
- [x] Password reset, email verification болон TOTP MFA/recovery flow бүрэн backend/frontend холбоостой болсон.
- [x] OAuth/OIDC PKCE.
- [x] Central API client, consistent error envelope болон OpenAPI 3.1 contract хийсэн.
- [ ] OpenAPI-аас generated frontend types/client гаргах.
- [ ] Database audit log болон structured request logging хийсэн; centralized tenant policy service үлдсэн.
- [x] Dedicated PostgreSQL integration, authorization/concurrency/security test harness хийсэн.

### Milestone 2 — Core student product

- [x] Content/event/opportunity үндсэн models + APIs.
- [x] Feed/search/saved/notification database integration.
- [x] Event registration/waitlist/registration code, signed QR scan болон attendance бэлэн.
- [x] Application scanned CV FileAsset object storage flow болон validated URL fallback бэлэн.
- [x] Settings/privacy/device APIs.

### Milestone 3 — Staff/Admin workflows

- [x] Content lifecycle/approval үндсэн flow.
- [x] Survey lifecycle/basic analytics/CSV export.
- [x] User/staff/student жагсаалт, хайлт/filter/sort/pagination, status болон Staff permission management.
- [x] Staff болон University Admin invitation create/list/revoke, hashed one-time accept-link flow.
- [x] CSV roster import хийсэн.
- [x] Roster export-ийг University Admin authorization, formula-safe CSV, rate limit болон audit-тэй нэмсэн.
- [x] ACTIVE partnership-д тулгуурласан `PARTNERS` content/survey sharing болон tenant read policy хийсэн.

### Milestone 4 — Platform operations

- [x] University onboarding/domain verification MVP workflow хийсэн.
- [x] Platform Super Admin-д database-backed global directory, basic analytics, audit болон API/PostgreSQL monitoring MVP хийсэн.
- [ ] Queue/production email/push/storage worker болон multi-instance realtime pub/sub үлдсэн.
- [ ] Production infrastructure, CI/CD, backup/restore, observability.

### Milestone 5 — Verification ба launch

- [ ] OWASP ASVS 5.0.0 target level сонгож бүх applicable control-д evidence цуглуулах.
- [ ] Penetration test болон бүх critical/high finding хаах.
- [ ] Load/accessibility/browser/privacy review хийх.
- [ ] Restore/incident/rollback drill хийх.
- [ ] Staging UAT болон launch checklist sign-off хийх.

## 23. “Production-ready full-stack” гэж Done гэж үзэх шалгуур

- [x] Core Student/Operations/Settings data, membership invitation/fixed permission болон secure avatar/CV upload flow dynamic болсон.
- [ ] Configurable permission matrix болон generic attachment зэрэг incomplete flow-ууд үлдсэн; domain onboarding болон TOTP MFA хэрэгжсэн.
- [ ] Бүх mutation бодит database-д transaction/authorization/audit-тай хадгалагддаг.
- [ ] Role ба tenant тусгаарлалт automated test-ээр батлагдсан.
- [x] Repository түвшинд local auth, Google OAuth, password recovery, encrypted TOTP/recovery code болон mandatory Admin MFA policy хэрэгжсэн.
- [ ] Production Google credentials/deployed callback, secret manager/key rotation болон external security verification evidence бүрдүүлэх.
- [ ] P0/P1 OWASP болон penetration test finding байхгүй.
- [ ] CI бүх quality/security gate-ийг pass хийдэг.
- [ ] Staging production-тэй ижил topology/config-тай.
- [ ] Monitoring/alerting/on-call ажилладаг.
- [ ] Backup restore drill амжилттай.
- [ ] Privacy/consent/export/delete flow бодитоор ажилладаг.
- [ ] Performance, accessibility, browser support acceptance target хангадаг.
- [ ] Deploy/rollback/incident runbook-ийг өөр хүн дагаж амжилттай ажиллуулж чаддаг.

## 24. Audit-ийн нотолгоо болсон гол файлууд

- `uninet-app/server/prisma/schema.prisma` — одоогийн database models/index/constraints.
- `uninet-app/server/prisma/migrations/` — auth, roster, survey migrations.
- `uninet-app/server/prisma/seed.js` — universities/domains/demo/role users.
- `uninet-app/server/src/app.js` — Helmet, CORS, JSON limit, health, error handler.
- `uninet-app/server/src/auth/` — register/login/refresh/session/validation.
- `uninet-app/server/src/middleware/authenticate.js` — authentication/role/permission helpers.
- `uninet-app/server/src/surveys/survey.routes.js` — survey CRUD-ийн одоо байгаа жижиг subset.
- `uninet-app/src/auth/authService.js` — frontend auth integration болон sessionStorage token storage.
- `uninet-app/src/student/studentService.js` — Student bootstrap болон mutation API client.
- `uninet-app/src/operations/operationsData.js` — Staff/Admin/Super Admin operations API client.
- `uninet-app/src/settings/settingsService.js` — persisted settings/device/export/feedback API client.
- `uninet-app/server/src/student/student.routes.js` — Student tenant-aware dynamic data/mutations/consent.
- `uninet-app/server/src/operations/operations.routes.js` — Operations bootstrap/content/status/notifications/actions.
- `uninet-app/server/src/settings/settings.routes.js` — Settings persistence/security/device/export/support.
- `uninet-app/server/src/public/public.routes.js` — Public university/catalog bootstrap.
- `uninet-app/server/test/` — одоогийн 10 auth/password/validation unit test.
- `uninet-app/package.json` — scripts/dependencies.

## 25. 2026-07-27-ны verification үр дүн

- [x] `npm run lint` амжилттай.
- [x] `npm run type-check` амжилттай; энэ нь одоогоор server JS-ийг л шалгадаг гэдгийг анхаар.
- [x] `npm test` амжилттай: 3 test file, 10/10 test.
- [x] `npm run build` амжилттай.
- [x] Build warning цэвэр: main chunk 486KB болж role dashboard-ууд тусдаа lazy chunk болсон.
- [x] `npm audit --omit=dev` болон full moderate-level audit 0 vulnerability.
    - [ ] Git verification хийх боломжгүй: workspace usable Git repository биш.

---

Энэ checklist-ийг feature хийх бүрд `[ ]`-ээс `[x]` болгож шинэчилнэ. Checkbox-ийг зөвхөн implementation, automated test, security/authorization evidence гурав хангагдсан үед “production done” гэж хаах нь зөв.
## 26. Phase 4 — Dashboard UI polish (2026-07-28)

- [x] Student, Staff, University Admin болон Platform Super Admin мэдэгдэл/профайл controls-д hover, open, focus болон dropdown effect нэмсэн.
- [x] Opportunity card-ийн `Хадгалах` text button-ийг accessible Lucide Bookmark icon болгосон.
- [x] Expanded sidebar-ийн сургуулийн нэрийг navigation icon-той нэг босоо тэнхлэгт оруулсан.
- [x] Collapsed sidebar-д хоёр үсгийн оронд МУИС, ШУТИС, МУБИС, АШУҮИС, ХААИС logo харуулдаг болгосон.
- [x] Audit Log-ийн хэвтээ scroll шаарддаг table-ийг responsive expandable card layout, search болон severity filter-тэй болгосон.
- [x] Phase 4 source-contract smoke test нэмсэн.


## 28. Phase 5B — Survey backend authorization hardening (2026-07-28)

- [x] `Survey.visibility`-г `PRIVATE`, `PARTNERS`, `NETWORK`, `PUBLIC` enum-тай database field болгож migration нэмсэн.
- [x] Legacy `universityId = null` survey-уудын reach-ийг migration-аар `NETWORK` болгон хадгалсан.
- [x] Published survey list/detail/submit болон Student bootstrap-д ACTIVE partnership-aware audience policy хэрэглэсэн.
- [x] Staff survey management/report-ийг creator-scoped, University Admin-ийг tenant-scoped болгосон.
- [x] `PARTNERS` survey-г идэвхтэй partnership байхгүй үед publish хийхийг backend transaction дотор хориглосон.
- [x] Survey UUID params, pagination, search, status/visibility filter, sort field/order-ийг strict Zod allowlist-аар шалгадаг болсон.
- [x] Survey search-д тусгай rate limit нэмсэн.
- [x] OpenAPI 3.1 contract-ийг survey visibility/pagination/search/sort contract-аар 1.1.0 болгон шинэчилсэн.
- [x] Unit болон PostgreSQL integration test-ээр permission, cross-tenant denial, visibility, partnership, lifecycle, query validation-ийг хамруулсан.
- [ ] Windows Node 24 + PostgreSQL орчинд `db:generate`, `db:deploy`, unit/integration/lint/type-check/build final verification хийх.

## 29. Phase 5C — Local demo flow + membership export + Survey UI integration (2026-07-29)

- [x] `EMAIL_VERIFICATION_ENABLED=false` үед local/demo registration 6 оронтой код шаардахгүй, roster match эсвэл `PENDING_REVIEW` рүү шууд шилждэг болсон.
- [x] Production startup `EMAIL_VERIFICATION_ENABLED=false` тохиргоог fail-closed байдлаар хориглодог болсон.
- [x] Email verification bypass event-ийг structured audit log-д `EMAIL_VERIFICATION_BYPASSED_DEVELOPMENT` үйлдлээр хадгалдаг болсон.
- [x] МУИС, ШУТИС, МУБИС, АШУҮИС, ХААИС тус бүрт official domain-тай Student, Staff, University Admin local seed account нэмсэн.
- [x] Dedicated local role seed account-уудыг дахин seed хийхэд password/profile/roster шинэчилж, хуучин session-ийг revoke хийдэг болсон.
- [x] University Admin Student/Staff жагсаалтыг одоогийн filter/sort нөхцөлөөр frontend-ээс CSV татдаг болсон.
- [x] Roster болон roster import row error-ийг tenant-scoped, formula-safe CSV-аар export хийж audit event хадгалдаг болсон.
- [x] University Admin-д roster list/filter, template download, CSV preview, алдааны CSV болон transaction commit хийх бодит frontend integration нэмсэн.
- [x] Survey builder-д visibility selector, backend search/status/visibility filter болон pagination frontend integration нэмсэн.
- [x] Survey form title/description field-д ил харагдах label, character feedback болон stale validation message цэвэрлэх UX засвар хийсэн.
- [x] OpenAPI contract-ийг local verification mode болон membership/roster export endpoint-үүдээр `1.2.0` болгож шинэчилсэн.
- [x] Auth bypass, production fail-closed config, formula-safe export, tenant scope, seed account contract болон frontend integration smoke/unit test source нэмсэн.
- [ ] Windows Node 24 + PostgreSQL орчинд `db:generate`, `db:deploy`, `db:seed`, unit/integration/lint/type-check/build final verification хийх.

## 30. Phase 5D — Registration, Application management + Resend environment (2026-07-29)

- [x] Staff болон University Admin-д event registration list/search/status/event filter/pagination dedicated API нэмсэн.
- [x] `CONFIRMED` database status-ийг frontend/API demo contract дээр `REGISTERED` гэж ойлгомжтой харуулдаг mapping нэмсэн.
- [x] Staff registration/application query-г зөвхөн өөрийн үүсгэсэн content-д, University Admin-ийг өөрийн tenant-д scope хийсэн.
- [x] Өөр Staff-ийн болон өөр сургуулийн registration/application detail/status/CV access-ийг backend дээр хориглосон.
- [x] Registration detail болон manual attendance endpoint-д UUID validation, permission, tenant, ownership, idempotency болон concurrent status check нэмсэн.
- [x] Manual attendance хийхэд Student notification, audit log болон optional email delivery үүсдэг болсон.
- [x] Student event register/cancel болон automatic waitlist promotion үйлдлүүдэд structured audit event нэмсэн.
- [x] Waitlist promotion хийхэд position renumber, in-app notification болон optional email delivery хийдэг болсон.
- [x] Staff болон University Admin-д application list/search/status/opportunity filter/pagination dedicated API нэмсэн.
- [x] Application detail API нь Student profile summary, authorized CV metadata болон immutable status history буцаадаг болсон.
- [x] `SUBMITTED → UNDER_REVIEW → SHORTLISTED → ACCEPTED/REJECTED` server-side transition policy хэрэгжүүлж, буруу үсрэлтийг `409`-өөр хориглосон.
- [x] Application status mutation бүр transaction, optimistic current-status check, immutable history, notification, audit болон optional email-тэй болсон.
- [x] Student application submit/resubmit/withdraw үйлдлүүдэд audit log нэмсэн.
- [x] Frontend registration page-д search/filter/pagination, QR scan болон manual attendance action нэмсэн.
- [x] Frontend application page-д search/filter/pagination, CV download, detail modal, reason болон state-machine action нэмсэн.
- [x] `EMAIL_DELIVERY_MODE=resend`, `RESEND_API_KEY`, API URL, reply-to env validation болон Resend HTTP adapter нэмсэн.
- [x] OpenAPI contract-ийг Phase 5D workflow endpoint/schema/parameter-уудаар `1.3.0` болгож шинэчилсэн.
- [x] Workflow policy unit test, CV ownership test, PostgreSQL HTTP integration test болон Phase 5D smoke test source нэмсэн.
- [ ] Windows Node 24 + PostgreSQL орчинд `db:generate`, `db:deploy`, `db:seed`, unit/integration/lint/type-check/build болон Resend sandbox/domain delivery final verification хийх.

## 31. Phase 5E — Final MVP stabilization (2026-07-30)

### Critical backend authorization ба API quality

- [x] Content management critical role × permission × tenant policy matrix unit test нэмсэн.
- [x] Survey management Staff creator, University Admin tenant болон Platform scope matrix test нэмсэн.
- [x] Event registration Staff ownership, permission болон tenant matrix test нэмсэн.
- [x] Application management Staff ownership, permission болон tenant matrix test нэмсэн.
- [x] Missing tenant болон unknown permission дээр fail-closed deny behavior test нэмсэн.
- [x] Content foreign identifier IDOR/BOLA HTTP integration denial test нэмсэн.
- [x] Survey foreign identifier IDOR/BOLA HTTP integration denial test нэмсэн.
- [x] Event registration foreign identifier IDOR/BOLA HTTP integration denial test нэмсэн.
- [x] Application foreign identifier IDOR/BOLA HTTP integration denial test нэмсэн.
- [x] Pending Student approval foreign identifier IDOR/BOLA HTTP integration denial test нэмсэн.
- [x] Own-tenant Content/Registration/Application detail access success path integration test нэмсэн.
- [x] Content status mutation дараах structured audit database assertion нэмсэн.
- [x] Survey status mutation дараах structured audit database assertion нэмсэн.
- [x] Pending Student approval дараах structured audit database assertion нэмсэн.
- [x] Critical content/registration/application malformed UUID request-ийг `422` болгох integration test нэмсэн.
- [x] Membership болон workflow oversized `pageSize=51`-ийг `422` болгох integration test нэмсэн.
- [x] Membership болон application unknown `sortBy=password`-ийг `422` болгох integration test нэмсэн.
- [x] Membership Student/Staff/Pending/Roster/Invitation/Import list-ийн page size limit-ийг 50 болгосон.
- [x] University list-ийн page size limit-ийг 50 болгосон.
- [x] Membership хайлттай list endpoint-үүдэд dedicated search limiter холбоно.
- [x] University list endpoint-д dedicated search limiter холбоно.

### Deterministic demo ба frontend stabilization

- [x] Production дээр ажиллахгүй guarded `npm run db:demo-reset` script нэмсэн.
- [x] Demo reset-д exact confirmation phrase шаарддаг болгосон.
- [x] Demo reset танигдаагүй database нэр дээр fail-closed зогсдог болсон.
- [x] МУИС Staff/Student-д deterministic Event registration seed өгөгдөл нэмсэн.
- [x] МУИС Staff/Student-д deterministic Internship application болон initial immutable history seed өгөгдөл нэмсэн.
- [x] МУИС Staff/Student-д deterministic published Survey seed өгөгдөл нэмсэн.
- [x] Final MVP demo notification-уудыг давхар үүсгэхгүй idempotent seed хийсэн.
- [x] Backend error code-уудын төвлөрсөн Монгол message map нэмсэн.
- [x] API client error envelope-ийг төвлөрсөн Монгол message map-тай холбосон.
- [x] Dedicated 403 permission error дэлгэц нэмсэн.
- [x] Dedicated 404 unknown/not-found дэлгэц нэмсэн.
- [x] Dedicated 500/network retry дэлгэц нэмсэн.
- [x] Error дэлгэц дээр correlation/request ID харуулдаг болсон.
- [x] Student unknown route-ийг dedicated 404 UI руу оруулсан.
- [x] Staff/Admin/Platform unknown route-ийг dedicated 404 UI руу оруулсан.
- [x] Platform University жагсаалтаас real backend detail/domain console нээдэг болгосон.
- [x] University domain нэмэх frontend action-ийг real API-тай холбосон.
- [x] Administrative domain verification request/evidence approval frontend action-ийг real API-тай холбосон.
- [x] Primary domain болон revoke frontend action-ийг real API-тай холбосон.
- [x] Verified domain шаарддаг University activation болон session revoke хийдэг suspend action-ийг UI-тай холбосон.
- [x] University onboarding UI анхны төлөвийг зөвхөн `PENDING` болгож verification workflow тойрохыг хаасан.
- [x] Staff/Student/Super Admin deterministic frontend E2E source нэмсэн.
- [x] Phase 5E dependency-free source/static smoke test нэмсэн.
- [x] Frontend-ээр backend demo хийх Phase 5E guide нэмсэн.
- [x] Phase 5E implementation болон verification boundary report нэмсэн.
- [ ] Windows Node 24 + PostgreSQL орчинд `db:generate`, reset/deploy/seed, unit/integration/E2E, lint, type-check болон build final verification хийх.

## Phase 5E.1 — Direct Student Approval

- [x] University Admin `Бүртгэл батлах` товчоор roster ID болон нэмэлт reason шаардахгүйгээр Student-ийг шууд `ACTIVE` болгодог болсон.
- [x] Таарах roster мөр байвал автоматаар холбоод, байхгүй бол `DIRECT_ADMIN_APPROVAL` Audit Log mode хадгалдаг болсон.
- [x] Direct approval frontend/backend source smoke test нэмсэн.

## Phase 5F — UX, Google OAuth, realtime notification, live operations (2026-07-30)

### Landing ба dashboard UX

- [x] Pre-login hero-д layered network/grid background нэмсэн.
- [x] Таван university card-ийн өнгийг top border-т тулгаж, нэр/domain/stat spacing-ийг нягтруулсан.
- [x] Landing дээрх PostgreSQL статистикийн тайлбар өгүүлбэрийг устгасан.
- [x] UniNet-гүй/UniNet-тэй comparison хэсгийг responsive workflow layout болгон дахин загварчилсан.
- [x] PRIVATE/PARTNERS/NETWORK/PUBLIC card-уудыг сонгохоос өмнө ижил neutral visual state-тэй болгосон.
- [x] Visibility card дарахад тухайн scope-ийн өөрийн өнгөт detail panel харуулдаг болсон.
- [x] Landing publish preview-ийн title, visibility selector, selected detail болон publish button-ийг дахин загварчилсан.
- [x] Footer-ийн хуучин давхардсан navigation-ийг FAQ/help/security агуулгаар сольсон.
- [x] Бүх role dashboard-ийн single select/filter dropdown-д нэгдсэн custom styling нэмсэн.
- [x] Collapsed sidebar icon/logo hover tooltip, popup болон native `title` attribute-ыг устгасан.
- [x] Collapsed sidebar-ийн hamburger toggle-ийг 84px logo/icon column-той нэг босоо шугамд оруулсан.
- [x] Notification болон profile popover хаагдахдаа exit animation ашигладаг болсон.
- [x] Staff Survey builder болон response analytics-ийг нэг `Судалгаа ба асуулга` page-д нэгтгэсэн.
- [x] University Admin-ийн partnership/list invitation navigation-ийг нэг `Түншлэл` page-д нэгтгэсэн.
- [x] University Admin-ийн report/analytics navigation-ийг нэг `Тайлан ба аналитик` page-д нэгтгэсэн.

### Google OpenID Connect ба database

- [x] Server-side Google authorization-code start/callback route нэмсэн.
- [x] Signed short-lived OAuth state болон first-login onboarding token нэмсэн.
- [x] Google ID token subject/audience/verified-email validation нэмсэн.
- [x] Login болон registration UI-д Google OAuth button нэмсэн.
- [x] First-login үед arbitrary local-part бүхий university email нэг удаа холбоод domain-аар university тодорхойлдог болсон.
- [x] `googleId`, `gmail`, `studentEmail`, `authProvider`, `googleLinkedAt` database field/index migration нэмсэн.
- [x] Google-linked хэрэглэгчийн дараагийн login-д stored Google subject-аар UniNet session шууд үүсгэдэг болсон.
- [x] Google OAuth account create/login/onboarding audit event нэмсэн.
- [x] Public bootstrap Google OAuth enabled capability-г frontend-д буцаадаг болсон.
- [ ] Real Google Cloud client credentials, consent screen болон callback-ийг deployment environment дээр эцэслэн verify хийх.
- [ ] Existing Staff/Admin local account-д authenticated Google link/unlink UI/API болон re-authentication нэмэх.

### Real management, analytics ба monitoring

- [x] University Admin өөрийн university name/logo/website/address/contact/rector/colors/profile мэдээллийг backend-д хадгалдаг болсон.
- [x] Platform Super Admin university management modal-аас university profile field-үүдийг бодитоор засдаг болсон.
- [x] Platform шинэ сургууль route болон university list active route-ийг давхар selected харагдуулахгүй болгосон.
- [x] Super Admin user/partnership detail-ийн raw JSON dump-ийг structured field/action UI болгосон.
- [x] Network Dashboard/Global Analytics user/content/visibility/registration/application/partnership/survey count-уудыг Prisma count/groupBy-аар бодитоор тооцдог болсон.
- [x] Analytics response-д source болон generated timestamp нэмсэн.
- [x] System Monitoring-д Node uptime/version/memory, PostgreSQL latency, Redis connectivity, active sessions болон critical audit metric нэмсэн.
- [x] University Admin approve/reject шаардлагатай pending Student болон content approval-д in-app notification үүсгэдэг болсон.
- [x] Notification creation-ийг per-user Server-Sent Events channel-тай холбосон.
- [x] Frontend notification SSE reconnect болон polling fallback нэмсэн.
- [ ] Production multi-instance notification fan-out-ийг Redis Pub/Sub/queue provider-оор баталгаажуулах.

### Security, API contract ба verification

- [x] Prisma parameterized query дээр нэмэлт conservative SQL-injection request signature guard нэмсэн.
- [x] SQL injection blocked request-д `SUSPICIOUS_INPUT_BLOCKED` error болон critical audit event үүсгэдэг болсон.
- [x] Monitoring дээр SQL injection blocked count харуулдаг болсон.
- [x] University profile field-үүдэд strict Zod validation нэмсэн.
- [x] OpenAPI contract-ийг Google OAuth, notification stream болон university profile endpoint-үүдээр `1.4.0` болгосон.
- [x] Phase 5F dependency-free 69-assertion source smoke test нэмсэн.
- [x] Phase 5F frontend/backend demo guide болон implementation report нэмсэн.
- [ ] Windows Node 24 + PostgreSQL дээр Prisma generate/deploy, unit/integration/E2E, lint, type-check, build болон real Google OAuth/SSE final verification хийх.



## Phase 5G — Custom dropdown, Google account binding, microservice runtime (2026-08-03)

### Dropdown/select UX

- [x] Dashboard filter-ийн floating label болон selected value давхцах асуудлыг арилгасан.
- [x] Student, Staff, University Admin болон Platform dashboard-ийн үндсэн filter-үүдийг shared custom dropdown primitive руу шилжүүлсэн.
- [x] Сонгогдсон option-ийг цэнхэр мөр, check icon-оор харуулдаг болгосон.
- [x] Dropdown-д outside-click close, Escape close, Arrow key navigation, Enter select болон focus restore нэмсэн.
- [x] Membership status/sort/order, Survey status/visibility/page-size, Event registration болон Application filters custom dropdown ашигладаг болсон.
- [x] Native form select-үүдийн нэгдсэн border, chevron, hover болон focus styling хэвээр хадгалагдсан.

### Google OpenID Connect

- [x] Login болон Register entry point тус бүр Google account chooser руу өөрийн intent-тэй ордог болсон.
- [x] Танигдаагүй Google account-д “Бүртгэлтэй account-аар нэвтрэх” болон “Шинээр бүртгүүлэх” хоёр тусдаа onboarding action нэмсэн.
- [x] Existing Student account link хийхэд сургуулийн имэйл болон одоогийн нууц үгээр re-authentication хийдэг болсон.
- [x] Google subject нэг UniNet account-т, Student account нэг Google subject-т л холбогдох unique ownership дүрэм enforce хийсэн.
- [x] Linked Student account-ийн `googleId`, Gmail, `studentEmail`, university, provider болон linked timestamp database-д хадгалагддаг болсон.
- [x] Нэг удаа холбоос үүссэний дараа ижил Google subject-аар шууд тухайн Student account-д нэвтэрдэг болсон.
- [x] Pending-review Student-д session өгөхгүй, University Admin approval хүлээх тусгай OAuth state/UI нэмсэн.
- [x] Google Authorization Code flow-д PKCE S256 code challenge/verifier нэмсэн.
- [x] PKCE verifier-ийг query state payload-д ил гаргалгүй dedicated signed HttpOnly cookie-д хадгалдаг болсон.
- [x] Signed state, state-cookie equality, PKCE cookie nonce binding болон Google ID-token nonce/audience/email verification enforce хийсэн.
- [x] Existing Student link, duplicate Google ownership болон pending login үйлдлүүдэд structured audit event нэмсэн.
- [x] OAuth-ийн шинэ error code-уудыг Монгол frontend message map-тай холбосон.
- [ ] Real Google Cloud consent screen, client credentials, test users болон callback-ийг хэрэглэгчийн deployment environment дээр end-to-end verify хийх.
- [ ] Staff/Admin account link/unlink болон provider management UI хийх.

### Microservice runtime architecture

- [x] Browser-ийн тогтвортой API endpoint болох API Gateway process нэмсэн.
- [x] Authentication/session/privacy/notification route эзэмшдэг Identity Service process нэмсэн.
- [x] Student/Survey/Operations/Membership/University/File route эзэмшдэг Core Service process нэмсэн.
- [x] Gateway prefix-based routing, browser CORS/preflight болон credential forwarding хэрэгжүүлсэн.
- [x] Upstream service унах үед тогтвортой `UPSTREAM_UNAVAILABLE` error envelope буцаадаг болсон.
- [x] Gateway `/api/ready` endpoint Identity болон Core service readiness-ийг aggregate хийдэг болсон.
- [x] `npm run services:dev` командаар gateway, identity, core процессыг нэг backend terminal-аас зэрэг ажиллуулдаг болсон.
- [x] Docker Compose-д `db-migrate`, `identity-service`, `core-service`, `api-gateway` тусдаа deployable service болгон нэмсэн.
- [x] Frontend зөвхөн gateway порт `4000`-тай харилцдаг хэвээр тул UI API contract эвдээгүй.
- [x] Route ownership, ports, three-terminal startup болон failure isolation demo documentation нэмсэн.
- [ ] Identity болон Core-д database/schema-per-service ownership салгах.
- [ ] Service-to-service authentication, outbox/event bus, distributed tracing болон independent deployment rollback хэрэгжүүлэх.

### Contract ба verification

- [x] OpenAPI contract-ийг OAuth link/register/unlink behavior-аар `1.6.0` болгосон.
- [x] Phase 5G dependency-free source smoke test 70 assertion-тай нэмсэн.
- [x] Modified backend/service JavaScript syntax болон modified frontend JSX parse шалгалт хийсэн.
- [x] Phase 5G implementation report, microservice architecture guide болон frontend/backend demo guide нэмсэн.
- [ ] Windows Node 24 + PostgreSQL дээр install, Prisma generate/deploy/seed, unit/integration, lint, type-check, build, service runtime болон real Google OAuth final verification хийх.
