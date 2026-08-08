# UniNet Phase 5F — UX, Google OAuth, realtime notification and live operations

Date: 2026-07-30

## Purpose

Phase 5F upgrades the public landing page and the role dashboards without replacing the Phase 5E.1 business flows. It also adds a server-side Google OpenID Connect authorization-code flow, editable university profiles, database-backed global analytics/system monitoring, an SSE notification channel and a conservative SQL-injection request guard.

## Implemented

### Public landing page

- Added a layered network/grid background to the pre-login hero.
- Tightened the five university cards and moved each university color to the top border.
- Removed the PostgreSQL explanatory sentence.
- Replaced the old before/after block with a responsive UniNet workflow comparison.
- Made all four visibility cards neutral and equal before selection; selected details use their own color.
- Redesigned the publish preview and footer FAQ/help/security area.
- Added Google buttons to both login and registration dialogs.

### Google identity

- Added `/api/auth/google/start`, `/callback`, `/onboarding`, and `/complete`.
- Uses a server-side authorization-code exchange, short-lived signed state, exact configured callback URL and Google ID-token verification.
- First-time Google users enter an arbitrary local-part university email such as `bat@num.edu.mn`; verified UniNet domains determine the university.
- Stores `googleId`, Gmail, university student email, auth provider and linked time.
- Subsequent logins use the stored Google subject and create a normal UniNet session.
- OTP is not required when the local verification feature is disabled; pending Student approval remains available.

### Dashboard UX

- Applied a unified styled select treatment across role dashboards.
- Removed collapsed-sidebar native/custom tooltip labels.
- Aligned the desktop sidebar toggle to the collapsed logo/icon column.
- Added exit animation to notification and profile popovers.
- Embedded survey responses/analytics in `Судалгаа ба асуулга`.
- Merged University Admin partnership pages and report/analytics pages.

### Real operations

- University Admin can update own university name, logo, colors, website, address and contacts.
- Platform Super Admin can edit the same university profile fields from the university management console.
- Network/Global Analytics uses Prisma `count`/`groupBy` queries for users, content, visibility, registrations, applications, partnerships and surveys.
- Monitoring shows real Node uptime/memory, PostgreSQL response, Redis connectivity, active sessions and security audit counts.
- User, partnership, content and university controls continue to call backend mutations rather than displaying raw JSON.

### Realtime and security

- Added short-lived notification stream tokens and per-user Server-Sent Events.
- Notification creation publishes a refresh event; the UI reconnects and retains polling fallback.
- Pending Student registration and content approval create University Admin notifications.
- Added a conservative SQL-injection signature guard before API routes, plus a critical audit event and monitoring count.
- Prisma remains the primary parameterized database access layer.

## Database and API

- Migration: `20260730100000_phase5f_oauth_university_profile`.
- OpenAPI contract: `1.4.0`.
- New smoke command: `npm run test:phase5f-smoke`.

## Honest verification boundary

Completed in the artifact environment:

- Backend/script JavaScript syntax checking.
- Babel parse of all frontend/e2e JS/JSX/TS/TSX files.
- OpenAPI reference check.
- Phase 3–5F dependency-free smoke regressions and MVP backend static smoke.

Still requires the user's Windows Node 24 + PostgreSQL environment:

- `npm install`, Prisma Client generation and migration deploy.
- Full Vitest unit/integration tests, ESLint, TypeScript check and Vite production build.
- Real Google consent/callback using the user's Google Cloud client ID/secret.
- Multi-browser SSE reconnect verification and production multi-instance pub/sub design.
