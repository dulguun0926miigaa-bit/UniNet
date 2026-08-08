# ADR-0005: Private object storage and quarantine

- Status: Accepted
- Date: 2026-07-27

## Context

Student CVs and avatars are untrusted binary input containing personal data. Public
URLs, extension-only checks, or serving a file before malware scanning would expose
users and operators. Database blobs would also complicate streaming and backup size.

## Decision

- Store binary data in a private S3-compatible bucket and metadata/authorization
  state in PostgreSQL `FileAsset`.
- Accept only Student CV PDF and avatar JPEG/PNG/WebP under purpose-specific size
  limits. Verify normalized filename, extension, detected magic-byte MIME, reject
  active/SVG-like content, and calculate SHA-256 server-side.
- Upload under a random quarantine key, scan the buffer with ClamAV, then copy to a
  random available key and delete quarantine. Production startup requires `clamd`,
  an HTTPS S3 endpoint, and non-local credentials.
- Fail closed on scan/storage errors. Only `AVAILABLE` + `CLEAN` objects can download.
- Authorize every download through the API by owner, platform role, same-tenant Admin,
  or Staff application-management permission and consent-linked application.
- Stream downloads as attachments with authoritative MIME, no-store/nosniff,
  same-origin resource policy, sandbox CSP, and digest. Do not expose direct public
  or presigned object URLs.
- Soft-delete database metadata first and best-effort delete the object; prevent CV
  deletion while referenced by an Application.

## Consequences

- Upload buffers are held in API memory but capped at 5 MiB for CV and 2 MiB for
  avatar by current defaults. Larger/other files need a separate streaming design.
- Database and object operations cannot share one transaction. Storage/scan/promotion
  failures can leave quarantined/orphan objects or metadata; a cleanup/reconciliation
  worker and lifecycle policy are not implemented.
- The local stack uses MinIO and ClamAV. Production bucket policy, workload identity,
  key management, versioning/lifecycle, scanning capacity/signature freshness,
  backup/restore, and regional residency are pending.
- The SDK currently receives access/secret key configuration. Provider workload
  identity is preferred but requires an adapter/config change.
- `ATTACHMENT` is reserved in the schema but intentionally has no upload policy.

## Alternatives considered

- Public object URLs — rejected because file authorization/withdrawn consent could
  not be reliably enforced.
- Database binary columns — rejected for current scale/streaming and database backup
  impact.
- Trust browser MIME/extension — rejected because both are attacker-controlled.
- Scanner bypass in production — rejected by environment validation; development
  may disable scanning only to enable isolated tests.

## Evidence

- `server/src/files/`
- `server/prisma/migrations/20260727125000_secure_file_assets/`
- `server/test/secure-files.test.js`
- `docker-compose.yml` local MinIO/ClamAV services
