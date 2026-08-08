# Privacy, retention, and account lifecycle

This is an engineering data-handling specification, not legal advice or a claim of
regulatory compliance. A privacy/legal owner and each participating university must
approve purposes, lawful bases, notices, processors, retention, and request handling
before real personal data is used.

## Data inventory

| Category | Examples | Primary purpose |
| --- | --- | --- |
| Account identity | email, role, university, status, profile names/contact | authenticate and provide a university workspace |
| University membership | Student/employee IDs, department, major, enrollment | establish eligibility and tenant role |
| Opportunity activity | saves, registrations, waitlist, attendance, applications, CV URL | deliver event/career/research functions |
| Survey data | response answers and schema version | university/network research and reports |
| Preferences | notification, privacy, appearance, locale, accessibility | personalize service behavior |
| Consent/policy | document version/checksum, recipient, purpose, fields, action | evidence notice/acceptance and controlled sharing |
| Security/operations | session device/IP/user agent, request/audit records | prevent abuse, investigate, and operate service |
| Support | feedback category, subject, message | respond to requests and improve service |
| Private files | CV and avatar binary, filename/type/hash/scan evidence | profile and consented application workflows |

Do not place special-category or unnecessary personal data in free-text content,
survey questions/answers, cover notes, feedback, audit before/after JSON, or logs
without an approved purpose and protection plan.

## Data classification

| Class | UniNet examples | Handling baseline |
| --- | --- | --- |
| Public | approved public university metadata and intentionally `PUBLIC` catalogue text | integrity review; public cache only after publication rules |
| Internal | non-secret source/docs, aggregate operational metrics without identifiers | workforce/project access; do not assume public |
| Confidential | email/profile, tenant-private content, registrations, applications, survey responses, settings, notifications, feedback | authenticated least privilege, tenant scope, encrypted transport/storage provider, audited export |
| Restricted / sensitive | password/session/token material, signing/database/SMTP/S3 secrets, roster IDs, CV binaries, consent/legal-hold evidence, security IP/user-agent/audit detail | minimal privileged access, no general logs, strong encryption/key management, explicit purpose/retention, incident escalation |

Classification follows the most sensitive element in a combined record/export.
`PUBLIC` content visibility does not make its creator, participants, audit history, or
database row metadata public. Special-category data requires a separate approved
impact assessment and is not an implied UniNet use case.

## Implemented controls

- Registration requires current Terms and Privacy policy document IDs; acceptance is
  stored atomically with version/checksum/context.
- Published policy evidence fields are protected by a PostgreSQL immutability trigger;
  retire and publish a new version instead of editing history.
- Consent history records recipient, purpose, fields, resource context, grant/revoke,
  and supersession. A user may revoke an active consent through the API.
- Application and registration actions persist consent flags and resource context.
- Settings exposes JSON exports for personal settings/account summary, registration
  history, and application history, subject to authentication and read rate limits.
- Account deactivation immediately sets `DEACTIVATED`, records an audit/action row,
  and revokes sessions.
- Account deletion request records a default 30-day schedule or `ON_HOLD` when a
  legal hold extends beyond it; the request can be cancelled.

The exports are not a complete legal data-subject-access package: survey responses,
all audit/security records, notifications, feedback, invitation/roster sources, and
processor data may require separate authorized collection.

## Retention schedule

The application currently has no scheduled purge/anonymization worker. The table
below distinguishes implemented state from a proposed policy requiring approval and
automation.

| Record | Current behavior | Proposed trigger/retention |
| --- | --- | --- |
| Active User/profile/settings | retained while account exists | account lifetime plus approved closure window |
| Session | expiry/revocation retained in DB | purge after security investigation window, e.g. 90 days after expiry/revocation |
| Reset/invitation token | hashed, expiry/use/revoke retained | purge expired/used rows after short audit window |
| Registration/application/status history | retained until physical cascade/delete | university/legal purpose plus defined post-event/application period |
| Survey response | retained until Survey/User physical cascade/delete | declare per survey; block publication without retention metadata in future |
| Notification/feedback | retained indefinitely today | purge by age/status under approved operational schedule |
| Consent/policy acceptance | retained with User; policy document restricted | retain evidence for legal limitation period; minimize IP/user agent |
| AccountActionRequest | retained with User | retain outcome evidence after anonymization as legally approved |
| AuditLog | retained indefinitely today; mutable | approved security/legal period, immutable archive, access controls |
| IdempotencyRecord | has `expiresAt`, but no purge worker | delete promptly after expiry |
| FileAsset/object | soft-delete metadata; object delete best-effort; no cleanup worker | purpose/application retention, quarantine/orphan cleanup and bucket lifecycle |
| Database backup | not configured | provider lifecycle aligned to RPO and deletion obligations |

No suggested number is effective policy until owner, jurisdiction, university
contracts, and provider lifecycle configuration are recorded.

## Deactivation and deletion

```mermaid
stateDiagram-v2
  [*] --> ACTIVE
  ACTIVE --> DEACTIVATED: deactivate now; sessions revoked
  ACTIVE --> REQUESTED: deletion requested; default +30 days
  REQUESTED --> CANCELLED: user cancels before execution
  REQUESTED --> ON_HOLD: legal hold applies
  ON_HOLD --> REQUESTED: hold released and schedule recalculated
  REQUESTED --> COMPLETED: deletion/anonymization worker executes
```

Only request, cancellation, and immediate deactivation paths are implemented.
There is no worker that advances a deletion request to `COMPLETED`, applies a
retention map, anonymizes shared/history records, or proves downstream/backup expiry.

### Required deletion executor design

1. Lock and re-read the request, User status, schedule, and legal hold.
2. Produce a dry-run inventory by model, processor, tenant, and retention exception.
3. Revoke sessions/reset/invitation access and stop new processing.
4. Delete or irreversibly anonymize records in a reviewed transaction/order while
   preserving only legally required, minimized evidence.
5. Avoid cascading away evidence that must be retained; pseudonymize actor IDs where
   policy permits.
6. Record execution version/counts/checksums and mark the request completed without
   retaining unnecessary direct identifiers.
7. Notify processors/universities and track their confirmation.
8. Put the deleted identifier on a restricted restore-suppression ledger so an old
   backup restore cannot silently resurrect the account.
9. Test retries/idempotency, legal holds, partial failure, cancellation races, and
   restored backups.

## Backup deletion policy

Backups are not configured by this repository. A production policy must define:

- backup retention and immutable/legal-hold exceptions;
- whether deletion is applied inside backups or upon restore before reopening;
- encryption/key destruction and provider replica/snapshot lifecycle;
- restore-suppression ledger availability during disaster recovery;
- proof that expired backups and copies were destroyed by the provider.

See [backup and restore](runbooks/backup-restore.md). A written procedure is not
evidence of provider lifecycle enforcement.

## Access and sharing

- Private tenant data remains in the owning university; `PARTNERS` and `NETWORK`
  content use explicit server visibility rules.
- Student application/registration/consent records identify a recipient and purpose
  where the flow records sharing.
- Support and platform access must be least-privilege, time-bound, reasoned, and
  audited. A complete sensitive-read audit is not implemented.
- Do not export unrestricted CSV/JSON to personal devices. Encrypt approved exports,
  record custody, and delete working copies on schedule.

## Policy publication procedure

1. Legal/privacy supplies reviewed content, locale, version, effective/publish dates,
   required flag, and checksum.
2. Peer-review that the version is new; published rows cannot be edited/deleted.
3. Apply a reviewed migration/admin operation and verify current-policy API locale
   selection and checksum.
4. Update registration/settings UI and translations before the effective date.
5. Decide whether existing users must re-accept; implement/enforce that gate if so.
6. Retire the prior version only according to policy; never destroy its acceptances.

The baseline seeded policies are engineering placeholders and require legal review
and a new version before production use.

## Request handling

For access, correction, export, consent withdrawal, deactivation, or deletion:

1. authenticate the requester with a risk-appropriate method;
2. record scope, identity proof, deadline, jurisdiction, tenant contacts, and legal
   holds in a restricted case system;
3. gather only in-scope data from application and configured processors;
4. review third-party and other-person data before disclosure;
5. deliver through an authenticated encrypted channel;
6. record completion without copying the full disclosure into general logs;
7. escalate disputes or exceptions to privacy/legal.
