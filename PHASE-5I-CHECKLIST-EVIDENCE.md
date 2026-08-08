# Phase 5I checklist evidence

Phase 5I нь `things-to-do.md`-ийн production/security хэсгээс UniNet-д хамгийн түрүүнд шаардлагатай account-security control-уудыг бодитоор хэрэгжүүлсэн. `[x]` болгосон мөр бүр код, migration, UI, automated source/contract test эсвэл database constraint-тэй.

## Checklist-ийн өөрчлөлт

```text
Phase 5H: 689 [x] / 222 [ ] / 911 нийт = 75.6%
Phase 5I: 715 [x] / 201 [ ] / 916 нийт = 78.1%
Шинээр хаасан: 26 мөр
```

Нийт мөр 5-аар өссөн нь нэг нийлмэл шаардлагыг хэрэгжсэн болон хэрэгжээгүй дэд control болгон салгасантай холбоотой. Жишээлбэл TOTP MFA хэрэгжсэн боловч WebAuthn/passkey, repository policy хэрэгжсэн боловч production provider verification тусдаа `[ ]` хэвээр.

## Хаасан 26 мөрийн нотолгоо

| # | Бодитоор хаасан шаардлага | Гол repository evidence |
|---:|---|---|
| 1 | Google OAuth + encrypted TOTP MFA + recovery-code account security | `server/src/auth/google-oauth.service.js`, `mfa.service.js`, `auth.routes.js` |
| 2 | Verified email + backend-backed MFA/recovery | `email-verification.service.js`, `mfa.service.js`, `Uninetlanding.jsx` |
| 3 | Generic provider identity model | `OAuthAccount` model, issuer+subject unique index, Phase 5I migration |
| 4 | Encrypted MFA credential болон hashed recovery codes | `MfaTotpCredential`, `MfaRecoveryCode`, AES-256-GCM/HMAC implementation |
| 5 | Verified same-university email change | `email-change.service.js`, request/confirm routes, Settings UI |
| 6 | Persistent login backoff | `login-security.service.js`, email+IP hash state, capped exponential delay |
| 7 | Common-password/sequence screening | `password-policy.js`, password reset/change/register integration |
| 8 | Recent password history/reuse prevention | `PasswordHistory`, `password-security.js`, transactional prune/store |
| 9 | Real TOTP enrollment/login/recovery | `mfa-totp.js`, `mfa.service.js`, QR/manual setup and one-time recovery codes |
| 10 | Mandatory University/Platform Admin MFA | bootstrap challenge, MFA-bound session/access token, disable prevention |
| 11 | Sensitive settings step-up | password/email change, export, device revoke, deactivate/delete guards |
| 12 | Admin management step-up | `requireAdminMutationStepUp`, protected management routers |
| 13 | Mandatory operator reason | `x-action-reason` 3–500 character validation |
| 14 | High-severity pre-mutation audit | `ADMIN_MUTATION_STEP_UP_AUTHORIZED` audit event |
| 15 | MFA lifecycle audit | enrollment, verify, recovery rotation, disable, step-up success/failure events |
| 16 | MFA secret field encryption/provider-token non-persistence | AES-256-GCM fields; Google access/ID tokens not stored |
| 17 | Account recovery controls | password reset/session revocation + TOTP recovery codes |
| 18 | Suspicious-login notification | threshold notification and `SUSPICIOUS_LOGIN_ALERTED` audit |
| 19 | Append-only database audit evidence | existing PostgreSQL trigger blocks `AuditLog` UPDATE/DELETE |
| 20 | MFA API surface | login/OAuth verify, bootstrap, enroll, status, recovery, disable routes |
| 21 | OAuth account routing | start/callback/onboarding/link/register/unlink with PKCE/state/nonce |
| 22 | Real MFA Settings/Login UI | QR/manual secret, code confirmation, recovery display/rotation, disable/status |
| 23 | MFA security tests | deterministic TOTP vectors, admin session binding, challenge/bootstrap tests |
| 24 | Audit immutability checklist correction | migration evidence linked to the production checklist row |
| 25 | High-risk Admin action gate | University Admin + Platform Super Admin mutation enforcement |
| 26 | Local auth + OAuth + recovery + MFA repository policy | code, schema, route, UI, OpenAPI and smoke evidence combined |

## Гол файлууд

- `server/prisma/migrations/20260804110000_phase5i_security_controls/migration.sql`
- `server/src/auth/mfa-totp.js`
- `server/src/auth/mfa.service.js`
- `server/src/auth/login-security.service.js`
- `server/src/auth/password-policy.js`
- `server/src/auth/password-security.js`
- `server/src/auth/email-change.service.js`
- `server/src/middleware/step-up.js`
- `src/auth/authService.js`
- `src/settings/SettingsPage.jsx`
- `scripts/phase5i-security-mfa-step-up-smoke.mjs`
- `server/test/mfa-totp.test.js`
- `server/test/password-policy.test.js`

## Зориуд `[ ]` хэвээр үлдээсэн зүйл

Дараах зүйлсийг кодын дүр эсгэсэн тэмдэглэгээгээр хаагаагүй:

- WebAuthn/passkey;
- Staff/Admin Google provider linking болон Microsoft/University SSO;
- centralized permission policy + бүх endpoint-ийн role/tenant matrix integration test;
- production Google credentials болон deployed callback verification;
- PII envelope encryption, KMS/secret-manager/key rotation;
- database-per-service, event bus/outbox, distributed tracing;
- production TLS, monitoring/on-call, backup/restore drill, load/penetration test;
- configurable permission matrix болон generic attachment flow.

Эдгээр нь `things-to-do.md` дотор `[ ]` хэвээр бөгөөд provider, production infrastructure эсвэл илүү том тусдаа implementation phase шаардлагатай.
