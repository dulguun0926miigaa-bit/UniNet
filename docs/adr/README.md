# Architecture Decision Records

ADRs capture decisions that constrain implementation and operations. A later ADR
supersedes an accepted decision; accepted records are not rewritten to make history
look current.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-browser-session-tokens.md) | Accepted | Memory-only access JWT and rotating HttpOnly refresh cookie |
| [0002](0002-multi-tenancy-and-rbac.md) | Accepted | Application-enforced tenant scoping plus RBAC; RLS deferred with revisit criteria |
| [0003](0003-prisma-postgresql.md) | Accepted | PostgreSQL as system of record through Prisma migrations |
| [0004](0004-api-compatibility.md) | Accepted | Current `/api` contract is the v1 compatibility line |
| [0005](0005-private-object-storage.md) | Accepted | Private S3-compatible quarantine and malware-scanned files |

No production storage provider is selected by this ADR. MinIO and ClamAV are local
Compose services; production lifecycle, identity, backups, and availability require
provider evidence.

## Adding an ADR

1. Copy the structure of an existing record and use the next four-digit number.
2. Describe the actual context, alternatives, decision, consequences, and reversal
   or revisit conditions.
3. Link implementation, tests, operational work, and any superseded ADR.
4. Update this index and run `npm run docs:check`.
