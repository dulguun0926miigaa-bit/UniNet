# University onboarding and domain verification

The platform can create a university with a unique, primary **unverified** domain,
change university status, and invite a University Admin only when the domain is
already active/verified. There is no domain-claim/challenge API or Admin UI today.
Therefore a newly created university cannot complete this runbook solely through
supported production APIs; domain verification remains a launch blocker.

Do not work around this gap with an unreviewed seed or direct production SQL.

## Roles

- Platform operations owner: creates/suspends tenant and initiates verification.
- University authoritative contact: proves institutional authority and controls DNS.
- Security reviewer: verifies challenge independently and checks lookalike/domain risk.
- Platform Super Admin: performs approved platform API actions.
- University Admin: accepts a single-use invitation after verification.

One person should not request, verify, and activate the same tenant.

## Intake

Collect in a restricted case record:

- legal and display name, short name, slug, public website, country/jurisdiction;
- official domain(s), desired primary domain, subdomain policy;
- authoritative administrative and security contacts verified through an independent
  public channel;
- data-controller/processor roles, contract, privacy/security requirements;
- expected users/roles, roster source, retention/residency, support/escalation;
- approvers, ticket ID, dates, evidence expiry and re-verification schedule.

Check duplicates/lookalikes, sanctions/eligibility where applicable, existing domain
ownership, and whether a parent domain could incorrectly authorize unrelated units.

## Create pending tenant

Platform Super Admin submits `POST /api/operations/universities` with idempotency key,
unique name/shortName/slug/domain, and `PENDING` status. The implementation creates a
primary active but unverified domain and a high-severity audit record.

Confirm no user becomes associated through the domain while it is unverified.

## Domain proof design

The missing domain-verification feature should implement:

1. Generate a cryptographically random, single-use, expiring claim token and store
   only its hash plus requester/reviewer/expiry/status.
2. Ask the university to publish a DNS TXT record at an agreed host such as
   `_uninet-verification.<domain>` with a scoped value containing no secret usable
   for login.
3. Resolve authoritative DNS through at least two independent resolvers after TTL;
   protect the verifier from SSRF/DNS rebinding and normalize only supported ASCII/
   IDNA form.
4. Require a second authorized reviewer to compare case, tenant, domain, challenge,
   authoritative contact, and DNS answer.
5. Atomically mark the exact domain verified, consume the challenge, and create an
   AuditLog with reason/evidence reference—not the raw token.
6. Recheck before primary-domain change, after DNS/ownership incident, and on an
   approved periodic schedule.

Email to an address on the domain alone is not strong proof of institutional domain
ownership. An approved administrative process may supplement DNS when DNS change is
impossible, but must have equivalent independent evidence and review.

## Invite University Admin

After the domain is verified and active, Platform Super Admin creates a
`UNIVERSITY_ADMIN` invitation for an address on that exact domain. The opaque token
is hashed, expiring, single-use, and email-delivered. Verify acceptance creates the
correct role/profile/tenant, then require password change/MFA when those controls are
available. Public registration cannot grant privileged roles.

## Activation gate

Before changing University to `ACTIVE`, record:

- [ ] domain verification feature/evidence and independent reviewer;
- [ ] contract/privacy/security contacts and data purpose approved;
- [ ] University Admin accepted and least-privilege access tested;
- [ ] tenant allow/deny tests and content visibility defaults verified;
- [ ] roster process approved (CSV import is not implemented today);
- [ ] retention, incident, support, and offboarding contacts recorded;
- [ ] email delivery and audit/log visibility tested;
- [ ] production backup/restore and platform controls approved.

Activate via the audited platform status endpoint only after all gates. Suspending or
inactivating a university revokes its active user sessions in the current status
workflow.

## Domain change/removal

1. Treat add/verify/primary/remove as high-risk, reauthenticated, reasoned, audited
   changes with dual review.
2. Verify the new domain before making it primary.
3. Inventory affected Users, invitations, roster entries, login/recovery paths, and
   email uniqueness; never strand Admin access.
4. Stop new association on the old domain, provide an approved transition, then
   deactivate rather than immediately delete evidence.
5. Alert on unexpected DNS loss/change and review sessions/accounts created during
   the risk window.

These mutation/audit APIs are not implemented yet.

## Offboarding

Suspend first to revoke access, preserve required evidence, coordinate exports/
deletion/legal holds, end partnerships, stop publication and invitations, remove
secrets/integrations, then inactivate under an approved retention plan. Do not delete
a University row while restricted relations or legal evidence remain.

## Evidence

Attach case ID, requester/reviewers, timestamps, legal entity/contact validation,
domain/challenge metadata, DNS answers and resolver/time (without reusable token),
API request ID/audit ID, invitation/acceptance, activation smoke tests, and next
review date. No production domain-verification evidence currently exists.
