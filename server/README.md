# UniNet backend

## Local setup

1. Copy `.env.example` to `.env` and replace every secret.
2. Create the PostgreSQL database named in `DATABASE_URL`.
3. Run `npm run db:deploy`, then `npm run db:seed`.
4. Start the API with `npm run server:dev`.

The API listens on port `4000` by default. Its OpenAPI 3.1 contract is served at
`GET /api/openapi.json`, with a dependency-free, CSP-safe endpoint index at
`GET /api/docs`. Compatibility and deprecation rules are documented in
[`docs/api-versioning.md`](../docs/api-versioning.md).

Auth endpoints are:

- `POST /api/auth/register` — student registration using a configured university domain
- `POST /api/auth/login`
- `POST /api/auth/refresh` — rotates the refresh session
- `GET /api/auth/me` — requires `Authorization: Bearer <accessToken>`
- `POST /api/auth/logout` — revokes only the access token's current session
- `POST /api/auth/logout-all` — revokes every refresh session for the current user
- `POST /api/auth/password-reset/request` — generic response and an opaque reset link
- `POST /api/auth/password-reset/confirm` — consumes a single-use token and revokes all sessions

Refresh tokens are rotated atomically. Replaying a rotated token marks its token
family compromised and revokes every descendant session. For local development,
`EMAIL_DELIVERY_MODE=console` writes password-reset links to the API terminal. Set
`EMAIL_DELIVERY_MODE=smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD`, and `EMAIL_FROM` to deliver real mail. Console delivery is rejected
when `NODE_ENV=production`.

Public registration always creates an immediately active `STUDENT`; client-supplied
role and university values are ignored. A recognized, verified university domain is
linked automatically. Other valid email addresses can still register without a
university association. Registration immediately creates a database session, so no
email-code step is required. Passwords and refresh tokens are never stored in
plaintext.

## Seed safety

Always run `npm run db:deploy` before `npm run db:seed`. The initial university and
public catalogue rows are create-only: rerunning the seed does not overwrite edited
content, publication status, or existing university settings.

Reserved `.example` domains are non-primary, unverified local placeholders. The
official domains are primary and verified only when first created. If a configured
domain already belongs to another university, the seed stops with a domain ownership
error instead of silently moving it between tenants.

Demo users are only created when `SEED_DEMO_USERS=true`. Normal registration does
not depend on this account, and rerunning the seed does not reset an existing demo
account.

Demo seed values are configured from `.env`:

```env
SEED_DEMO_USERS=false
SEED_DEMO_EMAIL=student@muis.example
SEED_DEMO_PASSWORD=replace-with-a-strong-local-password
SEED_DEMO_FIRST_NAME=Дөлгөөн
SEED_DEMO_LAST_NAME=Бат
SEED_DEMO_UNIVERSITY_SLUG=muis
SEED_DEMO_MAJOR=Програм хангамж
```

Keep `SEED_DEMO_USERS=false` when demo data is unnecessary. To create a local demo
account, change it to `true`, replace the demo password, then run:

```bash
npm run db:seed
```

Never enable the default demo credentials in production.

Privileged local accounts are independently controlled with:

```env
SEED_ROLE_USERS=true
SEED_ROLE_PASSWORD=replace-with-a-strong-local-password
SEED_STAFF_EMAIL=staff@uninet.mn
SEED_ADMIN_EMAIL=admin@uninet.mn
SEED_SUPER_ADMIN_EMAIL=superadmin@uninet.mn
SEED_ROLE_UNIVERSITY_SLUG=muis
```

These accounts are created only through `npm run db:seed`; public registration
cannot grant privileged roles. The configured password is used only when an account
is first created. Rerunning the seed preserves existing passwords, roles, status,
profile data, and university assignments. A missing Staff/Admin profile is created
without overwriting an existing profile. Conflicting roles or university assignments
cause the seed to fail clearly instead of changing the account.

Keep `SEED_ROLE_USERS=false` in production. Rotate credentials through the normal
account-management flow rather than by rerunning the seed.
