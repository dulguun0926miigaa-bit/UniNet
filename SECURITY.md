# Security policy

## Supported versions

UniNet has no tagged production release. No version is currently represented as
production-supported or independently security-certified.

## Report a vulnerability privately

Do not disclose a suspected vulnerability, token, credential, exploit, tenant name,
or personal data in a public issue, discussion, pull request, or shared screenshot.

Use the private GitHub Security Advisory form for the authoritative repository when
it is enabled. If it is unavailable, contact the project owner through the private
security channel listed in that environment's deployment inventory. A monitored
security email/channel has not been committed or verified in this workspace; the
owner must publish and test one before production launch.

If no private channel can be verified, send only a request for secure contact—not
exploit details—to the repository owner through an existing private project channel.

Include:

- affected commit/version, environment, route/component, role and tenant conditions;
- impact and data classes without including real records;
- minimal reproduction using synthetic data;
- request IDs/timestamps and relevant safe logs;
- whether exploitation or public disclosure is known;
- suggested mitigation, if available;
- a safe method to exchange encrypted evidence.

## Handling targets

Proposed targets after a monitored contact/on-call team is configured are:

- acknowledge within two business days;
- triage/severity within five business days;
- provide status at an agreed cadence;
- coordinate remediation and disclosure based on impact.

These are readiness targets, not a current response guarantee. Critical active abuse
should invoke the [incident response runbook](docs/security/incident-response.md).

## Research safety

- Use your own synthetic accounts and university fixtures.
- Do not access, modify, download, retain, or share another person's/tenant's data.
- Do not perform denial of service, credential attacks, social engineering,
  persistence, malware upload beyond an isolated harmless test, or third-party
  provider testing without written authorization.
- Stop when sensitive data or cross-tenant access is encountered and report privately.
- Delete local evidence after the team confirms secure receipt and retention needs.

This project does not make a legal safe-harbor promise. Testing must stay within
explicit authorization and applicable law.

## Coordinated disclosure

The reporter and project security owner should agree on remediation, validation,
affected versions, user/university notification, credit, and disclosure date. The
team may request delay for active exploitation or personal-data notification duties,
but will not ask a reporter to conceal unresolved risk indefinitely.

Public advisories must omit reusable exploit secrets and personal data. Dependency
issues should also be reported to the upstream maintainer through its security
process when safe and authorized.

## Security design references

- [Threat model](docs/security/threat-model.md)
- [Secrets and rotation](docs/security/secrets-and-configuration.md)
- [Logging and audit](docs/security/logging-and-audit.md)
- [Incident response](docs/security/incident-response.md)
