# Testing strategy

UniNet uses layered tests because mocked unit tests cannot prove PostgreSQL
constraints/transactions and browser tests cannot cheaply cover every state machine.

## Test layers

| Layer | Command / location | Current purpose |
| --- | --- | --- |
| Static lint | `npm run lint` | ESLint for frontend and backend JavaScript/JSX |
| Server type check | `npm run type-check` | TypeScript `checkJs` over backend/seed; not a strict frontend type check |
| Unit/route/contract | `npm test` / `server/test`, `src/**/*.test.js` | auth, cookies, middleware, validation, lifecycle policy, files, QR, OpenAPI, client refresh, memberships |
| Coverage gate | `npm run test:coverage` | V8 coverage for selected security/core modules; thresholds: statements 45%, branches 40%, functions 45%, lines 45% |
| PostgreSQL integration | `npm run test:integration` | HTTP-boundary cross-tenant/role denial and concurrent registration/application/survey behavior |
| Browser E2E | `npm run test:e2e` / `e2e/` | Chromium registration/session/login, role deep link, mobile navigation, keyboard and axe smoke |
| Migration smoke | CI job | clean PostgreSQL 17 migration chain, deterministic seed, migration status |
| Build/SCA/docs | `npm run build`, `security:audit`, `docs:check` | production bundle, dependency findings, local documentation links |

Coverage applies only to configured critical modules and is not a whole-application
quality score. Raising thresholds should follow meaningful tests, not exclusions.

The OpenAPI document currently covers all 83 declared operations, including the
`/api/files` routes. Contract tests protect documented operations from removal and
validate references, security schemes, path parameters, success responses, and
operation identifier uniqueness. The compatibility baseline remains additive: new
operations do not weaken prior v1 guarantees.

## Required change coverage

| Change | Minimum tests |
| --- | --- |
| Auth/session/cookie | valid/invalid/expired/replay/concurrent rotation, active status, cookie flags/origin, browser restore/logout |
| Authorization/tenant | every allowed role plus denied role, own vs other tenant, global/partner visibility, ID by UUID |
| Database model/migration | clean migration chain, upgrade with representative data, constraints/indexes/delete behavior |
| State machine | every allowed and denied transition, reason/history/audit, optimistic conflict, concurrent duplicate |
| File/upload | size/filename/extension/magic MIME/active content, scanner clean/infected/error, storage failures, download authorization, deletion reference |
| Survey/CSV | question and answer boundaries, schema version, duplicate response, aggregate accuracy, formula injection |
| API contract | runtime response/validation plus OpenAPI operation/security/status/required-field compatibility fixture |
| UI/accessibility | keyboard path, focus, loading/error/empty/permission state, mobile layout, serious axe violations |
| Privacy/deletion | policy version/checksum, consent grant/revoke, legal hold, idempotency, purge executor when added |

## Local execution

Fast feedback:

```powershell
npm run lint
npm run type-check
npm test
```

Pre-review:

```powershell
npm run ci:quality
npm run security:audit
npm run docs:check
```

Integration and E2E require explicitly named, dedicated PostgreSQL test databases.
Both runners refuse ordinary database names by default. Setup examples are in
[Local development](development.md#tests-and-validation).

## Test data rules

- Use synthetic unique emails/universities and cryptographically random fixture IDs.
- Never use production exports, real CVs, real survey answers, or real credentials.
- Track and clean only fixtures created by the test run; do not truncate a shared
  database.
- Keep tests deterministic in locale/time zone; freeze/inject time for expiry cases.
- Do not disable auth/tenant checks merely to simplify fixtures.
- For concurrency tests, assert database end state, not only HTTP statuses.

## CI behavior

CI runs reproducible install/generation, lint, server type-check, coverage tests,
build/audit, migration/seed smoke, PostgreSQL authorization/concurrency tests,
Chromium desktop/mobile/axe smoke, secret scan, and pull-request dependency review.
Coverage and Playwright artifacts are retained briefly for diagnosis. A configured
job is not evidence of the latest pass unless the exact commit's CI run is attached.
The axe smoke blocks every serious/critical rule except the current color-contrast
baseline, which is attached to the Playwright report as JSON evidence. Therefore
this gate must not be presented as complete WCAG AA conformance.

## Flake policy

Do not merge by repeatedly rerunning a failing test. Capture trace/log/request ID,
classify product defect vs nondeterministic test/environment, fix root cause, and add
an owner/expiry if temporary quarantine is unavoidable. CI retries only help collect
evidence; they do not convert a first-attempt failure into reliability.

## Gaps and future gates

- comprehensive role × endpoint × tenant PostgreSQL matrix;
- full WCAG 2.2 AA manual/automated audit across all role pages;
- sustained load/soak/capacity tests, including rate limits, reports, file scanning,
  event concurrency, database pool, and multiple replicas;
- mutation/property/fuzz tests for critical parsers/state machines;
- SMTP/object-storage/ClamAV failure and recovery integration tests;
- DAST, independent penetration test, OWASP ASVS verification;
- production-like migration timing/locking, backup restore/PITR, deploy/rollback,
  and incident drills.

Define measurable latency/error/capacity objectives and a production-like test
environment before making load/performance a blocking release gate.
