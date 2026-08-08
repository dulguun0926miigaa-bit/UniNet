# ADR-0002: Multi-tenancy and role-based authorization

- Status: Accepted
- Date: 2026-07-27

## Context

UniNet stores multiple universities in one database. Private university data must
not leak across tenants, while network and partner content intentionally crosses
tenant boundaries. Roles alone are insufficient: Staff capabilities vary by
permission and many resources carry a university ID.

## Decision

- Use a shared PostgreSQL schema with `universityId` ownership on tenant records.
- Authenticate against both JWT and live Session/User state.
- Apply server role checks, Staff permission checks, tenant query predicates, and
  post-fetch tenant assertions. Frontend guards are navigation only.
- Model cross-tenant content explicitly with `ContentVisibility` and active
  `Partnership` records.
- Permit Platform Super Admin cross-tenant access only in endpoints that explicitly
  authorize the role.
- Do not enable PostgreSQL row-level security (RLS) yet. Current modules do not have
  a shared database session variable or centralized tenant-policy layer, so adding
  partial RLS now could produce inconsistent coverage and false assurance.

## RLS revisit criteria

Re-evaluate and write a superseding ADR before production handling of high-volume
real Student data, or when any of these occurs:

- more than one API/service directly accesses the database;
- ad-hoc reporting or support tools receive database credentials;
- tenant query-policy helpers are centralized and cross-tenant integration tests
  can run against real PostgreSQL;
- a database role strategy can separate platform operations, migrations, and
  tenant requests without bypassing policies by default.

An RLS proof must cover nullable/global tenant rows, Platform Super Admin access,
partnership visibility, background jobs, migrations, and connection-pool context
reset. Until then, application checks plus deny-path tests are mandatory.

## Consequences

- A missing predicate can create a cross-tenant vulnerability. Code review and
  negative integration tests are essential.
- The single schema simplifies network-wide content and operations but increases
  blast radius of database credentials.
- Platform actions require stronger controls; step-up authentication, dual approval,
  and complete security audit events are not yet implemented.

## Evidence

- `server/src/middleware/authenticate.js`
- `server/src/student/student.routes.js`
- `server/src/operations/operations.routes.js`
- `server/src/memberships/membership.service.js`
- [Authorization rules](../authorization.md)
- cross-role middleware and membership service tests under `server/test/`
