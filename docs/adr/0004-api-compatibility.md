# ADR-0004: API compatibility line

- Status: Accepted
- Date: 2026-07-27

## Context

The SPA and API currently use `/api/...` paths. Adding a superficial `/api/v1`
alias would interact incorrectly with the refresh cookie's `/api/auth` path and
could conceal hard-coded client URLs. Consumers still need a stable contract and a
controlled path for breaking changes.

## Decision

- Treat the unversioned `/api` surface as the v1 compatibility line.
- Publish an OpenAPI 3.1 document at `/api/openapi.json` and a CSP-safe index at
  `/api/docs`.
- Permit backward-compatible additions within this line; do not remove fields,
  success statuses, operations, or make request fields required without a major
  contract change.
- Introduce a real `/api/v2` router and coexistence window for a breaking change.
- Update route validation, OpenAPI, client, contract fixture, tests, observability,
  CORS, and cookie scope together.

## Consequences

- URL shape alone does not advertise `v1`; release notes and the contract do.
- Contract snapshots prevent common accidental removals but do not prove full
  behavioral compatibility.
- Deprecation needs a replacement and removal date before code is removed.

## Evidence

- [API versioning policy](../api-versioning.md)
- `server/src/openapi/openapi.document.js`
- `server/src/openapi/openapi.routes.js`
- `server/test/openapi.test.js`
- `server/test/fixtures/openapi-v1-baseline.txt`
