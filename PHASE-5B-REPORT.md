# UniNet Phase 5B — Survey backend authorization hardening

Date: 2026-07-28

## Scope

Phase 5B closes a focused group of backend/checklist items around survey multi-tenancy, object authorization, request validation, abuse controls, API documentation, and automated evidence. It does not claim that every UniNet endpoint is fully production-ready.

## Implemented

### 1. Explicit survey visibility

- Added `Survey.visibility` using the existing `ContentVisibility` enum:
  - `PRIVATE`
  - `PARTNERS`
  - `NETWORK`
  - `PUBLIC`
- Added migration `20260728160000_survey_visibility_hardening`.
- Existing surveys with `universityId = null` are migrated to `NETWORK` to preserve their prior reach.
- Added indexes for status/visibility/published date and tenant/status/visibility queries.

### 2. Audience and partnership authorization

- Published survey list, detail, Student bootstrap, and response submission now use the same central audience policy.
- `PRIVATE` is limited to the owning university.
- `PARTNERS` is visible only to universities with an `ACTIVE` partnership.
- `NETWORK` and `PUBLIC` are visible network-wide to authenticated users.
- Users without a tenant fail closed to `PUBLIC` only; Platform Super Admin retains network scope.
- Publishing a `PARTNERS` survey without at least one active partnership returns `409 SURVEY_ACTIVE_PARTNERSHIP_REQUIRED`.

### 3. Permission, tenant, and ownership boundaries

- Survey create/manage continues to require `canManageSurveys`.
- Survey report/export requires `canViewReports`.
- Staff management/report access is limited to surveys they created inside their university.
- University Admin access is limited to the university tenant.
- Platform Super Admin can operate across the network.
- Cross-tenant resources resolve as not found for scoped survey mutations/reports.

### 4. Strict request validation and bounded queries

- Strict UUID validation for every survey `/:id` route.
- Published list query supports bounded pagination, search, and allowlisted sorting.
- Management list supports bounded pagination, search, status/visibility filters, and allowlisted sorting.
- Report pagination is capped at 50 rows per page.
- Unknown query fields and unsafe sort fields return `422 VALIDATION_ERROR`.

### 5. Search abuse control

- Added a dedicated survey search limiter:
  - 60 search requests per 15 minutes per authenticated user/IP.
  - Non-search list requests skip this limiter.
  - Correlated `429 SEARCH_RATE_LIMITED` response.

### 6. OpenAPI and tests

- OpenAPI contract updated to version `1.1.0`.
- Added visibility schema, pagination, search, sort, and filter parameters.
- Added unit tests for visibility policy, Staff creator scope, strict UUID/query validation, and visibility defaults.
- Added PostgreSQL integration tests for:
  - Staff permission denial.
  - Draft → edit → publish → respond → report → close lifecycle.
  - PRIVATE/NETWORK/PARTNERS visibility.
  - ACTIVE partnership access.
  - Cross-tenant University Admin mutation denial.
  - Staff report ownership.
  - Pagination/sort/unknown-query rejection.
  - PARTNERS publication guard.
- Updated `things-to-do.md` only for concrete items backed by implementation and test source.

## Checklist totals

- Checked: 467
- Remaining: 278

Broad items such as “all routes use strict validation” and “all role × tenant matrix tests pass” remain open. Only the completed survey-specific sub-items were closed.

## Validation performed in this environment

Passed:

- `npm run test:phase5b-smoke` — 54 assertions.
- `npm run test:phase3-smoke` — 32 assertions.
- `npm run test:phase4-smoke` — 21 assertions.
- `npm run test:phase5a-smoke` — 23 assertions.
- `npm run test:mvp-backend-smoke` — 1443 assertions.
- JavaScript syntax check across `server/src`, `server/test`, and `scripts` — passed.

Could not complete here:

- Dependency installation because the internal npm package gateway returned HTTP 503 while fetching `zod-validation-error`.
- Consequently Prisma generate, Vitest behavior/integration tests, lint, type-check, and Vite build were not completed in this Linux environment.
- The project pins Node 24.15.0/npm 11.12.1, while this environment currently uses Node 22.16.0/npm 10.9.2.

## Required Windows verification

From the Phase 5B `uninet-app` folder with Docker Desktop running:

```powershell
npm install
npm run db:generate
docker compose up -d postgres redis
npm run db:deploy
npm run test:phase5b-smoke
npm test
npm run test:integration
npm run lint
npm run type-check
npm run build
```

Then start the application:

```powershell
npm run server:dev
```

In another terminal:

```powershell
npm run dev
```
