# Dependency and emergency patch runbook

UniNet commits `package-lock.json`, pins Node/npm, uses exact versions for Prisma and
Nodemailer, full commit SHAs for GitHub Actions, weekly Dependabot, pull-request
dependency review, gitleaks, and `npm audit --audit-level=moderate` in CI.

## Remediation SLA

The clock starts when a reachable issue is confirmed or an authoritative advisory
is published, whichever is earlier.

| Severity and reachability | Target |
| --- | --- |
| Critical, exploited, or credential/integrity compromise | contain immediately; patch/mitigate within 24 hours |
| High and reachable | 7 calendar days |
| Moderate and reachable | 30 calendar days |
| Low or demonstrated unreachable | next planned maintenance, at most 90 days |

An exception requires security owner, rationale, compensating controls, expiry, and
a tracking item. CVSS alone does not determine reachability or tenant/data impact.

## Routine update

1. Read upstream release notes, advisory, Node/Prisma compatibility, licenses, and
   transitive diff.
2. Create one coherent update group; avoid unrelated application changes.
3. Update with npm intentionally and review both manifests:

   ```powershell
   npm install <package>@<version>
   npm ls <package>
   npm explain <package>
   ```

4. For Prisma, review migration/client behavior and run a clean PostgreSQL migration
   chain. For auth/crypto/HTTP/parser packages, add focused security regression tests.
5. Run:

   ```powershell
   npm run ci:quality
   npm run security:audit
   npm run docker:config
   ```

6. Review install scripts, unexpected packages, package source/integrity, bundle
   size, Docker image packages, and OpenAPI compatibility.
7. Deploy through canary and monitor; record the dependency diff in the changelog.

## Overrides

An npm `overrides` entry is temporary risk treatment, not proof of compatibility.
Record advisory, dependency path, selected version, test evidence, upstream removal
plan, owner, and review date. Remove it once direct/upstream constraints are fixed.

## GitHub Actions and container images

- Resolve an Action release tag to the reviewed full commit SHA and keep a comment
  with the human version. Review code/permissions before updating.
- Pin production image dependencies by digest and use a trusted registry policy.
  Current Docker/Compose tags are not digest-pinned.
- Rebuild and scan final runtime images; JavaScript `npm audit` does not cover OS
  packages or base-image provenance.

## Emergency patch

1. Open a security incident/change and determine affected/reachable versions,
   exploitation, data/tenant scope, and available fixed version/mitigation.
2. Freeze unrelated releases; contain exposed functionality or credentials if needed.
3. Patch the smallest coherent dependency set, preserve lockfile reproducibility,
   and add a regression/reachability test.
4. Run full quality/security gates unless incident commander explicitly documents
   a skipped gate and compensating validation.
5. Build a new immutable artifact, canary, monitor the vulnerable path, and verify the
   old artifact is no longer serving.
6. Rotate credentials and investigate if the advisory permits exfiltration/RCE.
7. Publish a sanitized advisory/release note and complete root-cause follow-up.

## Rollback

Revert package and lockfile together to the last reviewed state, rebuild a new
artifact, and follow [deployment rollback](deployment-rollback.md). Do not rollback
to a known exploitable version without incident commander/security owner acceptance
and an effective compensating control.

## Supply-chain gaps

SBOM generation/archive, artifact/container signing, provenance, image digest
pinning, npm registry/namespace allowlisting, and production admission policy are
not implemented. Dependency review and audit do not replace these controls.
