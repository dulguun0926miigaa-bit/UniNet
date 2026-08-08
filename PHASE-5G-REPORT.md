# Phase 5G implementation report

## Completed

- Replaced primary dashboard/filter native selects with a reusable accessible custom popover select.
- Removed the overlapping floating label/value layout that displayed combinations such as `Сургууль` and `Бүгд` on top of each other.
- Added selected-row highlight and check icon matching the supplied visual reference.
- Added outside-click close, Escape close, arrow-key navigation and focus restoration.
- Added separate Google onboarding actions for linking an existing Student account and creating a new Student account.
- Existing-account linking requires current password re-authentication.
- Enforced one Google subject per UniNet account and prevented silent relinking.
- Added Authorization Code + PKCE S256, signed state, HttpOnly verifier cookie and OIDC nonce validation.
- Added pending-review handling for Google-linked Student accounts.
- Added API Gateway, Identity Service and Core Service as separate runnable Node processes.
- Added aggregate gateway readiness, stable upstream error envelope and gateway-owned CORS.
- Added Docker Compose service topology and local multi-process runner.
- Added strict mode-specific Zod validation and matching OpenAPI schemas for Google link/register onboarding.
- Updated OpenAPI contract to `1.5.0`.
- Added a dependency-free Phase 5G smoke test with 70 assertions.

## Verification completed in this build workspace

```text
JavaScript syntax: passed for modified backend/service scripts
JSX/JavaScript parse: passed for modified frontend files
Phase 3–5G source regression smoke: passed
MVP backend contract smoke: 1804 assertions passed
Phase 5G source smoke: 70 assertions passed
Documentation links and Docker Compose YAML parse: passed
```

## Verification still required on the user's Windows environment

```text
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run test:phase5g-smoke
npm test
npm run test:integration
npm run lint
npm run type-check
npm run build
npm run services:dev
```

Real Google OAuth cannot be end-to-end verified without the user's Google Cloud OAuth client ID, secret, consent-screen configuration and authorized redirect URI.

## Architecture boundary

The application now runs as separate gateway, identity and core processes. The current diploma-safe migration keeps the existing PostgreSQL schema shared. Database-per-service ownership, service credentials, outbox/event messaging and distributed tracing remain production hardening work.
