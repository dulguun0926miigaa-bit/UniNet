# ADR-0001: Browser session tokens

- Status: Accepted
- Date: 2026-07-27

## Context

UniNet is a browser SPA with a separate API. Persisting bearer tokens in
`localStorage` or `sessionStorage` exposes them directly to injected JavaScript.
Long-lived, non-rotating refresh tokens also allow replay after theft.

## Decision

- Return a short-lived HS256 access JWT in the response body and retain it only in
  JavaScript memory.
- Store the refresh JWT in `uninet.refresh`, an `HttpOnly`, `SameSite=Strict`
  cookie scoped to `/api/auth`; set `Secure` in production.
- Include user, session ID, role, university, issuer, audience, and token type in
  signed claims as appropriate. The API still loads the database Session and User;
  claims are not sufficient authorization by themselves.
- Rotate refresh tokens atomically on every use. Persist only their SHA-256 hashes.
  A replayed rotated token compromises and revokes the complete token family.
- Queue concurrent browser refresh attempts behind one promise, then retry an
  original request once.
- Check trusted Origin for login/register/refresh in addition to strict cookie and
  explicit CORS origins.

## Consequences

- A page reload requires a cookie refresh before restoring the current user.
- XSS can still act as the current user while malicious JavaScript is running, so
  CSP, output encoding, dependency review, and input validation remain necessary.
- SameSite Strict improves CSRF resistance but may affect cross-site login flows.
  OAuth is not implemented and must revisit this cookie model.
- HS256 is currently single-key: there is no `kid` or overlapping verification-key
  set. Rotating a JWT secret logs out affected sessions. The
  [secret rotation procedure](../security/secrets-and-configuration.md) documents
  this limitation rather than claiming zero-downtime key rollover.

## Alternatives considered

- Browser storage for both tokens — rejected because token exfiltration impact is
  higher.
- Server-only opaque session cookie — viable, but would require a deliberate API
  and CSRF design change.
- Asymmetric JWT with `kid` and JWKS — desirable for distributed verification but
  premature for the current single API; tracked as future work.

## Evidence

- `src/api/apiClient.js`
- `src/auth/authService.js`
- `server/src/auth/auth.routes.js`
- `server/src/auth/auth.service.js`
- `server/src/utils/tokens.js`
- auth cookie, middleware, service, and API-client tests under `server/test/`
