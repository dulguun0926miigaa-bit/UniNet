# Deployment and rollback runbook

UniNet has local Dockerfiles and CI quality gates but no committed production
platform, registry, TLS certificate, secret-manager binding, automated deploy, or
recorded production rollback. Adapt this runbook to the chosen provider and record
evidence.

## Artifact model

- Build from a reviewed commit using pinned Node/npm and `npm ci`.
- Promote the same immutable backend/frontend artifacts between environments; do
  not rebuild source differently for production.
- Record Git SHA, image digest, lockfile checksum, migration set, frontend
  `VITE_API_URL`, and OpenAPI contract version.
- Current base/Compose image tags are not digest-pinned and artifacts are not signed
  or accompanied by an SBOM/provenance attestation. Complete those controls before
  claiming verified supply-chain promotion.

## Pre-deployment checklist

- [ ] CI lint, type-check, tests, build, audit, docs link check, migration/seed smoke,
  dependency review, and secret scan passed for the exact commit.
- [ ] Change and security review completed; known limitations accepted.
- [ ] Production environment schema passes with independent secrets, TLS database,
  HTTPS app/CORS origins, correct proxy hop count, and production SMTP/disabled mode.
- [ ] Artifact vulnerability/signature/provenance policy passed when available.
- [ ] Database change followed the [migration runbook](migrations.md), including
  staging and a pre-change recovery checkpoint.
- [ ] Backup/PITR freshness and restore readiness verified externally.
- [ ] Capacity, quota, certificate, DNS, database, SMTP, log/metric/alert health checked.
- [ ] Rollback artifact and schema-compatibility decision recorded.
- [ ] Owner, reviewer, incident channel, maintenance/user communication, and abort
  thresholds assigned.

## Deployment order

1. Capture baseline error rate, latency, saturation, readiness, database connections,
   key workflow success, and current artifact/migration state.
2. Run any additive migration once with separate migration credentials.
3. Deploy the backend to a canary/small percentage. Wait for readiness
   (`GET /api/ready`) and ensure liveness (`GET /api/health`) remains healthy.
4. Smoke test login, refresh rotation, `/auth/me`, authorized Student bootstrap,
   operations bootstrap for allowed role, tenant denial, content read, and a
   non-destructive database mutation/rollback-safe fixture where approved.
5. Expand backend rollout while watching the predeclared abort metrics.
6. Deploy the frontend built with the production API URL; verify asset caching, SPA
   fallback, CSP, CORS/cookies, and session restoration.
7. Test one representative workflow per role plus email delivery and any changed
   feature. Do not use or expose real Student data for smoke tests.
8. Record results and monitor at elevated sensitivity for at least one access-token
   lifetime and the changed feature's business cycle.

The committed Nginx serves the SPA and does not reverse-proxy `/api`; production
edge routing must match `VITE_API_URL`, cookie path, CORS, and Origin tests.

## Abort/rollback triggers

Stop expansion on sustained readiness failure, elevated 5xx/auth/tenant-denial
anomalies, migration errors/lock budget breach, data integrity mismatch, failed
email/session workflow, CSP/CORS breakage, missing logs, or a security alert. Define
numeric thresholds from production baseline before release.

## Application rollback

1. Freeze rollout and nonessential writes; announce incident/change status.
2. Confirm the previous application can read/write the **current** schema. Never
   rollback code across an incompatible contract/drop migration.
3. Repoint deployment to the recorded previous immutable digest and roll out a
   canary.
4. Verify health, auth/session, tenant isolation, key reads/writes, and logs.
5. Expand rollback, invalidate incompatible frontend caches if required, and monitor.
6. Keep additive database changes in place unless a reviewed forward fix is needed.

## Database failure

Do not attempt an automatic down migration. Follow
[migration forward-fix](migrations.md#failure-and-forward-fix). Restore/PITR is an
incident-level decision because it can lose/replay committed user actions; follow
the [backup/restore runbook](backup-restore.md).

## Frontend rollback

Restore the previous static artifact/digest and invalidate only necessary edge cache
entries. Confirm it remains API-contract and CSP compatible. Hashed `/assets/` may
stay immutable; `index.html` must not remain cached as the failed entry point.

## Deployment evidence

Attach commit/artifact digests, CI run, dependency scan, migration/backup checkpoint,
operators/reviewers, start/end UTC, baseline/canary/final metrics, smoke results,
alerts, configuration version, rollback decision, and follow-up issues. No such
production record currently exists in the repository.
