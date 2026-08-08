# Operations runbooks

| Runbook | Use |
| --- | --- |
| [Migrations](migrations.md) | review, deploy, forward-fix, and zero-downtime database changes |
| [Backup and restore](backup-restore.md) | backup policy requirements, isolated restore, PITR, and drill evidence |
| [Deployment and rollback](deployment-rollback.md) | build/promote/release, health validation, and rollback |
| [Dependency updates](dependency-updates.md) | routine and emergency dependency/Action/image patching |
| [University onboarding](university-onboarding.md) | tenant creation, domain proof, Admin invitation, activation, suspension |

Also see [incident response](../security/incident-response.md),
[secrets/configuration](../security/secrets-and-configuration.md), and
[release process](../releasing.md).

These runbooks are provider-neutral because no production platform is committed.
Commands marked **example** or **pending execution** must be adapted, peer-reviewed,
and recorded in the change/incident system. Their presence is not evidence that a
backup, restore, migration, deployment, rollback, or incident drill succeeded.
