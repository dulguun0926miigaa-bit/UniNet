# ADR-0003: Prisma and PostgreSQL persistence

- Status: Accepted
- Date: 2026-07-27

## Context

UniNet needs relational integrity across identity, university tenancy, role
profiles, content workflows, registrations, applications, surveys, privacy evidence,
and audit records. Capacity/waitlist and session rotation require transactions and
concurrency controls.

## Decision

- Use PostgreSQL as the authoritative data store.
- Use Prisma Client for application queries and transactions.
- Version schema changes as committed SQL migrations and deploy them with
  `prisma migrate deploy`.
- Use database constraints and indexes for stable identity and uniqueness
  invariants; keep request/domain validation in Zod/application code.
- Use native SQL in a migration when a database-level invariant is appropriate,
  such as published policy document immutability.
- Use forward fixes in production rather than automatically reversing a migration.

## Consequences

- The complete migration chain must be tested against the supported PostgreSQL
  version, not only mocked repositories.
- Prisma schema does not express every database feature; reviewers must inspect SQL
  migrations and drift.
- Expand/backfill/contract is required for zero-downtime destructive changes.
- Database backup, PITR, encryption, replicas, and credential management are
  provider responsibilities and are not created by Prisma.
- Redis in local Compose is not a second source of truth and is unused today.

## Alternatives considered

- Document database — rejected because relational constraints, transactional state
  machines, and tenant joins are central.
- Handwritten SQL for all access — rejected for current team velocity; retained for
  migrations and cases Prisma cannot safely express.
- Schema-per-tenant — rejected for the current network content model and operational
  complexity.

## Evidence

- `server/prisma/schema.prisma`
- `server/prisma/migrations/`
- `server/src/lib/prisma.js`
- CI migration and seed smoke job
- [Migration runbook](../runbooks/migrations.md)
