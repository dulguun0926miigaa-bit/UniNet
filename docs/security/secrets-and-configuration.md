# Environment, secrets, and rotation

`.env.example` documents names and local-safe placeholders. A production `.env`
file is not a secret-management strategy. Inject production values from a managed
secret store with workload identity and audit logging; never commit, bake, print,
or place them in frontend `VITE_*` variables.

## Environment matrix

| Variable | Development/test | Production requirement | Secret |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` / `test` | `production` | No |
| `PORT` | `4000` | platform-assigned positive port | No |
| `DATABASE_URL` | local PostgreSQL allowed | non-local PostgreSQL with `sslmode=require`, `verify-ca`, or `verify-full` | Yes |
| `JWT_ACCESS_SECRET` | unique 32+ characters | secret manager, non-placeholder, distinct | Yes |
| `JWT_REFRESH_SECRET` | unique 32+ characters | secret manager, distinct from access/ticket keys | Yes |
| `TICKET_SIGNING_SECRET` | optional; falls back to access secret locally | required, independent 32+ characters | Yes |
| `JWT_ACCESS_EXPIRES_IN` | default `15m` | approved short duration | No |
| `JWT_REFRESH_EXPIRES_IN` | example `7d`; code default `30d` if omitted | approved duration aligned with session policy | No |
| `PASSWORD_RESET_TOKEN_EXPIRES_IN` | example `1h` | short approved `m`/`h`/`d` duration | No |
| `INVITATION_TOKEN_EXPIRES_IN` | example `72h` | approved duration | No |
| `APP_URL` | local HTTP allowed | explicit HTTPS origin | No |
| `CORS_ORIGINS` | comma-separated local origins | explicit HTTPS origins; wildcard rejected | No |
| `EMAIL_DELIVERY_MODE` | `console`, `smtp`, or `disabled` | `smtp` or deliberately `disabled`; console rejected | No |
| `EMAIL_FROM` | local address | verified provider sender | No |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Mailpit or provider | approved SMTP endpoint/TLS mode | Host: No |
| `SMTP_USER`, `SMTP_PASSWORD` | local placeholders | secret manager | Yes |
| `TRUST_PROXY` | `false` by default | exact positive hop count only after topology validation | No |
| `REDIS_URL` | local Redis may be listed | currently not consumed by application code; design before production use | Yes when credentialed |
| `FILE_STORAGE_PROVIDER` | `s3` | `s3` | No |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | local MinIO permitted | approved HTTPS private bucket endpoint/region/name | Bucket metadata: No |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | local-only values | secret manager/workload identity adapter; non-placeholder | Yes |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO | provider-specific, tested | No |
| `FILE_CV_MAX_BYTES`, `FILE_AVATAR_MAX_BYTES` | 5 MiB / 2 MiB defaults | approved bounded values within schema caps | No |
| `CLAMAV_MODE` | `disabled` or `clamd` | `clamd` required | No |
| `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_TIMEOUT_MS` | local ClamAV | private scanner endpoint and tested timeout | Host: No |
| `SEED_*` | opt-in local fixtures | both seed flags `false`; do not provision privileged production users | Password: Yes |
| `VITE_API_URL` | local API URL | public API base URL fixed at frontend build time | No; frontend-exposed |

Production validation rejects console email, placeholder/equal JWT secrets, a
missing/deduplicated ticket key, localhost/non-TLS database URLs, non-HTTPS app/CORS
origins, wildcard CORS, insecure S3 endpoint/local credentials, disabled malware
scanner, and invalid proxy configuration. Startup validation does not prove a
provider, bucket policy, scanner signatures, or encryption is correctly secured.

## Secret generation

Generate each development secret independently; never reuse command output:

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(48).toString('base64url'))"
```

In production, prefer provider-generated values and direct secret injection so the
value never enters shell history or a ticket. Record owner, purpose, creation time,
last rotation, next rotation, affected services, and revocation procedure as secret
metadata—never the value.

## Rotation policy

The exact schedule requires a security owner and provider policy. Until approved,
rotate immediately on suspected exposure, personnel/access boundary change, or
provider advisory. A suggested maximum is 90 days for application/SMTP credentials
and shorter where the provider supports automated rotation.

### JWT access secret

Current HS256 verification accepts one key and has no `kid` overlap. Rotation makes
all old access JWTs invalid (normally at most the configured access lifetime):

1. Announce a maintenance/risk window and verify refresh/session health.
2. Create a new independent value in the secret manager.
3. Deploy all API replicas with the new access key without changing refresh key.
4. Confirm `/api/ready`, login, refresh, and authenticated requests.
5. Revoke/remove the old secret version after the rollback window.

Implement a versioned verification key ring and `kid` before claiming
zero-downtime signing-key rotation.

### JWT refresh secret

Changing the refresh secret invalidates every existing refresh cookie. Because old
database sessions remain otherwise active, treat rotation as a forced logout:

1. Confirm incident/change approval and capture a database backup checkpoint.
2. Revoke all active Session rows through a reviewed administrative migration or
   one-time operation; do not paste ad-hoc production SQL without peer review.
3. Deploy the new refresh secret to all replicas together.
4. Verify old refresh cookies fail, new login creates a family, rotation succeeds,
   and replay is rejected.
5. Remove the previous secret and notify users of forced reauthentication.

### QR ticket signing secret

There is no multi-key ticket verifier. Rotation invalidates outstanding QR tokens;
Students can request new tickets from authoritative registrations. Coordinate with
event operators, rotate, deploy all scanners/API replicas, and test issue/scan/
tamper/expiry before removing the old version.

### Database, object storage, and SMTP credentials

1. Create a second least-privilege credential in the provider.
2. Test connectivity from a non-production workload without logging the URL.
3. Update the secret reference and perform a rolling API restart.
4. Verify readiness and the relevant workflow (database transaction, quarantined
   clean-file upload/download/delete, or email).
5. Revoke the old credential and inspect provider access logs.

## Compromise recovery and zeroization

1. Follow [incident response](incident-response.md); assume leaked secrets were used.
2. Revoke affected sessions/tokens/credentials before or while deploying replacements.
3. Search code history, CI logs/artifacts, issue trackers, shell transcripts, images,
   and log sinks for copies; do not echo values during the search.
4. Rotate downstream credentials reachable with the exposed secret and review audit
   logs for its full possible lifetime.
5. Delete old secret versions after evidence-preservation and rollback needs expire.
6. Clear temporary files, environment exports, clipboard managers, build caches, and
   CI artifacts according to platform capability; record what could not be erased.
7. Add a regression control and incident timeline.

## Access and change controls

- Separate developer, CI, staging, and production credentials.
- Grant the API database role only required DML; keep schema migration credentials
  in a separate controlled job.
- Restrict secret read access to the workload and a small break-glass group.
- Require peer review for secret reference, proxy, CORS, TLS, email sender, and
  database endpoint changes.
- Run gitleaks/secret scanning and dependency review, but treat them as detection,
  not permission to commit test secrets that resemble production values.

The current S3 adapter takes static access/secret keys. Adopting provider workload
identity requires changing that adapter; do not insert short-lived credentials into
frontend configuration.

Provider integration, KMS/HSM use, automated rotation, and rotation-drill evidence
are **pending**; this document is a procedure, not proof they occurred.
