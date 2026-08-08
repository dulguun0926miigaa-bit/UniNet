## Phase 5L — Direct Authenticator recovery and direct admin actions

- Removed the school-email OTP screen from Student forgot-password recovery.
- Student email now returns the Google Authenticator QR directly.
- Kept TOTP replay protection, one-time reset token, password history and session revocation.
- Removed automatic admin password/MFA step-up prompts from management mutations.
- Added direct Mongolian approve/reject success messages.
- Added Phase 5L source smoke and updated OpenAPI/docs.


## Phase 5J — 2026-08-06

- Added Student TOTP password reset with rate limiting, replay protection, password history and session revocation.
- Added public event registration QR deep links and camera attendance scanning.
- Activated verified Student registrations directly and removed the University Admin review UI for new Students.
- Added University profile persistence, logo URL/upload and profile retry UX.
- Added notification read/read-all/action navigation and layout-aware skeletons.
- Standardized local Vite development on port 5174.

# Changelog

## 2026-08-04 — Phase 5I security, MFA and step-up closure

- Added generic `OAuthAccount` identity records while retaining backward-compatible Google fields.
- Added AES-256-GCM encrypted TOTP MFA, QR/manual enrollment, one-time recovery codes, replay protection and recovery-code rotation.
- Made TOTP enrollment mandatory for University Admin and Platform Super Admin sessions.
- Added session-bound password + MFA step-up tokens and mandatory operator reasons for protected Admin mutations.
- Added verified same-university email change with expiring one-time tokens, session revocation and audit events.
- Added common-password/sequence screening, configurable password history and password-reuse prevention.
- Added persistent email/IP login backoff plus suspicious-login security notifications and high-severity audit events.
- Added MFA/account-security settings UI, OAuth MFA continuation, OpenAPI 1.7.0 and Phase 5I smoke coverage.
- Closed 26 evidence-backed checklist rows; checklist is now 715/916 (78.1%).

## 2026-07-30 — Phase 5F UX, Google OAuth, realtime and live operations

- Redesigned the pre-login landing background, university cards, comparison, visibility preview and footer.
- Added Google OpenID Connect server flow and first-login university-email onboarding fields/migration.
- Added styled selects, removed collapsed sidebar tooltips, aligned toggle and animated popover exits.
- Merged survey reports, partnership navigation and admin analytics navigation.
- Added editable University Admin/Super Admin university profiles.
- Replaced dashboard/global report figures with database aggregates and expanded live monitoring.
- Added SSE notifications and SQL-injection request detection/audit.
- Updated OpenAPI to 1.4.0 and added Phase 5F smoke/demo documentation.


## 2026-07-30 — Phase 5E Final MVP stabilization

- Added critical role/permission/tenant and IDOR/BOLA verification sources.
- Added strict membership/university pagination and search limiting.
- Added guarded deterministic demo reset and seeded final-MVP workflows.
- Added Mongolian backend-error mapping, 403/404/500 states, and University/domain UI integration.
- Added Phase 5E frontend demo guide and honest verification report.


## Phase 5C — Local demo and backend UI verification

- Added a production-disabled local email-verification bypass.
- Added five-university Student/Staff/Admin demo fixtures.
- Added tenant-scoped membership and roster CSV exports with formula protection and audit.
- Added University Admin roster import/export frontend integration.
- Exposed survey visibility, backend filters, and pagination in the Staff UI.

## 2026-07-28 — Phase 5B

- Added explicit survey visibility and partnership-aware audience authorization.
- Hardened Staff creator scope, University Admin tenant scope, and survey report permissions.
- Added strict survey params/query validation, bounded pagination, sort/filter allowlists, and search rate limiting.
- Added survey lifecycle, visibility, permission, cross-tenant, and query validation tests.
- Updated OpenAPI to 1.1.0 and refreshed `things-to-do.md`.

## 2026-07-28 — Phase 5A

- Integrated University Admin pending Student review list, approve, and reject frontend with the existing tenant-safe backend API.
- Added review search, pagination, states, reason dialogs, optional roster record selection, frontend API tests, and smoke checks.


## 2026-07-27 — Phase 3

- Split registration surname and given-name inputs.
- Added semantic enrollment-year model, migration, API validation and UI support.
- Added icon + text expanded sidebars for Student and operations roles.
- Added global and registration-specific layered rate limiting.


All notable changes to UniNet will be documented in this file. The project has no
tagged production release yet; all entries are unreleased.

The format follows Keep a Changelog and future releases will use Semantic Versioning.

## [Unreleased]

### Added

- Production/developer documentation index with C4-style architecture diagrams,
  data flows, conceptual ERD, role/tenant visibility rules, ADRs, and API policy.
- Threat model with trust boundaries, STRIDE analysis, abuse cases, and OWASP review
  map.
- Migration, backup/restore, deployment/rollback, dependency, university onboarding,
  incident, secret rotation, privacy/retention, testing, and release procedures.
- Private S3-compatible CV/avatar pipeline documentation covering quarantine,
  ClamAV scanning, authorization, and current operational gaps.
- Contributor and vulnerability-reporting guidance plus local documentation link
  validation.

### Security

- Documentation distinguishes implemented controls from provider/drill evidence.
  Current residual risks include no WebAuthn/passkeys, no PostgreSQL RLS, no external
  immutable audit retention, single-key JWT/ticket verification, no scheduled
  deletion/cleanup workers, and no production backup/monitoring evidence.

### Known limitations

- See the [README production limitations](README.md#known-limitations-before-production).

<!-- Add a dated [X.Y.Z] section here when the first verified release is cut. -->
## Phase 5E.1 — Direct Student Approval

- Pending Student approval no longer requires a roster row in the University Admin UI.
- Matching roster rows are auto-linked when available; otherwise approval is audited as `DIRECT_ADMIN_APPROVAL`.
- Added `test:phase5e1-smoke`.


## Phase 5G

- Added accessible custom dropdown popovers for core dashboard filters.
- Added Google OAuth existing-Student linking and new-Student registration modes.
- Added PKCE S256 and nonce validation to Google OIDC.
- Added API Gateway, Identity Service and Core Service runtime processes.
- Added gateway readiness aggregation and Docker Compose microservice topology.

## Phase 5H — Real checklist closure

- Added Google issuer/subject identity keys, hardened OIDC claim validation, and a Prisma migration.
- Added password-backed Google account unlink with re-authentication, session revocation, audit, UI, and OpenAPI 1.6.0 documentation.
- Added session idle timeout and bounded activity-touch policies.
- Added API Gateway upstream timeout, cancellation, and per-service circuit breakers.
- Added frontend GET deduplication, explicit TTL caching, and mutation/session invalidation.
- Added CycloneDX SBOM generation, locked-package license policy, CI artifact retention, and dependency-registry policy.
- Closed 21 previously incomplete checklist rows with repository evidence; checklist is now 689/911 (75.6%).

## Phase 5K — Authenticator recovery and ticket stability

- Added school-email verification followed by Google Authenticator QR enrollment for Student password recovery.
- Removed public event-registration QR generation; signed entry tickets are issued after the Student presses the ticket button.
- Removed operator-entered admin reason prompts while retaining password + MFA step-up and audit logs.
- Fixed topbar/dropdown stacking and responsive search/select action layouts.
- Added supervised service restart, transient GET retry, OpenAPI updates and `test:phase5k-smoke`.
- Changed local Docker PostgreSQL host mapping to `5433:5432`.
