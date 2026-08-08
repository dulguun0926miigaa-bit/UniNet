# Logging, audit, and evidence handling

UniNet has two distinct evidence channels: structured operational logs and
database-backed domain audit records. Neither is currently exported to immutable
production storage.

## Structured request logs

`server/src/observability/logger.js` emits one-line JSON to standard output. Request
middleware records:

- timestamp, level, service, environment, and event;
- accepted/generated request ID (`X-Request-Id` response header);
- HTTP method, normalized route, status, and duration;
- authenticated actor ID and tenant ID when available.

Routes strip query/fragment values; UUID-like path segments become `:id`, emails and
oversized segments are redacted. The logger recursively replaces sensitive/PII key
names (including authorization, cookies, passwords, secrets, tokens, email, phone,
names, addresses, and IP fields), truncates long values/arrays, and bounds recursion.
It deliberately does not log request bodies.

Unhandled errors log sanitized Error name/code, not a stack or message in normal
JSON output. Clients receive a stable error code, safe message, and request ID.

## Database AuditLog

Current domain actions include many content lifecycle, application, partnership,
user/university status, event attendance, membership invitation/status/permission,
survey lifecycle/submission/export, consent, and account request events. Records may
include actor, university, action, resource, before/after JSON, severity, IP, user
agent, and timestamp.

Coverage is not complete. Login success/failure, reset lifecycle, refresh reuse,
logout, secret/MFA changes, every export/read of sensitive data, and all platform
high-risk actions need a reviewed event catalogue and tests.

`AuditLog` is an ordinary table: a sufficiently privileged database role can update
or delete rows. The immutability trigger on published `PolicyDocument` does not
protect `AuditLog`. Do not label the audit trail tamper-proof or append-only.

## Production sink requirements

Before launch, configure a centralized sink with:

1. encrypted transport and storage;
2. service identity write permission without delete permission;
3. separate, reviewed access for security/support roles;
4. tenant-aware search/export authorization where audit data is exposed in-app;
5. retention and legal-hold policies approved by privacy/security owners;
6. integrity controls such as immutable/WORM archive or signed export;
7. alerts for ingestion gaps, unexpected volume, and redaction regression;
8. documented clock synchronization and searchable request ID.

No vendor, sink, retention job, alert rule, or WORM archive is configured in this
repository.

## Proposed retention classification

These are starting points requiring legal and operational approval:

| Class | Examples | Suggested online retention | Notes |
| --- | --- | --- | --- |
| Security access | login failure, refresh replay, role/status change | 180–365 days | minimize direct identifiers; legal-hold capable |
| High-risk domain audit | approval, export, consent, deletion, university status | 1–3 years | jurisdiction/university contract may require more/less |
| Operational request log | route/status/duration/request ID | 30–90 days | sampled/aggregated metrics may live longer |
| Debug data | temporary diagnostic detail | 7–14 days | disabled or tightly controlled in production |

Do not implement retention by editing application constants alone. Configure and
test database/log provider lifecycle rules, export holds, and deletion evidence.

## Investigation procedure

1. Start from client-visible request ID and UTC time window.
2. Query operational logs by request ID; identify actor/tenant/action/status without
   expanding redacted fields.
3. Correlate with `AuditLog` resource ID and status history tables.
4. Limit exports to the incident's scope; encrypt and record custody/access.
5. Never copy bearer/cookie/reset/invitation tokens into notes.
6. Record gaps or conflicts explicitly—absence of an event is not proof an action
   did not occur.
7. Follow [incident response](incident-response.md) for suspected compromise.

## Review checklist

- Add a test whenever the sensitive-key catalogue or event schema changes.
- Ensure new URL/query/path fields cannot disclose secrets through request logging.
- Pair high-risk mutations with audit creation in the same transaction where
  possible.
- Capture reason for privileged destructive or rejection actions.
- Avoid full profile, CV, survey answer, token, or password values in before/after
  JSON.
- Alert on redaction token disappearance, logger failure, audit write failure, and
  security event patterns once a production monitoring platform exists.
