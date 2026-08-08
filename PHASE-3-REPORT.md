# UniNet Phase 3 — Registration UX, Sidebar Icons, Rate Limiting

Date: 2026-07-27

## Implemented

### Registration form
- Split the combined `Овог, нэр` input into separate `Овог` (`lastName`) and `Нэр` (`firstName`) fields.
- Added browser autocomplete hints (`family-name`, `given-name`) and 80-character limits.
- Removed client-side full-name parsing; the form now sends the two fields directly to the existing backend contract.

### Enrollment year
- Replaced the incorrectly reused `graduationYear` registration field with `enrollmentYear`.
- Registration offers the current year and the previous 15 years only; future years are not rendered.
- Backend Zod validation rejects a future `enrollmentYear`.
- Added `StudentProfile.enrollmentYear`, Prisma migration, OpenAPI documentation, student profile API, Settings API/UI and profile editing support.
- `graduationYear` remains a separate optional field.

### Sidebar
- Student sidebar: expanded mode shows icon + text; collapsed desktop mode keeps icon only and tooltip.
- Staff, University Admin and Platform Super Admin shared sidebar: expanded mode shows icon + text; collapsed desktop mode keeps icon only and tooltip.

### Rate limiting
- Added a global API limit: 600 requests per 15 minutes per IP.
- Added registration IP limit: 20 attempts per hour.
- Added normalized-email registration limit: 5 attempts per hour.
- Existing authentication account/IP limits remain as an additional layer.
- All limits return the existing correlated JSON 429 error envelope and use Redis when configured.

## Database migration

`server/prisma/migrations/20260727153000_phase3_registration_enrollment_year/migration.sql`

Adds nullable `StudentProfile.enrollmentYear` without changing existing graduation-year values.

## Verification performed in the artifact environment

Passed:

```bash
npm run test:phase3-smoke
```

Result: 32 source-contract and JavaScript syntax assertions passed.

The artifact environment has Node 22 while the repository pins Node 24.15.0, and dependency installation could not be completed there. Therefore full Prisma generation, lint, Vitest and Vite build must be rerun on the user's Windows Node 24 environment.

## Windows verification commands

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run test:phase3-smoke
npm run test:email-verification-smoke
npm run test:mvp-backend-smoke
npm run test:mvp-backend-behavior
npm test
npm run lint
npm run type-check
npm run build
```

Then start:

```powershell
npm run server:dev
npm run dev
```
