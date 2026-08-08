# UniNet

UniNet is a multi-university opportunity and collaboration platform. The current
repository contains a React/Vite single-page application, an Express API, Prisma,
and PostgreSQL. It supports Student, Staff, University Admin, and Platform Super
Admin workspaces with server-enforced role and university boundaries.

The project is under active development and has not been certified or deployed as
a production service. See [Known limitations](#known-limitations-before-production)
before using it with real personal data.

## Quick start

Required toolchain:

- Node.js `24.15.0`
- npm `11.12.1`
- PostgreSQL 17 (local installation or Docker)

Install and configure:

```powershell
Copy-Item .env.example .env
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
```

Replace every placeholder in `.env`. Start the API and web app in separate
PowerShell terminals:

```powershell
npm run server:dev
```

```powershell
npm run dev
```

The default URLs are `http://localhost:5173` for the web app and
`http://localhost:4000/api/health` for API liveness. For a Docker-based local
environment, run:

```powershell
npm run docker:config
docker compose up --build
```

The Compose stack includes PostgreSQL, Mailpit, MinIO, ClamAV, Redis, the API, and
the built web app. Redis backs distributed rate limits; a durable background queue
is not implemented yet. Full setup and troubleshooting are in
[Local development](docs/development.md).

## Phase 5D workflow demo

Phase 5D adds frontend-integrated management for event registrations and
internship/job applications. Staff views are creator-scoped, University Admin views
are tenant-scoped, and workflow mutations enforce state, idempotency, authorization,
notifications, immutable history, and audit events on the server.

Key frontend demo paths:

- Staff/University Admin: registration search/filter/pagination and attendance;
- Student: register, cancel, waitlist, automatic promotion and notifications;
- Staff/University Admin: application search/filter/detail, authorized CV download,
  and `SUBMITTED -> UNDER_REVIEW -> SHORTLISTED -> ACCEPTED/REJECTED`;
- University Admin: Audit Log evidence for registration, attendance, promotion,
  application submission and status changes.

Use [the Phase 5D frontend demo guide](PHASE-5D-UI-BACKEND-DEMO-GUIDE.md) for a
teacher-facing walkthrough. The implementation summary and unverified quality gates
are recorded in [the Phase 5D report](PHASE-5D-REPORT.md).

### Optional Resend delivery

Local development may keep `EMAIL_DELIVERY_MODE=console`. To exercise the Resend
adapter, place the following only in the uncommitted `.env` file and restart the API:

```env
EMAIL_DELIVERY_MODE=resend
EMAIL_FROM=no-reply@YOUR_VERIFIED_DOMAIN
RESEND_API_KEY=re_your_private_api_key
RESEND_API_URL=https://api.resend.com/emails
RESEND_REPLY_TO=support@YOUR_VERIFIED_DOMAIN
```

No Resend key is shipped in the repository or archive. Real delivery must be verified
with the user's own Resend account and sender configuration.

## Phase 5I account-security controls

Phase 5I adds real TOTP multi-factor authentication and high-risk action
re-authentication. University Admin and Platform Super Admin accounts must enroll
TOTP on first login. Optional Student/Staff enrollment is available from Settings.
Save the displayed recovery codes before leaving the enrollment screen.

Add independent secrets to the uncommitted `.env` file before production use:

```env
MFA_CHALLENGE_SECRET=replace-with-an-independent-long-random-secret
MFA_ENCRYPTION_KEY=replace-with-64-hex-characters
MFA_ISSUER=UniNet
MFA_LOGIN_CHALLENGE_EXPIRES_IN=5m
MFA_SETUP_EXPIRES_IN=10m
STEP_UP_EXPIRES_IN=10m
PASSWORD_HISTORY_COUNT=5
LOGIN_BACKOFF_THRESHOLD=5
LOGIN_BACKOFF_MAX_SECONDS=900
LOGIN_ALERT_THRESHOLD=8
EMAIL_CHANGE_TOKEN_EXPIRES_IN=1h
```

Protected Admin mutations require a short-lived password + TOTP step-up token and
an operator reason. Sensitive settings actions such as password/email change, data
export, device revocation, account deactivation and deletion also require step-up.
The schema change is in migration `20260804110000_phase5i_security_controls`.
See [the Phase 5I report](PHASE-5I-REPORT.md) and
[checklist evidence](PHASE-5I-CHECKLIST-EVIDENCE.md).

## Quality gates

Run the same local checks expected by CI:

```powershell
npm run ci:quality
npm run security:audit
npm run docs:check
```

The API contract is available from a running backend at
`GET /api/openapi.json`; a CSP-safe endpoint index is at `GET /api/docs`.

## Documentation

Start with the [documentation index](docs/README.md), or go directly to:

- [Architecture and data flows](docs/architecture.md)
- [Data model and ERD](docs/data-model.md)
- [Roles, permissions, and tenant visibility](docs/authorization.md)
- [Architecture decisions](docs/adr/README.md)
- [Threat model](docs/security/threat-model.md)
- [Environment and secret operations](docs/security/secrets-and-configuration.md)
- [API compatibility policy](docs/api-versioning.md)
- [Testing strategy](docs/testing.md)
- [Operations runbooks](docs/runbooks/README.md)
- [Privacy and retention](docs/privacy-retention.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/` | React SPA, dashboard layouts, auth client, and role experiences |
| `server/src/` | Express API, validation, auth, authorization, domain workflows, and observability |
| `server/prisma/` | Prisma schema, migrations, and deterministic seed |
| `server/test/` | Vitest unit, middleware, contract, and route-level tests |
| `ops/` | Nginx configuration for the frontend container |
| `.github/` | CI and dependency update automation |
| `docs/` | Architecture, security, operations, and developer documentation |

## Seed accounts

Local role fixtures are controlled by `SEED_ROLE_USERS` and `SEED_ROLE_PASSWORD`.
When enabled outside production, `npm run db:seed` creates dedicated Student, Staff,
and University Admin accounts for each of the five seeded universities plus one
Platform Super Admin. Re-running the seed intentionally resets only these dedicated
fixture accounts to the configured local password, updates their tenant/profile/roster
fixtures, and revokes their old sessions. `SEED_DEMO_USERS` remains available for one
custom Student fixture. Never enable either flag or reuse the demo password in production.

The generated role addresses follow this pattern:

- `student@<official-domain>`
- `staff@<official-domain>`
- `admin@<official-domain>`

Official domains in the local seed are `num.edu.mn`, `must.edu.mn`, `msue.edu.mn`,
`mnums.edu.mn`, and `muls.edu.mn`.

## Known limitations before production

The following are deliberately not represented as completed production controls:

- no production deployment, edge TLS, cloud secret manager, KMS, or signing-key
  rollover with `kid` has been configured;
- no automated PostgreSQL backup/PITR policy or successful restore drill has been
  evidenced; the repository contains procedures only;
- a private S3-compatible upload/quarantine/ClamAV pipeline is implemented, but no
  production bucket/scanner, lifecycle cleanup, workload identity, or provider
  backup/restore evidence is configured; Google OAuth and encrypted TOTP MFA/recovery
  codes are implemented, but real Google credentials/deployed callback verification,
  Staff/Admin provider linking, WebAuthn/passkeys and production key management remain
  open. Email verification is mandatory in production, while local/demo development may
  temporarily bypass the six-digit step with `EMAIL_VERIFICATION_ENABLED=false`;
- the OpenAPI 3.1 compatibility contract covers the declared HTTP operations,
  including the private file upload/list/download/delete routes; generated clients
  are not published yet;
- Redis-backed distributed rate limiting is wired and included in local Compose,
  but there is no durable background job queue or scheduled reminder/deletion worker;
- request logs go to standard output; centralized logs, metrics, tracing, alert
  rules, and a staffed on-call rotation are deployment responsibilities;
- `AuditLog` is database-backed and PostgreSQL blocks UPDATE/DELETE with an
  append-only trigger, but centralized immutable external retention/export is not
  configured;
- tenant isolation is enforced in application queries and authorization checks;
  PostgreSQL row-level security is not enabled;
- account deletion requests record a 30-day schedule, but a production deletion
  executor and backup-expiry enforcement are not present;
- unit, database integration, browser E2E, and accessibility smoke gates are
  configured in CI; performance, sustained-load, and disaster-recovery drills
  still require recorded execution evidence.

Do not infer production readiness from the existence of a Docker image, runbook,
or checklist. Each production control requires provider configuration and recorded
evidence as described in the runbooks.

## Phase 5E final MVP demo

Local demo database-ийг deterministic Event, Application, Survey болон role account-тай сэргээхийн өмнө `.env` дээр:

```env
NODE_ENV=development
SEED_ROLE_USERS=true
SEED_ROLE_PASSWORD=replace-with-your-local-demo-password
DEMO_RESET_CONFIRM=RESET_UNINET_DEMO
```

Дараа нь зөвхөн local/test database дээр:

```bash
npm run db:generate
npm run db:demo-reset
npm run test:phase5e-smoke
```

`db:demo-reset` нь production болон танигдаагүй database нэр дээр ажиллахгүй. Багшид frontend-ээр backend flow харуулах алхмуудыг `PHASE-5E-UI-BACKEND-DEMO-GUIDE.md`-оос үзнэ.


## Phase 5F local configuration

Phase 5F adds Google OpenID Connect, editable university profiles, SSE notifications, live database analytics/monitoring and a SQL-injection audit guard.

Google is disabled until valid credentials are supplied:

```env
GOOGLE_OAUTH_ENABLED=false
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

After setting a Google Web application client, set `GOOGLE_OAUTH_ENABLED=true`, deploy the Phase 5F Prisma migration and restart the API. The exact local redirect URI must also be registered in Google Cloud.

Phase-specific checks and demo steps:

- `npm run test:phase5f-smoke`
- `PHASE-5F-REPORT.md`
- `PHASE-5F-UI-BACKEND-DEMO-GUIDE.md`

## Phase 5G microservice development

The browser uses the API Gateway on port `4000`; Identity Service runs on `4101` and Core Service on `4102`.

```powershell
# Terminal 1
docker compose up -d postgres redis mailpit minio minio-init clamav

# Terminal 2
npm run db:generate
npm run db:deploy
npm run db:seed
npm run services:dev

# Terminal 3
npm run dev
```

Read [PHASE-5G-MICROSERVICES.md](./PHASE-5G-MICROSERVICES.md) for route ownership and deployment boundaries, and [PHASE-5G-UI-BACKEND-DEMO-GUIDE.md](./PHASE-5G-UI-BACKEND-DEMO-GUIDE.md) for the frontend verification flow.

## Phase 5H real checklist closure

Phase 5H focuses on evidence-backed checklist closure rather than marking unfinished production work complete. It adds OAuth issuer/subject hardening and unlink, session idle policy, gateway circuit breaking, frontend request deduplication/cache invalidation, and supply-chain SBOM/license gates.

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
npm run test:phase5h-smoke
npm run services:dev
```

The migration `20260803140000_phase5h_oauth_identity_key` must be deployed. See [the Phase 5H report](PHASE-5H-REPORT.md) and [checklist evidence](PHASE-5H-CHECKLIST-EVIDENCE.md). The repository checklist is 689 completed and 222 incomplete items (75.6%); production-provider and operational evidence remains incomplete.

## Phase 5J

Phase 5K replaces the public event-registration QR with a button-issued signed entry ticket, adds school-email-protected Google Authenticator QR password recovery, removes admin reason prompts, hardens dropdown stacking and responsive filters, and supervises backend services. See [`docs/PHASE-5K-AUTHENTICATOR-TICKET-STABILITY-SETUP.md`](docs/PHASE-5K-AUTHENTICATOR-TICKET-STABILITY-SETUP.md).

Phase 5L changes recovery to school email → direct Google Authenticator QR → six-digit TOTP → new password, and removes automatic password/MFA step-up prompts from admin management mutations. See [`docs/PHASE-5L-DIRECT-AUTHENTICATOR-ADMIN-ACTIONS.md`](docs/PHASE-5L-DIRECT-AUTHENTICATOR-ADMIN-ACTIONS.md).

Phase 5M supersedes the Student recovery portion of Phase 5J–5L: Student Authenticator recovery is removed, forgot-password uses Resend email OTP, Student-only Remember me is added, and Staff Event creation now supports FREE/PAID tickets with Stripe TEST/SANDBOX payment gating before QR issuance. Admin/Super Admin Authenticator login remains. See [`docs/PHASE-5M-RESEND-REMEMBER-STRIPE-SETUP.md`](docs/PHASE-5M-RESEND-REMEMBER-STRIPE-SETUP.md).
