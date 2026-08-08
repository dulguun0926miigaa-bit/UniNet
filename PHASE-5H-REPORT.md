# Phase 5H — Real checklist closure report

## Зорилго

Phase 5H нь шинэ харагдах feature олноор нэмэхээс илүү `things-to-do.md` доторх дутуу мөрүүдийг repository evidence-тэйгээр бодитоор хаахад төвлөрсөн. `[x]` болгосон мөр бүрд код, migration, automated test, CI gate эсвэл одоо байгаа боловч checklist-д хуучнаар дутуу тэмдэглэгдсэн хэрэгжүүлэлтийн нотолгоо байна.

## Checklist-ийн бодит төлөв

```text
Phase 5G эхлэл: 668 [x] / 242 [ ] / 910 нийт = 73.4%
Phase 5H:        689 [x] / 222 [ ] / 911 нийт = 75.6%
Бодитоор хаасан: 21 мөр
```

Нийт тоо 910-оос 911 болсон шалтгаан нь “consistent UTC timestamp” болон production host-ийн NTP/clock-drift verification-ийг тусдаа мөр болгон салгасан. Кодын UTC хэрэглээг `[x]`, deployment орчны NTP evidence-г `[ ]` хэвээр үлдээсэн.

## Phase 5H-д хэрэгжүүлсэн зүйл

### OAuth/OIDC hardening

- Google issuer, audience, subject, nonce, verified email болон expiration-ийг fail-closed байдлаар шалгадаг тусдаа claim validator.
- Canonical `googleIssuer + googleId` composite identity key болон Prisma migration.
- Gmail-аар silent auto-link хийхгүй ownership policy.
- Existing Student account link хийх password re-authentication хэвээр.
- Password-backed Google unlink API, UI, current-password re-authentication, session revocation болон audit event.
- Google-only account password-reset хийсний дараа `PASSWORD_GOOGLE` provider болж unlink хийх боломжтой recovery path.
- Google cancel/provider error/invalid identity-г fixed application redirect болон Монгол алдааны message-р харуулна.
- OAuth claim validation, exact redirect болон link/unlink source-contract tests.
- OpenAPI `1.6.0` дээр unlink endpoint/request/response нэмсэн.

### Session policy

- Configurable idle timeout.
- `lastUsedAt`-ийг хүсэлт бүр дээр бичихгүй bounded touch interval.
- Access authentication болон refresh rotation хоёрт idle-expiry enforce хийсэн.

### Gateway resilience

- Identity/Core service тус бүрийн failure counter.
- Closed → open → half-open probe circuit-breaker lifecycle.
- Configurable upstream timeout.
- Client abort/close үед upstream request cancellation.
- `UPSTREAM_TIMEOUT`, `UPSTREAM_CIRCUIT_OPEN`, `Retry-After` response contract.

### Frontend API reliability

- Concurrent ижил GET хүсэлтийн in-flight deduplication.
- Caller opt-in TTL cache.
- Mutation болон session identity солигдоход cache invalidation.
- Public bootstrap-д 30 секундын explicit TTL.

### Supply-chain evidence

- `package-lock.json`-оос CycloneDX 1.6 SBOM үүсгэдэг script.
- 604 locked package-ийн license allow/deny policy.
- Reviewed manual overrides.
- CI дээр license gate, SBOM generation болон 90 хоногийн artifact retention.
- Public npm registry pin болон future private `@uninet/*` scope policy.

### Өмнө хэрэгжсэн боловч checklist-д хуучнаар дутуу байсан evidence

- PostgreSQL trigger бүхий append-only `AuditLog` migration.
- Backend/audit/security artifact-ийн ISO-8601 UTC timestamp хэрэглээ.
- Google Authorization Code + PKCE, signed state, nonce, verified university domain болон provider token persistence-гүй flow.

## Энэ workspace-д ажиллуулсан шалгалтууд

```text
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
MVP backend source/contract smoke: 1817 assertions passed
License policy: 604 locked packages passed
CycloneDX SBOM: 604 components generated
Documentation links: 31 Markdown files passed
Backend/test/script JavaScript syntax: passed
Frontend/e2e TypeScript JSX parse: 31 files, 0 syntax errors
OpenAPI exported operations: 124; contract version 1.6.0
```

Эдгээр нь dependency-free source/contract, syntax болон generated-evidence checks. Энэ build workspace Node.js 22 ашигласан бөгөөд repository Node.js 24.15.0 шаарддаг.

## Хэрэглэгчийн Windows орчинд заавал баталгаажуулах зүйл

```powershell
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run test:phase5h-smoke
npm test
npm run test:integration
npm run lint
npm run type-check
npm run build
npm run services:dev
```

Google OAuth-ийн бодит end-to-end callback нь хэрэглэгчийн Google Cloud Client ID, Client Secret, consent screen, test user болон authorized redirect URI-тай үед л баталгаажина.

## Production-ready гэж тэмдэглээгүй үлдсэн том ажлууд

- Microsoft Entra ID болон university-specific SSO.
- Staff/Admin OAuth provider management.
- MFA/step-up authentication.
- Database/schema per service.
- Service-to-service authentication, outbox/event bus, distributed tracing.
- Central logs, metrics, alerts, on-call.
- Production TLS, secret manager, signing-key rotation.
- Backup/restore drill, load test, external penetration test.
