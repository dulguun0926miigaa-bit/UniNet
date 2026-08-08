# Final MVP security evidence map

This is a **diploma MVP evidence map**, not an external ASVS certification. Controls that require production infrastructure, an independent penetration test, MFA/OIDC, backup restore or operational monitoring remain open in `things-to-do.md`.

| MVP security objective | Repository evidence | Verification |
|---|---|---|
| Authentication and session revocation | `server/src/auth/`, HttpOnly refresh cookie, token-family reuse detection | `server/test/auth.cookie.test.js`, `auth.service.test.js`, `auth.repository.test.js` |
| Function-level permission | `server/src/authorization/policy.js`, `server/src/operations/workflow.policy.js` | `phase5e-authorization-matrix.test.js` |
| Object/tenant authorization | tenant scopes in content, surveys, workflow and memberships | `phase5e-critical-idor.integration.test.js`, `authorization-concurrency.integration.test.js` |
| Strict input validation | `.strict()` Zod schemas and UUID/list allowlists | auth, survey, membership, workflow and university validation tests |
| State-machine integrity | content, survey, application and attendance policies | workflow/resource lifecycle tests and integration tests |
| Auditability | database `AuditLog`, request ID and structured logger | observability, privacy, workflow and Phase 5E audit assertions |
| Rate/abuse control | global/auth/mutation/search/export/file limiters | `server/test/rate-limit.test.js` and Phase smoke tests |
| File safety | private object storage, MIME detection, size allowlist, ClamAV and authorized streaming | `server/test/secure-files.test.js` |
| Browser/API response hardening | Helmet CSP/HSTS, CORS allowlist, Nginx CSP, generic production errors | environment/error/OpenAPI and frontend security contract tests |
| Data export safety | formula-neutralized Survey/Membership/Roster CSV | survey, roster and frontend security contract tests |

## Phase 5E final verification command set

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm test
npm run test:integration
npm run lint
npm run type-check
npm run build
npm run test:e2e
```

Only successful execution in the target Windows Node 24 + PostgreSQL environment upgrades source evidence into runtime evidence.
