# Incident response runbook

This is an executable procedure template, not evidence of a staffed on-call team or
a completed incident drill. Before production, assign named primary/backup incident
commander, security lead, operations lead, privacy/legal contact, university liaison,
and communications owner in a restricted operations system.

## Severity

| Severity | Examples | Initial response target* |
| --- | --- | --- |
| SEV-1 Critical | confirmed cross-tenant disclosure, privileged takeover, signing/database secret compromise, destructive data loss, broad outage | 15 minutes |
| SEV-2 High | likely compromise with limited scope, broken auth/authorization, failed production restore, major degraded service | 30 minutes |
| SEV-3 Medium | contained abuse, exploitable issue with no known use, partial non-critical failure | 4 business hours |
| SEV-4 Low | hardening issue, low-impact bug, documentation/config drift | planned queue |

\*Targets are proposed until an on-call agreement is approved. The repository does
not provide paging or enforce these targets.

## First 15 minutes

1. Open a restricted incident record and assign an incident commander.
2. Record UTC detection time, reporter, symptoms, affected environment, request IDs,
   tenant(s), suspected data classes, and current hypotheses.
3. Preserve logs/audit/provider events and snapshot volatile evidence without
   copying secrets into the incident record.
4. Select containment that minimizes further harm: disable a route/feature, suspend
   a user/university, revoke sessions/credentials, scale or isolate a workload, or
   block an origin/IP at the edge.
5. Establish a private communications channel and update cadence.
6. Notify privacy/legal and affected university liaison immediately for suspected
   personal-data or cross-tenant exposure; they determine regulatory notices.

Do not destroy evidence, run unreviewed database writes, publicly identify affected
users, or rotate a key without understanding which sessions/tickets/services it
will invalidate.

## Response phases

### Triage

- Validate the alert from at least two signals where possible.
- Determine confidentiality, integrity, availability, tenants, roles, records, and
  time range.
- Use request IDs to correlate structured logs, domain audit, status histories, CI,
  database, SMTP, and edge/provider logs.
- Mark facts, assumptions, unknowns, and decisions separately.

### Contain

- Prefer reversible containment, but prioritize stopping active disclosure or
  destructive access.
- Revoke compromised User sessions; suspend account/university only with impact
  understood.
- For leaked secrets, follow the
  [rotation and compromise procedure](secrets-and-configuration.md).
- For a vulnerable release, follow [deployment rollback](../runbooks/deployment-rollback.md).

### Eradicate and recover

- Remove the root cause, add regression tests, scan adjacent paths, and review
  persistence mechanisms.
- Apply migrations through the reviewed forward-fix process.
- Restore data only through the [backup/restore runbook](../runbooks/backup-restore.md)
  and reconcile writes after the restore point.
- Verify auth, tenant isolation, liveness/readiness, critical workflows, audit/log
  delivery, and notification/email behavior before reopening.
- Monitor at elevated sensitivity for at least one complete token/job/business cycle.

### Notify and learn

- Privacy/legal determines affected-party and regulator notice content/deadlines.
- Communications must state confirmed facts, user actions, and next update time;
  avoid unsupported attribution.
- Complete a blameless post-incident review within five business days for SEV-1/2.
- Track each corrective action with owner, due date, verification, and risk if late.

## Focused playbooks

### Cross-tenant data exposure

1. Disable the route or permission path and preserve relevant application/database
   logs.
2. Identify source and destination tenants, resource IDs, actors, exports, and time
   window. Do not broaden analyst access unnecessarily.
3. Test other roles/resources for the same missing scope check.
4. Notify privacy/legal and both university liaisons through approved channels.
5. Patch with a tenant assertion plus allow/deny PostgreSQL integration tests.

### Session or signing-key compromise

1. Determine access, refresh, QR ticket, invitation/reset, or multiple token classes.
2. Revoke affected session families/users or all sessions as scope demands.
3. Rotate the exact key/credential; remember the current single-key JWT/ticket
   implementation has no overlap and may force logout/reissue.
4. Search for replay, role/status changes, exports, or cross-tenant access across the
   maximum credential lifetime.

### Database corruption or loss

1. Stop nonessential writes and capture database/provider state.
2. Determine whether corruption is logical, migration-related, credential abuse, or
   infrastructure failure.
3. Select a verified recovery point and restore into an isolated target first.
4. Validate migrations, constraints, tenant counts, critical samples, and checksums.
5. Obtain incident commander/data owner approval before cutover.

### Vulnerable dependency or build compromise

1. Freeze releases and preserve lockfile, artifact digest, CI run, dependency graph,
   and registry advisory.
2. Identify affected versions and reachable code paths; do not rely only on CVSS.
3. Remove/upgrade/pin, run full quality/audit tests, rebuild from a trusted clean
   environment, and rotate any build/runtime credentials exposed.
4. Verify deployed artifact identity and inspect for malicious lifecycle scripts or
   unexpected outbound connections.

### Availability attack

1. Identify edge, API, database, SMTP, or dependency bottleneck.
2. Apply edge/distributed throttling or temporarily disable expensive exports;
   current in-process rate limiting does not coordinate replicas.
3. Preserve legitimate critical flows and readiness behavior.
4. Load-test corrected thresholds before making temporary limits permanent.

## Communication template

```text
Incident: <restricted identifier>  Severity: <SEV-N>
UTC status time: <timestamp>
Confirmed impact: <facts only>
Affected tenants/data/functions: <scope or unknown>
Containment: <completed/in progress>
User action required: <none or exact action>
Next update: <UTC timestamp>
Incident commander: <internal contact>
```

## Post-incident record

- timeline with source for each timestamp;
- root cause and contributing conditions;
- exact affected identities/tenants/data and confidence level;
- detection and containment effectiveness;
- recovery validation and data reconciliation;
- notification/legal decisions;
- what went well/poorly;
- corrective actions, owners, due dates, tests, and long-term risk acceptance.

## Readiness gaps

Production launch remains pending until contact paths, paging, log/metric alerts,
provider escalation, university liaison list, secure evidence store, and at least one
tabletop plus technical rollback/restore drill are configured and recorded.
