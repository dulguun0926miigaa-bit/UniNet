# Dependency registry and namespace policy

UniNet currently consumes public npm packages only from the explicit HTTPS npm registry in `.npmrc`. Private package namespaces are not used.

Before introducing a private package, the team must:

1. reserve an organization-scoped package name such as `@uninet/*`;
2. map that scope to the approved private registry in CI and developer `.npmrc`;
3. require registry authentication through the secret store, never committed tokens;
4. publish provenance and verify package source before promotion;
5. block an unscoped public package with the same internal name.

`npm ci`, the committed lockfile, exact dependency saving, the license gate, the vulnerability gate, and the generated SBOM are required release checks.
