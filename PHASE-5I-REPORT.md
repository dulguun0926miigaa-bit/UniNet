# Phase 5I — Security, MFA and step-up implementation report

## Зорилго

Phase 5I нь үлдсэн checklist-ийн бүх мөрийг хийсэн мэт тэмдэглэхгүйгээр, UniNet-д хамгийн өндөр ач холбогдолтой account-security control-уудыг эхэлж бодитоор хаасан:

- админ account хамгаалах MFA;
- өндөр эрсдэлтэй үйлдлийн step-up authentication;
- password reuse/common-password хамгаалалт;
- verified email солих урсгал;
- brute-force/backoff болон suspicious-login alert;
- generic OAuth identity model;
- security audit evidence.

## Checklist-ийн шинэ бодит төлөв

```text
Phase 5H: 689 [x] / 222 [ ] / 911 нийт = 75.6%
Phase 5I: 715 [x] / 201 [ ] / 916 нийт = 78.1%
Бодитоор хаасан: 26 мөр
```

Нийт мөр 911-ээс 916 болсон нь нийлмэл шаардлагуудыг шалгаж болох тусдаа control болгон салгасантай холбоотой. Жишээлбэл TOTP MFA нь `[x]`, WebAuthn/passkey нь `[ ]`; repository-level secret policy нь `[x]`, production KMS/provider verification нь `[ ]` хэвээр.

## Шинээр нэмэгдсэн гол боломжууд

### 1. TOTP MFA

- Authenticator app-д зориулсан 30 секунд, 6 оронтой TOTP.
- QR code болон manual secret enrollment.
- TOTP replay хамгаалалт (`lastUsedStep`).
- One-time recovery codes; database-д зөвхөн HMAC hash хадгална.
- Recovery code regeneration.
- Optional Student/Staff enrollment болон Settings UI.
- University Admin, Platform Super Admin-д first-login mandatory enrollment.
- Admin MFA-г disable хийхийг server-side хориглоно.

### 2. MFA-bound session

Admin session үүсэхийн өмнө MFA баталгаажсан байх ёстой. Access token-д `mfa` claim, session-д `mfaVerifiedAt` хадгалж, хоёуланг нь middleware шалгана. Phase 5I deployment-ийн дараа хуучин Admin session шинэ хамгаалалтыг тойрч гарахгүй.

### 3. Password + MFA step-up authentication

Sensitive settings болон хамгаалагдсан Admin mutation хийхийн өмнө:

1. current password;
2. TOTP эсвэл recovery code;
3. session-bound богино настай step-up token;
4. Admin mutation бол 3–500 тэмдэгтийн operator reason

шаардана.

Step-up шаардлагатай Settings action:

- password change;
- verified email change;
- personal-data export;
- device/session revoke;
- account deactivate;
- account deletion request.

Admin mutation gate дараах management router-уудад ажиллана:

- universities;
- operations/workflows;
- memberships;
- surveys.

### 4. Verified email change

Email-ийг profile field шиг шууд өөрчлөхөө больсон. Шинэ flow:

```text
Шинэ сургуулийн email оруулах
→ password + MFA step-up
→ uniqueness/pending conflict шалгах
→ verified university domain шалгах
→ expiring one-time verification link илгээх
→ link confirm
→ email update + sessions revoke + audit
```

Шинэ email нь хэрэглэгчийн одоогийн university-ийн verified domain-д хамаарах ёстой.

### 5. Password security

- High-confidence common/product-derived password denylist.
- Obvious sequence screening.
- Current password reuse prevention.
- Configurable recent password history.
- Register, reset болон settings password change урсгалд нэг policy ашиглана.

### 6. Login brute-force хамгаалалт

- Normalized email + IP дээр persistent security state.
- Configurable threshold-оос capped exponential backoff.
- Амжилттай login үед state reset.
- Suspicious threshold дээр хэрэглэгчийн in-app security notification.
- High-severity audit event.
- Account existence задруулахгүй generic error response.

### 7. Generic OAuth identity

Google identity-г зөвхөн `User.googleId` талбарт найдахгүй `OAuthAccount` model-д хадгална:

- provider;
- canonical issuer;
- provider subject;
- verified provider email;
- metadata;
- linked/last-used timestamp.

`issuer + providerSubject` unique constraint нь provider identity collision-оос хамгаална. Google access token болон ID token database-д хадгалагдахгүй.

### 8. Security auditing

MFA enrollment/login/disable, recovery-code rotation, step-up success/failure, verified email change, suspicious login болон protected Admin mutation-д audit event нэмэгдсэн. Protected Admin mutation бүрийн өмнө high-severity authorization audit бичигдэнэ.

## Database өөрчлөлт

Шинэ migration:

```text
server/prisma/migrations/20260804110000_phase5i_security_controls/migration.sql
```

Шинэ/өргөтгөсөн model:

- `OAuthAccount`
- `MfaTotpCredential`
- `MfaRecoveryCode`
- `PasswordHistory`
- `LoginSecurityState`
- `EmailChangeRequest`
- `Session.mfaVerifiedAt`

MFA secret нь AES-256-GCM ciphertext/IV/auth-tag хэлбэрээр хадгалагдана. Recovery code болон email-change token raw утгаараа хадгалагдахгүй.

## API contract

OpenAPI:

```text
Version: 1.7.0
Declared operations: 138
```

Нэмэгдсэн auth endpoint-ууд:

```text
POST   /api/auth/mfa/login/verify
POST   /api/auth/mfa/oauth/verify
POST   /api/auth/mfa/bootstrap/start
POST   /api/auth/mfa/bootstrap/confirm
POST   /api/auth/mfa/oauth/bootstrap/start
POST   /api/auth/mfa/oauth/bootstrap/confirm
GET    /api/auth/mfa/status
POST   /api/auth/mfa/enroll/start
POST   /api/auth/mfa/enroll/confirm
POST   /api/auth/mfa/recovery-codes/regenerate
DELETE /api/auth/mfa
POST   /api/auth/step-up
POST   /api/auth/email-change/request
POST   /api/auth/email-change/confirm
```

## Энэ build workspace-д амжилттай ажиллуулсан шалгалт

```text
JavaScript syntax: 125 files passed
JSX/TSX parse: 18 files, 0 syntax errors
Phase 3 smoke: 32 assertions passed
Phase 4 smoke: 21 assertions passed
Phase 5A smoke: 23 assertions passed
Phase 5B smoke: 54 assertions passed
Phase 5C smoke: 85 assertions passed
Phase 5D smoke: 92 assertions passed
Phase 5E smoke: 72 assertions passed
Phase 5E.1 smoke: 7 assertions passed
Phase 5F smoke: 69 assertions passed
Phase 5G smoke: 70 assertions passed
Phase 5H smoke: 109 assertions passed
Phase 5I smoke: 129 assertions passed
MVP backend source/contract smoke: 2012 assertions passed
Documentation links: 31 Markdown files passed
License policy: 604 locked packages passed
CycloneDX SBOM: 604 components generated
OpenAPI: 1.7.0 / 138 operations
Checklist: 715 [x] / 201 [ ] / 916 = 78.1%
```

## Энэ workspace-д баталгаажуулж чадаагүй зүйл

Full dependency-backed Vitest, PostgreSQL integration, ESLint, server type-check болон Vite production build-ийг энд ажиллуулаагүй.

Шалтгаан:

- repository Node.js `24.15.0` шаарддаг;
- build workspace Node.js `22.16.0` ашиглаж байна;
- workspace-ийн npm proxy dependency install хийх үед `zod-validation-error` package-д 404 буцаасан.

Иймээс дээрх source/syntax/contract smoke-ийн амжилтыг Windows PostgreSQL integration болон production build амжилттай болсон мэт тайлбарлаагүй.

Google OAuth end-to-end callback-д хэрэглэгчийн жинхэнэ Google Cloud Client ID/Secret, consent screen, test user болон authorized redirect URI шаардлагатай хэвээр.

## Windows дээр шинэ хувилбар ажиллуулах

Шинэ ZIP-ийн `UniNet/uninet-app` folder дотор өмнөх `.env`-ээ хуулж, Phase 5I env утгуудыг нэмнэ:

```env
MFA_CHALLENGE_SECRET=өөрийн-урт-санамсаргүй-secret
MFA_ENCRYPTION_KEY=64-hex-тэмдэгттэй-key
MFA_ISSUER=UniNet
MFA_LOGIN_CHALLENGE_EXPIRES_IN=5m
MFA_SETUP_EXPIRES_IN=10m
STEP_UP_EXPIRES_IN=10m
PASSWORD_HISTORY_COUNT=5
LOGIN_BACKOFF_THRESHOLD=5
LOGIN_BACKOFF_MAX_SECONDS=900
LOGIN_ALERT_THRESHOLD=8
EMAIL_CHANGE_TOKEN_EXPIRES_IN=1h
```

Local development-д env schema fallback ашиглаж болох боловч production-д `MFA_CHALLENGE_SECRET` болон `MFA_ENCRYPTION_KEY`-г заавал тусдаа хүчтэй утгаар өгнө.

PowerShell:

```powershell
npm install
npm run db:generate
docker compose up -d postgres redis
npm run db:deploy
npm run db:seed
npm run test:phase5i-smoke
npm test
npm run test:integration
npm run lint
npm run type-check
npm run build
npm run server:dev
```

Тусдаа frontend terminal:

```powershell
npm run dev
```

University Admin эсвэл Platform Super Admin-аар анх нэвтрэхэд QR enrollment гарна. Authenticator app-д QR-г уншуулж, 6 оронтой code баталгаажуулан recovery code-уудаа хадгалсны дараа dashboard нээгдэнэ.

## 100% болоогүй үлдсэн том ажил

Phase 5I-ийн дараа 201 checklist мөр үлдсэн. Гол бүлэг:

- WebAuthn/passkey болон Microsoft/University SSO;
- Staff/Admin Google provider management;
- centralized authorization policy + бүрэн role/tenant matrix tests;
- configurable permissions болон generic attachments;
- database-per-service, service authentication, event bus/outbox, tracing;
- production TLS, KMS/secret manager, signing-key rotation;
- central logs/metrics/alerts/on-call;
- backup/restore, load, accessibility болон external penetration test evidence.

Эдгээрийг provider/production evidence-гүйгээр `[x]` болгоогүй.
