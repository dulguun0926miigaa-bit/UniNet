# Release and changelog process

No production UniNet release or deployment is evidenced in this repository. The
package remains `0.0.0`; adopt this process when release ownership and hosting exist.

## Versioning

Use Semantic Versioning for application releases:

- patch: backward-compatible fix/security hardening;
- minor: backward-compatible feature or optional API addition;
- major: incompatible behavior or API contract change.

The current `/api` surface is the v1 compatibility line. Breaking API changes also
follow [API versioning](api-versioning.md), including a new base path and migration
window; package SemVer alone is not enough.

## Changelog

Maintain [`CHANGELOG.md`](../CHANGELOG.md) in Keep-a-Changelog style. Add user/
operator-visible entries under `Unreleased` in `Added`, `Changed`, `Deprecated`,
`Removed`, `Fixed`, or `Security`. Do not place exploit details, secrets, or affected
personal data in public notes.

At release:

1. verify every entry against merged behavior and known limitations;
2. move entries to `[X.Y.Z] - YYYY-MM-DD` and leave an empty `Unreleased` section;
3. record migrations, config/new secrets, compatibility, data/backfill, rollout,
   rollback constraints, and security/privacy impact;
4. tag the reviewed commit only after exact-artifact CI passes.

## Release checklist

- [ ] Scope/owner/version/date and change/security/privacy reviews approved.
- [ ] Git repository/history is healthy; release commit/tag can be verified.
- [ ] Exact commit passes all CI jobs and documentation link check.
- [ ] OpenAPI compatibility baseline and migration/seed smoke pass.
- [ ] Dependency/image/advisory review passes; SBOM/signature/provenance attached when implemented.
- [ ] New environment variables/secrets documented, injected, and rotation/rollback understood.
- [ ] Database migration follows staging/backup/zero-downtime runbook with evidence.
- [ ] Production SMTP, object storage/scanner, database, logs/metrics/alerts and quotas are healthy.
- [ ] Accessibility/security/performance risk for changed paths accepted.
- [ ] Immutable artifacts/digests, previous rollback artifact, and compatibility recorded.
- [ ] Changelog/release note and user/university communication ready.
- [ ] Deployment owner, observer, incident channel, abort thresholds, and monitoring window assigned.

Provider-dependent items must remain unchecked until evidence exists.

## Release notes template

```markdown
# UniNet X.Y.Z — YYYY-MM-DD

## Outcome
<User/operator-visible summary>

## Added / changed / fixed
- ...

## Security and privacy
<Sanitized impact and required actions>

## API and data compatibility
<OpenAPI compatibility, migrations, backfill, irreversible changes>

## Configuration and operations
<New variables, providers, capacity, monitoring>

## Known limitations
- ...

## Rollout and rollback
<Artifact digests, phased plan, abort conditions, schema-compatible rollback>

## Evidence
<CI, staging, backup checkpoint, smoke test, approvals>
```

## Hotfix

Use the same artifact, migration, and audit discipline with reduced scope. Follow the
[dependency emergency process](runbooks/dependency-updates.md) or
[incident response](security/incident-response.md), document any skipped gate and
compensating validation, then back-merge the fix and complete a post-incident review.

## Rollback

Follow [deployment rollback](runbooks/deployment-rollback.md). Never promise rollback
when a destructive migration made the previous application incompatible; prepare a
forward fix and data recovery decision instead.
