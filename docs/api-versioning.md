# UniNet API contract and versioning

The machine-readable OpenAPI 3.1 contract is served at `GET /api/openapi.json`.
A dependency-free endpoint index is available at `GET /api/docs`. The index contains
no JavaScript, inline CSS, forms, or remote assets, so the API's restrictive Content
Security Policy remains effective.

The current document contains all 83 declared HTTP operations, including private
`/api/files` upload/list/download/delete routes. Multipart upload bodies, authenticated
binary downloads, query filters, response envelopes, and error responses are part of
the checked contract.

## Current compatibility line

The current unversioned `/api` base path is the v1 compatibility line. The OpenAPI
`info.version` value follows semantic versioning for the contract itself:

- patch: documentation fixes that do not change runtime behavior;
- minor: backward-compatible additions, such as an optional field or a new endpoint;
- major: a breaking request or response change.

Within v1, existing request fields, response fields, status codes, and documented
semantics are not removed or changed incompatibly. Consumers must tolerate new
optional response fields. New required request fields are a breaking change.

## Deprecation and breaking changes

A deprecated operation or field is marked with OpenAPI `deprecated: true` and kept
for at least one documented migration window. A breaking release will use a new base
path such as `/api/v2`; v1 and v2 will coexist during that window. Release notes must
identify the replacement and removal date before v1 is retired.

There is intentionally no `/api/v1` alias today. Mounting the same routers under two
paths would make the refresh cookie (currently scoped to `/api/auth`) behave
differently at the alias and could conceal hard-coded client paths. The stable
unversioned path remains the supported v1 URL until a deliberate versioned-router
migration updates cookie scope, CORS tests, clients, and observability together.

## Contract change workflow

1. Update route validation and the OpenAPI document in the same change.
2. Add or update contract and integration tests. The checked-in
   `server/test/fixtures/openapi-v1-baseline.txt` baseline rejects removed operations,
   changed security, removed success statuses, and newly required request fields.
3. Run `npm run lint`, `npm run type-check`, and `npm test`.
4. For a breaking change, introduce `/api/v2` and publish a migration note rather
   than silently changing the v1 behavior.
