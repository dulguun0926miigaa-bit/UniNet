# PostgreSQL migration runbook

UniNet uses committed Prisma SQL migrations and a forward-fix production policy.
`prisma migrate dev` is for creating migrations locally; production runs exactly one
controlled `prisma migrate deploy` job, never one job per API replica.

When the runtime `DATABASE_URL` uses a transaction pooler, configure `DIRECT_URL`
with a session/direct PostgreSQL connection for Prisma CLI commands. For Supabase,
the transaction pooler commonly uses port `6543`, while the session pooler uses
port `5432`. `prisma.config.ts` prefers `DIRECT_URL` when it is present and safely
maps a Supabase `*.pooler.supabase.com:6543` URL to session port `5432` otherwise.

## Change classification

| Class | Examples | Release approach |
| --- | --- | --- |
| Expand | nullable column/table/index, additive enum value | usually one migration before compatible app |
| Backfill | populate new column or transform data | bounded batches, resumable, separately observed |
| Enforce | `NOT NULL`, unique/FK/check constraint | only after validation proves no violating rows |
| Contract | drop/rename column/table/value | later release after all readers/writers stop using it |
| High lock/rewrite | type rewrite, large default/index, cascade change | staging timing/locks, maintenance or online technique |

Never edit a migration already applied to a shared environment. Add a new migration.

## Author workflow

1. Update `server/prisma/schema.prisma`.
2. Create a named local migration:

   ```powershell
   npm run db:migrate -- --name <descriptive_name>
   ```

3. Review the generated SQL for locks, full-table rewrites, destructive clauses,
   enum behavior, defaults, indexes, constraints, foreign-key deletion, and raw SQL.
4. Run Prisma formatting/generation and all quality gates.
5. Recreate a clean PostgreSQL database and run the complete migration chain plus
   deterministic seed. CI already performs this smoke path on PostgreSQL 17.
6. Test upgrade from a production-like schema/data snapshot in staging and record
   row count, duration, lock waits, disk/WAL growth, and old/new application
   compatibility. This staging evidence is not currently automated by the repo.

## Zero-downtime pattern

Use expand → deploy → backfill → enforce → contract across releases:

1. Add a nullable/backward-compatible field or new table.
2. Deploy code that tolerates old and new state; dual-write if necessary.
3. Backfill in bounded, idempotent batches with progress/checkpoints and throttling.
4. Verify no null/invalid/duplicate rows and compare domain-level samples.
5. Add constraint/index after lock/timing validation.
6. Switch reads to new state and monitor a complete business cycle.
7. Remove old reads/writes, then drop obsolete data in a later approved release.

For large indexes/constraints, design PostgreSQL online/concurrent steps explicitly
and verify Prisma transaction behavior for that migration. Do not paste an online
DDL recipe without testing the exact supported PostgreSQL and Prisma versions.

## Production preflight

- [ ] Change/release owner, reviewer, time window, and communication channel assigned.
- [ ] SQL and Prisma schema reviewed; destructive/locking operations identified.
- [ ] Staging upgrade from production-like data passed with artifact attached.
- [ ] Old and new app versions are compatible with the intermediate schema.
- [ ] Provider health, storage headroom, replica lag, active queries, and lock budget checked.
- [ ] Automated backup/PITR healthy and an exact pre-change recovery checkpoint recorded.
- [ ] Restore procedure is current; RPO/RTO and abort thresholds approved.
- [ ] Migration credential is separate and available; API credential does not need DDL.
- [ ] `DIRECT_URL` uses a session/direct connection when `DATABASE_URL` is transaction-pooled.
- [ ] Forward-fix SQL/code prepared for the highest-risk failure where practical.

Items concerning provider backup/staging require external evidence and are not
satisfied by the repository's CI migration smoke job.

## Deploy

1. Record current application artifact and database migration status:

   ```powershell
   npx --no-install prisma migrate status
   ```

2. Pause only affected writers/jobs when the design requires it. The current app has
   no worker queue, but API mutations may still be active.
3. Run once from the reviewed release artifact:

   ```powershell
   npm run db:deploy
   ```

4. Capture output, duration, database metrics, and migration table state.
5. Run `prisma migrate status`, readiness, and focused data integrity queries.
6. Deploy/continue application rollout and perform the smoke tests in the
   [deployment runbook](deployment-rollback.md).

## Failure and forward fix

1. Stop rollout and affected writes; preserve migration output and database state.
2. Determine whether SQL committed fully, partially, or not at all. Do not rerun or
   mark a migration resolved based only on an error message.
3. If the schema is backward compatible, keep/restore the last compatible app while
   preparing a new corrective migration.
4. If Prisma reports a failed migration, inspect actual objects/data. Use
   `prisma migrate resolve --rolled-back` or `--applied` only after peer review proves
   the database state exactly matches that declaration.
5. Prefer a new forward-fix migration. Restore/PITR only when forward correction is
   unsafe and the incident commander/data owner accepts data loss/reconciliation.
6. Re-run integrity and application smoke tests, then document root cause.

There are no down migration scripts. Application rollback after a destructive
contract migration may be impossible; this is why contract changes are delayed.

## Evidence record

Record environment, change/release ID, Git SHA/artifact digest, migration names,
operator/reviewer, start/end UTC, pre-change recovery point, row/lock metrics,
commands, outputs, integrity samples, smoke results, alerts, and final decision.
The phrase “migration deployed” is not evidence without this record.
