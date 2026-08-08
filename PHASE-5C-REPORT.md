# UniNet Phase 5C report

Date: 2026-07-29

## Scope

Phase 5C makes the remaining diploma-demo backend work visible from the frontend without requiring Postman for the main scenarios. It also adds repeatable local accounts for every seeded university.

## Implemented

### 1. Temporary local email-verification bypass

- Added `EMAIL_VERIFICATION_ENABLED` environment flag.
- Local/demo default is `false`, so registration does not stop at the six-digit code screen.
- Registration still performs the server-side university-domain and roster decision:
  - matching active roster record -> `ACTIVE` and a login session;
  - no matching roster record -> `PENDING_REVIEW` without a login session.
- Existing `PENDING_VERIFICATION` local accounts are resolved on their next login while the bypass is enabled.
- The bypass is written to the audit log as `EMAIL_VERIFICATION_BYPASSED_DEVELOPMENT`.
- Production fails closed unless `EMAIL_VERIFICATION_ENABLED=true`.

### 2. Five-university demo accounts

When `SEED_ROLE_USERS=true` and `SEED_ROLE_PASSWORD` is set, the seed creates or refreshes Student, Staff, and University Admin accounts for:

- МУИС — `num.edu.mn`
- ШУТИС — `must.edu.mn`
- МУБИС — `msue.edu.mn`
- АШУҮИС — `mnums.edu.mn`
- ХААИС — `muls.edu.mn`

Account format:

- `student@<official-domain>`
- `staff@<official-domain>`
- `admin@<official-domain>`

Re-seeding the dedicated demo accounts refreshes the password/profile/roster and revokes old sessions. Production refuses demo role seeding.

### 3. Membership and roster backend completion

- Tenant-scoped Student and Staff CSV exports.
- Tenant-scoped roster CSV export.
- Tenant-scoped roster-import row-error CSV export.
- Spreadsheet-formula injection protection for values beginning with `=`, `+`, `-`, or `@`.
- Export rate limiting and structured audit records.
- Strict query validation for export filters and sorting.

### 4. University Admin roster UI integration

University Admin -> Оюутнууд -> Roster импорт now supports:

- roster list/search/filter/pagination;
- CSV template download;
- UTF-8 CSV preview;
- preview validation totals;
- downloadable row-level error CSV;
- transaction-based commit for an error-free preview;
- current tenant roster CSV export.

### 5. Survey backend features exposed in the frontend

- Survey visibility selection: `PRIVATE`, `PARTNERS`, `NETWORK`, `PUBLIC`.
- Backend search, status, visibility, sorting, and pagination controls.
- Fixed stale form-title validation feedback.
- Visible labels and minimum-character feedback for title/description.

### 6. API contract and checklist

- OpenAPI version updated to `1.2.0`.
- Membership/roster export and roster-import operations documented.
- Registration response documents both verification and local-demo flows.
- `things-to-do.md` items were changed to `[x]` only for the concrete implementation and test evidence in this phase.

## Validation completed in the artifact environment

Passed:

- Phase 3 smoke: 32 assertions.
- Phase 4 smoke: 21 assertions.
- Phase 5A smoke: 23 assertions.
- Phase 5B smoke: 54 assertions.
- Phase 5C smoke: 85 assertions.
- MVP backend source/OpenAPI smoke: 1613 assertions.
- All server JavaScript syntax checks.
- Changed JSX syntax checks for Membership, Operations, and registration views.

## Validation not completed here

The supplied artifact does not contain `node_modules`. Dependency installation was not completed in this Linux environment because it runs Node 22 while the project requires Node 24, and the package gateway returned an unavailable-package response. Therefore the following must be run on the user's Windows Node 24 + PostgreSQL environment:

```powershell
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm test
npm run test:integration
npm run lint
npm run type-check
npm run build
```

The project should not be described as fully verified until these commands pass in that environment.

## Checklist status

At packaging time:

- completed markers: 484
- open markers: 278

The remaining items include broader production work such as MFA/OAuth, complete all-route authorization matrices, realtime/queue infrastructure, observability, backup/restore exercises, and external security verification.
