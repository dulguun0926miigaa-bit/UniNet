# UniNet documentation

This index separates implemented repository behavior from procedures that still
require production infrastructure or human approval.

## Design and contracts

- [Architecture](architecture.md) — system context, containers, components, data
  flows, and module boundaries
- [Data model](data-model.md) — conceptual ERD, ownership, deletion behavior, and
  database invariants
- [Authorization](authorization.md) — role/permission matrix, tenant scoping, and
  content visibility
- [Architecture Decision Records](adr/README.md)
- [API contract and versioning](api-versioning.md)

## Security, privacy, and operations

- [Threat model](security/threat-model.md)
- [Secrets and configuration](security/secrets-and-configuration.md)
- [Logging and audit](security/logging-and-audit.md)
- [Incident response](security/incident-response.md)
- [Privacy, retention, and deletion](privacy-retention.md)
- [Runbook index](runbooks/README.md)

## Engineering workflow

- [Local development](development.md)
- [Testing strategy](testing.md)
- [Release process](releasing.md)
- [Contributing](../CONTRIBUTING.md)
- [Changelog](../CHANGELOG.md)
- [Security reporting](../SECURITY.md)

## Evidence vocabulary

Documentation uses these terms consistently:

- **Implemented** — present in repository code and testable locally.
- **Configured locally** — present in Docker Compose or `.env.example`; this is not
  evidence of a production control.
- **Procedure** — an operator can follow the documented steps, but no successful
  production execution is claimed.
- **Pending evidence** — provider configuration, approval, a drill result, or an
  artifact must be attached before the control is considered operational.

The source of truth for runtime behavior is the code and migrations. If a document
and implementation disagree, treat the implementation as a defect or update the
document in the same change.
- [Final MVP security evidence map](security/asvs-mvp-evidence.md)
