# UniNet MVP Backend Phase 2 report

Date: 2026-07-27

## Implemented

### Pending student review

- Dedicated `GET /api/memberships/students/pending` endpoint.
- Dedicated idempotent `POST /api/memberships/students/:id/approve` endpoint.
- Dedicated idempotent `POST /api/memberships/students/:id/reject` endpoint.
- Approval requires a verified email, an ACTIVE and date-valid STUDENT roster record, and matching email or studentId.
- Prevents one roster record or studentId from being linked to multiple accounts.
- `StudentProfile.rosterMemberId` persists the roster decision and is protected by a unique foreign key.
- Approval/rejection revokes old sessions, creates an in-app notification, and writes a high-severity audit event.
- The generic student status endpoint cannot activate or override pending/rejected review states.

### Central authorization hardening

- Operations content management now uses a central deny-by-default tenant/permission/ownership policy.
- Staff publishers can review tenant content; creators can edit/delete only their own content.
- Attendance and application mutations use server-side permission assertions.
- Operations bootstrap avoids querying unauthorized registration, application, partnership, user, survey, and audit datasets.
- Survey management uses the central tenant scope helper.
- Cross-tenant pending-student approval is denied by repository scope and covered by an integration test.

### University onboarding and domain verification

- Added `/api/universities` platform management module.
- University list/create/detail/update/status endpoints.
- Tenant-safe University Admin self-detail access.
- University statistics for users, roster members, contents, surveys, and partnerships.
- Domain add, verification request, verify, primary selection, and revoke endpoints.
- DNS TXT challenge flow and administrative-evidence approval flow.
- A university cannot be activated without at least one active verified domain.
- Domain lifecycle and university mutations are audited.
- Suspending/inactivating a university revokes active tenant sessions.

### Contract and tests

- OpenAPI expanded from 85 to 98 operations.
- Added unit tests for pending student review and university/domain verification rules.
- Added PostgreSQL integration tests for cross-tenant review denial, roster-linked approval, rejection, persistence, and audit evidence.
- Added `npm run test:mvp-backend-smoke` static/syntax/contract gate.
- Added `npm run test:mvp-backend-behavior` service/policy behavior gate with mocked repositories.

## Checklist result

- Seven existing incomplete checklist items were implemented and changed from `[ ]` to `[x]`.
- One new concrete pending-student review item was added as verified `[x]`.
- Current totals: **433 `[x]`**, **283 `[ ]`**.
- Broad claims such as “every API is fully tenant-isolated” remain open until the complete route matrix passes integration tests.

## Validation performed in this environment

Passed:

```text
npm run test:mvp-backend-smoke
MVP backend smoke checks passed (1429 assertions).

npm run test:mvp-backend-behavior
MVP backend behavior smoke passed (pending review, tenant policy, domain verification).

Changed-file ESLint
0 errors

All server/src, server/test, and scripts JavaScript syntax checks
all-js-syntax-ok

Static OpenAPI validation
98 operations, 85 paths, references valid
```

Server type-check reaches only the expected stale generated-Prisma-client errors for the new `StudentProfile.rosterMemberId` field. Those disappear after running `npm run db:generate` on the target machine. Full Vitest/integration/Prisma migration/build could not be completed in this Linux container because the supplied dependencies contain Windows-native Rolldown binaries and the package/Prisma binary gateways returned temporary network errors. They must be run on the user's Windows + PostgreSQL environment before broad MVP/security completion is claimed.

## Required Windows verification

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run test:mvp-backend-smoke
npm run test:mvp-backend-behavior
npm test
npm run test:integration
npm run lint
npm run type-check
npm run build
```
