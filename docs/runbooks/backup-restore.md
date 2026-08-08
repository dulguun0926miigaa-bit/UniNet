# PostgreSQL backup, PITR, and restore runbook

No production database provider, automated backup policy, point-in-time recovery
(PITR), encryption evidence, or completed restore drill exists in this repository.
This document defines what must be configured and how to validate it.

## Required service objectives

Before launch, the product/data owners must approve and fund:

| Item | Required decision |
| --- | --- |
| RPO | maximum acceptable committed-data loss by data class |
| RTO | maximum time to restore service and reconcile writes |
| Retention | PITR window, daily/weekly snapshot periods, legal holds, deletion expiry |
| Regions/accounts | primary, backup isolation, residency, and correlated-failure boundary |
| Encryption | provider at-rest/transport settings, key owner, rotation and recovery |
| Access | backup creator, restore operator, approver, break-glass audit |
| Drill cadence | suggested quarterly plus after provider/schema/topology changes |

Do not copy an example RPO/RTO from this file; record a business-approved value.

## Backup design requirements

- Provider-managed continuous WAL/PITR with automated retention and failure alerts.
- Scheduled snapshots/logical exports in an access-separated account/location where
  risk assessment requires protection from operator/ransomware deletion.
- Encryption in transit and at rest with recoverable keys and audited access.
- Automated success/freshness checks; a completed job without restorable contents is
  not sufficient.
- Backup lifecycle aligned with [privacy/deletion policy](../privacy-retention.md),
  including restore suppression for already deleted accounts.
- Periodic logical backup when useful for portability; it complements rather than
  replaces provider PITR for large databases.

Redis contains no authoritative application data today.

Private S3-compatible objects are authoritative alongside `FileAsset` metadata.
Production backup/versioning/lifecycle must preserve database/object consistency,
quarantine separation, encryption, and deletion expiry. A PostgreSQL-only restore
can leave broken file references; an object-only restore can resurrect deleted or
unauthorized files.

## Optional logical backup example

**Pending execution; provider-specific.** Use a read-only/backup credential and a
secure destination. Avoid putting passwords in command history or filenames.

```powershell
pg_dump --dbname=$env:UNINET_SOURCE_DATABASE_URL --format=custom --no-owner --no-acl --file=uninet-backup.dump
pg_restore --list uninet-backup.dump
```

Encrypt the artifact immediately with an approved KMS/tool, calculate and store a
checksum separately, restrict access, and delete plaintext working files according
to policy. `pg_dump` does not include provider roles, secret-manager configuration,
edge settings, or external SMTP/log data.

## Isolated restore procedure

1. Open an approved change/drill and identify restore point, reason, expected data
   loss, source backup, application version, migration state, and owner.
2. Create a new isolated PostgreSQL target with no production network route or user
   traffic. Verify its resolved host/account/project before any `--clean` operation.
3. Restore through the provider PITR console/API, or for an approved logical dump:

   ```powershell
   pg_restore --dbname=$env:UNINET_RESTORE_DATABASE_URL --clean --if-exists --no-owner --no-acl uninet-backup.dump
   ```

   This example is destructive to the **restore target**. Never point
   `UNINET_RESTORE_DATABASE_URL` at the source/production database.

4. With `DATABASE_URL` set only in the isolated verification environment, run:

   ```powershell
   npx --no-install prisma migrate status
   npm run db:generate
   ```

5. Do not automatically run pending migrations until the matching application and
   recovery plan are confirmed.
6. Validate integrity:
   - migration history and schema objects/triggers;
   - row counts by University/User/role/status and critical domain tables;
   - unique/FK/check constraints and orphan detection;
   - representative tenant boundaries, policy checksums/acceptances, session state,
     content histories, registrations/waitlist, applications, surveys, consent/audit;
   - application login/refresh and role smoke tests using synthetic authorized data.
7. Apply the restricted restore-suppression/deletion ledger before exposing service.
   Reconcile every restored `AVAILABLE` FileAsset with its object key/hash/size and
   ensure no quarantined/infected/deleted object becomes downloadable.
8. Scan logs for secrets/PII and keep the restored environment isolated or destroy it
   recoverably after evidence collection.

## Disaster recovery cutover

1. Incident commander confirms forward recovery is unsafe and approves the recovery
   point plus expected loss.
2. Stop writes, capture the final source state/WAL position, and preserve evidence.
3. Complete isolated validation, then reconcile or queue post-restore writes using a
   domain-approved method. Do not silently discard registrations/applications.
4. Rotate database credentials and update secret references/DNS only after validation.
5. Deploy the schema-compatible application and verify readiness/critical workflows.
6. Monitor errors, tenant counts, lag, auth/session behavior, and audit/log ingestion.
7. Communicate actual RPO/RTO and lost/reconciled records.

## Restore drill evidence

A successful drill record contains backup ID/time, target point, operator/reviewer,
provider/account/region, start/end UTC, measured RPO/RTO, artifact checksum, commands,
schema/migration status, integrity query outputs, application smoke results,
deletion-suppression result, issues, and final destruction/cutover decision.

Until such a record exists, “restore tested,” “PITR enabled,” and “RPO/RTO met” must
remain incomplete claims.
