# Phase 5K — Authenticator recovery, ticket entry, stability and UI fixes

> Superseded by [Phase 5L](PHASE-5L-DIRECT-AUTHENTICATOR-ADMIN-ACTIONS.md) for the current direct-email-to-Authenticator-QR recovery flow and removal of automatic admin mutation step-up.

## Included changes

- Student forgot-password flow: school email → email code → Google Authenticator QR → 6-digit TOTP → new password.
- Password history enforcement, one-time reset token, TOTP replay protection, rate limiting, and revocation of old sessions.
- Event registration QR deep-link generation removed. A Student obtains a signed QR ticket by pressing **Тасалбар авах**.
- The ticket UI tells the Student to show the QR in person at the event; entry is denied when the ticket is not shown.
- Staff/University Admin attendance scanner remains, because it validates the Student's signed entry ticket.
- Admin approve/reject/status controls no longer request an operator-entered reason. Password + MFA step-up remains for protected admin mutations.
- Notification/profile dropdowns and select menus use explicit stacking layers and no longer render behind cards.
- Search/filter action rows use responsive grids and full-width buttons to prevent overlap.
- The local service runner supervises Identity, Core and API Gateway processes and restarts a crashed child with bounded exponential backoff.
- Frontend GET/HEAD calls retry short network, timeout, 502, 503 and 504 failures twice. Mutations are not automatically repeated.
- Docker PostgreSQL is exposed on host port `5433` to avoid an existing Windows PostgreSQL on `5432`.

## Local environment

Copy `.env.example` to `.env` and keep real secrets only in `.env`.

```env
DATABASE_URL=postgresql://uninet:uninet-local-only@localhost:5433/uninet?schema=public
REDIS_URL=redis://localhost:6379
APP_URL=http://localhost:5174
VITE_API_URL=http://localhost:4000/api
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

When the Node backend runs directly on Windows and Mailpit runs in Docker:

```env
EMAIL_DELIVERY_MODE=smtp
EMAIL_FROM=no-reply@uninet.local
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=uninet-local
SMTP_PASSWORD=uninet-local
```

Mailpit inbox:

```text
http://localhost:8025
```

For real Gmail/school-email delivery, configure Resend or a production SMTP provider and use a verified sender domain.

## Start locally

```powershell
docker compose up -d postgres redis mailpit
Test-NetConnection localhost -Port 5433
npm run db:generate
npm run db:deploy
npm run db:seed
```

Terminal 1:

```powershell
npm run server:dev
```

Terminal 2:

```powershell
npm run dev
```

Open:

```text
http://localhost:5174
```

## Forgot-password verification

1. Register or use an active Student account with a school email.
2. Press **Нууц үг мартсан?**.
3. Enter the school email.
4. Open the delivered email in the real inbox or Mailpit and enter its 6-digit code.
5. Scan the displayed QR with Google Authenticator.
6. Enter the current 6-digit Authenticator code.
7. Create and confirm a new password.
8. Log in using the school email and the new password.

The reset succeeds only after the one-time school-email code and the current TOTP are verified. A newly enrolled authenticator produces one-time recovery codes; store them safely.

## Ticket verification

1. Student opens a published event and presses **Тасалбар авах**.
2. The server creates or returns the registration.
3. For a confirmed registration, UniNet displays the signed QR ticket.
4. The Student shows this QR physically at the event.
5. Staff or University Admin scans it in the attendance tool.
6. The server verifies signature, expiry, event, tenant, registration and attendance state.

There is no public registration QR generator in Phase 5K.

## Stability scope

The supervisor and request retries reduce temporary disconnects, but software cannot truthfully guarantee that an unavailable database, occupied port, invalid secret, stopped Docker daemon, network outage or machine shutdown will never cause an error. Readiness endpoints and terminal logs remain the source of truth:

```text
http://localhost:4000/api/live
http://localhost:4000/api/ready
```

## Verification

```powershell
npm run test:phase5k-smoke
npm run test:phase5j-smoke
npm run test:phase5i-smoke
npm run test:mvp-backend-smoke
npm run docs:check
npm run security:licenses
```
