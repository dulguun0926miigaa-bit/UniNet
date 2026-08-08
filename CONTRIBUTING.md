# Contributing to UniNet

Thank you for improving UniNet. Changes may affect multiple universities and
personal data, so tenant-denial tests, migrations, privacy, and operational impact
are part of feature completeness.

## Repository prerequisite

This workspace snapshot currently does not expose a usable Git repository to local
commands. Repair/initialize Git and configure the authoritative remote, protected
branches, required CI checks, review ownership, and signed-release policy before
using a pull-request release workflow. Do not manufacture history that loses source
provenance.

## Set up

Follow [Local development](docs/development.md). Use pinned Node/npm, `npm ci`, a
local/dedicated PostgreSQL database, and synthetic data. Never place real Student
records, CVs, survey answers, credentials, tokens, or `.env` in a branch or issue.

## Change workflow

1. Open a focused issue/change description with outcome, affected roles/tenants,
   data/security/privacy impact, and acceptance tests.
2. Update code, strict boundary validation, authorization, tests, OpenAPI, migrations,
   documentation, and changelog together.
3. Preserve existing user changes and avoid unrelated refactors/dependency updates.
4. Run the quality gates and attach exact results.
5. Request review from the responsible module plus security/privacy/database review
   when relevant.

## Definition of done

- no UI-only authorization; server role, permission, tenant, ownership, and state
  checks are explicit;
- request input is bounded/strict and output does not expose secrets or unnecessary
  personal data;
- mutation, history, audit, notification, and idempotency behavior are deliberate;
- database changes follow expand/backfill/contract and include a reviewed migration;
- OpenAPI/compatibility fixture and clients change together;
- loading, empty, error, permission, mobile, keyboard, and reduced-motion states are
  handled for UI work;
- allowed and denied role/cross-tenant/concurrency paths are tested at the correct
  layer;
- threat model/runbooks/env/README/changelog reflect operational impact and gaps;
- no production control is marked complete based only on a local config or document.

## Required local checks

```powershell
npm run ci:quality
npm run security:audit
npm run docs:check
npm run docker:config
```

Run `npm run test:integration` and `npm run test:e2e` with dedicated databases when
the change touches their paths. CI runs these layers independently. See
[Testing strategy](docs/testing.md).

## Database changes

- Never edit an applied migration; create a new named migration.
- Review generated SQL, locks, rewrites, enum/constraint/delete behavior and indexes.
- Add PostgreSQL integration evidence for concurrency or database-only invariants.
- Do not add down scripts that imply safe destructive rollback. Document app
  compatibility and a forward fix.
- Follow [the migration runbook](docs/runbooks/migrations.md).

## API changes

The current `/api` surface is the v1 compatibility line. Update Zod/runtime behavior,
OpenAPI, client service, contract test/fixture, and release note in one change. Use a
new versioned router for breaking changes. See [API versioning](docs/api-versioning.md).

## Security and tenant review

Use [authorization rules](docs/authorization.md) and the
[threat model](docs/security/threat-model.md). Every resource ID path needs own/other
tenant denial coverage. Treat file bytes, URLs, JSON, CSV, free text, and headers as
untrusted. Never weaken scanner/config/auth checks to make a test or demo pass.

Report a suspected vulnerability privately according to [SECURITY.md](SECURITY.md),
not in a public issue.

## Documentation style

- State outcome first and distinguish Implemented, Procedure, and Pending evidence.
- Link to authoritative code/schema/runbook instead of duplicating drifting commands.
- Use Mermaid only when relationships/sequence are clearer than prose.
- Do not include plaintext passwords, provider identifiers, personal data, or real
  incident detail.
- Run `npm run docs:check` after moving/adding links.

## Commit and review guidance

Once Git is repaired, use focused descriptive commits and keep generated artifacts,
coverage, Playwright output, `.env`, dumps, and uploaded test files out of history.
Reviewers should challenge cross-tenant denial, failure/rollback, concurrency,
privacy retention, and evidence claims—not only the happy path.
