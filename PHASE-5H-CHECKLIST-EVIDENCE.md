# Phase 5H checklist evidence

Доорх 21 мөр Phase 5G-ийн `[ ]` төлвөөс Phase 5H-д `[x]` болсон. Нотолгоо нь repository доторх бодит файлд тулгуурлана.

| # | Хаасан checklist ажил | Гол evidence |
|---:|---|---|
| 1 | Session idle timeout policy | `server/src/auth/session-policy.js`, `authenticate.js`, `auth.service.js`, env schema, unit test |
| 2 | OAuth provider strategy | Google OIDC runtime болон Phase 5G/5H architecture documentation |
| 3 | Authorization Code + PKCE | `google-oauth.service.js`, signed verifier cookie route |
| 4 | Random signed state/CSRF | OAuth start/callback state token ба cookie equality |
| 5 | OIDC nonce/replay protection | `google-oauth.security.js`, `google-oauth.security.test.js` |
| 6 | Exact callback/open-redirect protection | validated redirect env, fixed `APP_URL` callback redirect, exact URI helper/test |
| 7 | Issuer/audience/expiry/verified-email validation | `validateGoogleIdentityClaims` болон unit tests |
| 8 | Issuer + subject primary identity | Prisma `googleIssuer`, composite unique index, migration |
| 9 | Manual link/unlink/conflict policy | password re-auth link, unlink API/UI, session revoke, source-contract test |
| 10 | Verified university domain claim | OAuth onboarding `UniversityDomain` validation |
| 11 | Provider token retention policy | access/ID token database-д хадгалахгүй callback implementation |
| 12 | OAuth cancel/error UI | callback error mapping, landing error state, Mongolian messages |
| 13 | OAuth security tests | claim unit tests + link/unlink source-contract tests |
| 14 | CycloneDX SBOM | `scripts/generate-sbom.mjs`, `artifacts/sbom.cyclonedx.json`, CI artifact |
| 15 | License compliance gate | `config/license-policy.json`, `scripts/check-licenses.mjs`, CI gate |
| 16 | Dependency-confusion registry policy | `.npmrc`, `docs/security/dependency-registry-policy.md` |
| 17 | Consistent UTC timestamps | structured logger/audit timestamps, SBOM UTC metadata; NTP remains separate `[ ]` |
| 18 | Outbound timeout/cancel/circuit breaker | API Gateway + `UpstreamCircuitBreaker` + unit tests |
| 19 | OAuth quality test row | Vitest claim tests and source-contract link/unlink conflict tests |
| 20 | Append-only audit storage | `20260727132000_audit_log_append_only` PostgreSQL trigger migration |
| 21 | API request dedupe/cache/revalidation strategy | `src/api/apiClient.js`, API client tests, public bootstrap TTL |

## Counts

```text
[x] 689
[ ] 222
Нийт 911
Гүйцэтгэл 75.6%
```

`[ ]` үлдсэн мөрүүдийг кодгүйгээр `[x]` болгоогүй. Provider credential, production deployment, external service, recorded drill эсвэл third-party verification шаардсан мөрүүд нээлттэй хэвээр.
