# Phase 5L — Direct Authenticator recovery and direct admin actions

## Delivered flow

Student password recovery now follows this exact UI sequence:

```text
Нууц үг мартсан?
→ Сургуулийн email
→ Google Authenticator QR
→ QR scan
→ Authenticator-ийн 6 оронтой код
→ Шинэ нууц үг
→ Хуучин session-үүд revoke
→ Шинэ нууц үгээр нэвтрэх
```

The former school-email verification-code screen and `/api/auth/password-reset/totp/email-verify` endpoint are removed.

## Password recovery endpoints

```text
POST /api/auth/password-reset/totp/start
POST /api/auth/password-reset/totp/enroll-verify
POST /api/auth/password-reset/confirm
```

`/totp/start` accepts the Student school email and returns the QR enrollment payload immediately. `/totp/enroll-verify` verifies the current six-digit TOTP and issues a single-use reset token. `/password-reset/confirm` enforces password history and revokes all old sessions.

## Admin approve/reject

University Admin and Platform Super Admin management mutations no longer invoke the automatic current-password + MFA step-up prompt. The global mutation-header provider and management-router step-up middleware were removed.

Admin login MFA remains enabled. Explicit step-up is still used by separate account-security operations such as verified email changes, session/device removal, account deactivation and data export.

Approve/reject results show direct success messages:

- Content approve: `Контентыг амжилттай баталлаа.`
- Content reject: `Контентыг татгалзлаа.`
- Application approve: `Өргөдөл амжилттай батлагдлаа.`
- Application reject: `Өргөдлийг амжилттай татгалзлаа.`
- Legacy pending Student approve/reject endpoints return Mongolian success messages.

## Local run

```powershell
docker compose up -d postgres redis mailpit
npm run db:generate
npm run db:deploy
npm run db:seed
npm run server:dev
```

In a second terminal:

```powershell
npm run dev
```

Open `http://localhost:5174`.

## Security warning

Directly returning an Authenticator QR after only entering an email means knowledge of the Student email is enough to begin account recovery. Rate limiting, short-lived signed challenges, TOTP replay protection, one-time reset tokens, password history and session revocation remain, but this flow is weaker than verifying school-email ownership first.

For a real production deployment, restore an independent ownership check before showing or rotating an Authenticator secret, such as a school-email code, an existing recovery code, a previously enrolled TOTP without revealing its secret, or administrator identity review.

## Verification

```powershell
npm run test:phase5l-smoke
npm run test:phase5k-smoke
npm run test:phase5j-smoke
npm run test:phase5i-smoke
npm run test:mvp-backend-smoke
npm run docs:check
npm run security:licenses
```
