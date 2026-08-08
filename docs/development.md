# Local development

## Pinned toolchain

Use Node.js `24.15.0` and npm `11.12.1` from `.nvmrc`, `.node-version`, and
`package.json`. Docker Desktop is optional but is the easiest way to run local
infrastructure. Install exactly from the committed lockfile:

```powershell
npm ci
```

Use `npm install` only when intentionally changing dependencies and commit the
matching lockfile.

## Option A: complete Docker stack

This is the shortest setup and uses PostgreSQL, Redis, Mailpit, MinIO, ClamAV, API,
and the built SPA:

```powershell
Copy-Item .env.example .env
npm run docker:config
docker compose up --build
```

Local endpoints:

| Service | URL/port |
| --- | --- |
| Web app | `http://localhost:5173` |
| API liveness | `http://localhost:4000/api/health` |
| API readiness | `http://localhost:4000/api/ready` |
| OpenAPI / endpoint index | `http://localhost:4000/api/openapi.json` / `/api/docs` |
| Mailpit inbox | `http://localhost:8025` |
| MinIO API / console | `http://localhost:9000` / `http://localhost:9001` |
| PostgreSQL / Redis / ClamAV | ports `5432` / `6379` / `3310` |

Compose credentials and HTTP endpoints are local-only. Redis backs distributed
rate limits, but there is no durable background queue yet. MinIO and ClamAV exercise
the real file adapter/scanner interfaces, but are not production provider evidence.

Stop without deleting data:

```powershell
docker compose down
```

Adding `--volumes` permanently removes the named local PostgreSQL, object-storage,
Redis, and ClamAV data. Use it only after verifying the Compose project and accepting
that loss.

## Option B: hot-reload app with Docker infrastructure

Use three PowerShell terminals.

### Terminal 1 — infrastructure

```powershell
docker compose up -d postgres mailpit minio minio-init clamav
docker compose ps
```

### Configure `.env`

Copy `.env.example` and generate three independent local signing secrets. When
using the Compose dependencies from a host-run API, set at least:

```env
DATABASE_URL=postgresql://uninet:uninet-local-only@localhost:5432/uninet?schema=public
APP_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
EMAIL_DELIVERY_MODE=smtp
EMAIL_FROM=no-reply@uninet.local
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=uninet-local
SMTP_PASSWORD=uninet-local
FILE_STORAGE_PROVIDER=s3
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=uninet-files
S3_ACCESS_KEY=uninet-local
S3_SECRET_KEY=uninet-local-secret
S3_FORCE_PATH_STYLE=true
CLAMAV_MODE=clamd
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
```

Replace the JWT/ticket placeholders with independent 32+ character values. Never
commit `.env`. `CLAMAV_MODE=disabled` is an allowed development bypass but does not
test malware protection and is rejected in production.

### Terminal 2 — database and API

```powershell
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run server:dev
```

### Terminal 3 — Vite

```powershell
npm run dev
```

Vite uses `VITE_API_URL` at build/runtime bundling. It must be a public API URL and
must never contain secrets.

## Database workflow

- Create a migration locally: `npm run db:migrate -- --name <name>`.
- Apply committed migrations: `npm run db:deploy`.
- Inspect data: `npm run db:studio`.
- Re-run seed safely: `npm run db:seed`; base rows are create-only and opt-in users
  are not overwritten.

Read [the migration runbook](runbooks/migrations.md) before changing non-empty
production-like data. Never point local test/reset commands at a production URL.

## Local users

Normal registration creates a database-backed Student. Local fixtures are optional and
controlled by `SEED_DEMO_USERS`, `SEED_ROLE_USERS`, and related `.env` values. With
`SEED_ROLE_USERS=true`, one Student, Staff, and University Admin is created for every
seeded university, using the official university domain; a Platform Super Admin is also
created. Re-running the seed resets only these dedicated fixture accounts to
`SEED_ROLE_PASSWORD`, refreshes their profile/roster records, and revokes old sessions.
Keep the flag disabled outside local testing.

For a diploma demo without email delivery, use `EMAIL_VERIFICATION_ENABLED=false` in
local development. New Student registrations then skip the six-digit screen and proceed
directly to active roster matching or University Admin review. Production startup rejects
this bypass and requires `EMAIL_VERIFICATION_ENABLED=true`.

## Resend email adapter

The default local choice is `EMAIL_DELIVERY_MODE=console`. For optional Resend
delivery, put the following in the local `.env`; never commit the API key:

```env
EMAIL_DELIVERY_MODE=resend
EMAIL_FROM=no-reply@YOUR_VERIFIED_DOMAIN
RESEND_API_KEY=re_your_private_api_key
RESEND_API_URL=https://api.resend.com/emails
RESEND_REPLY_TO=support@YOUR_VERIFIED_DOMAIN
```

Restart `npm run server:dev` after changing the delivery mode. The backend validates
that a key exists in Resend mode. Phase 5D can send optional application-status,
attendance-confirmation and waitlist-promotion messages in addition to the existing
verification, invitation and password-reset templates. Real delivery remains an
environment verification step and is not proven by source code alone.

## Tests and validation

Fast/full local quality:

```powershell
npm run lint
npm run type-check
npm run test:coverage
npm run build
npm run security:audit
npm run docs:check
```

PostgreSQL integration tests refuse database names that do not contain
`test`, `ci`, or `integration` unless explicitly overridden. Create and migrate a
dedicated local database, then run:

```powershell
docker compose exec postgres createdb -U uninet uninet_integration
$env:DATABASE_URL='postgresql://uninet:uninet-local-only@localhost:5432/uninet_integration?schema=public'
npm run db:deploy
npm run test:integration
Remove-Item Env:DATABASE_URL
```

Browser E2E also requires a dedicated database and starts API/Vite itself:

```powershell
docker compose exec postgres createdb -U uninet uninet_e2e
$env:DATABASE_URL='postgresql://uninet:uninet-local-only@localhost:5432/uninet_e2e?schema=public'
npm run db:deploy
npx --no-install playwright install chromium
npm run test:e2e
Remove-Item Env:DATABASE_URL
```

If the test database already exists, skip `createdb`. See
[Testing strategy](testing.md) for scope and gaps.

## Common failures

### `ERR_CONNECTION_REFUSED` on port 4000

The frontend is running but the API is not ready. Start `npm run server:dev`, then
open `/api/ready`. If readiness is `503`, inspect PostgreSQL and `DATABASE_URL`.

### Registration returns 500

Check API terminal JSON error event and the client request ID. Confirm migrations
are deployed, PostgreSQL is reachable, current policy rows exist (`npm run db:seed`),
and production-style environment validation is not rejecting local placeholders.

### File upload returns storage or scan unavailable

Run `docker compose ps`, verify MinIO bucket initialization and that ClamAV finished
loading signatures, then check `S3_*`/`CLAMAV_*` host values. Host-run API uses
`localhost`; container API uses Compose service names.

### OneDrive Docker build error

Docker Desktop may reject OneDrive Files On-Demand reparse points as BuildKit input.
The helper builds from a verified hydrated temporary copy:

```powershell
npm run docker:build:windows
docker compose up --no-build
```

### Prisma client/schema mismatch

Run `npm run db:generate`, restart the API/test process, and check
`npx --no-install prisma migrate status`. Do not manually edit migration history.

## Local data safety

- Never copy production data into a developer database without approved
  anonymization and access controls.
- Do not place tokens/passwords in screenshots, fixtures, request logs, or issue text.
- Treat Mailpit, MinIO console, Prisma Studio, and local ports as sensitive; bind or
  firewall them appropriately on shared networks.
- Local console email exposes reset/invitation links in a terminal; use only with
  synthetic accounts.
