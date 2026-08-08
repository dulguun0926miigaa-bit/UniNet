# Phase 5M — Resend OTP, Remember Me, FREE/PAID Event + Stripe Sandbox

## 1. Student authentication

Student can sign in with either:

- school email + UniNet password, or
- the Google account already linked to that UniNet account.

A Google identity remains unique to one UniNet user. Linking Google does not remove the local password login.

Student accounts do **not** use Google Authenticator. TOTP/Authenticator login remains mandatory only for `UNIVERSITY_ADMIN` and `PLATFORM_SUPER_ADMIN`.

### Remember me

The login page includes `Намайг сана`. For Student accounts only, checking it makes the refresh-session cookie persistent for `REMEMBER_ME_DAYS`. Without it the refresh cookie is a browser-session cookie. Normal Student login does not require an OTP; OTP is reserved for password recovery/security flows.

A password reset revokes every active session, including remembered sessions.

## 2. Student forgot password with Resend OTP

Flow:

1. Student enters school email.
2. UniNet finds the Student account.
3. If a verified linked Google identity has an email, OTP goes to that Google email.
4. Otherwise OTP falls back to the verified school email.
5. UniNet creates a random six-digit OTP challenge. Only a keyed hash is stored.
6. Resend sends the OTP.
7. Student enters the six-digit OTP.
8. A one-time password-reset token is issued.
9. Student enters new password + confirmation.
10. Password history is enforced.
11. All old sessions/remembered sessions are revoked.
12. Student signs in with the new password.

There is no forgotten-username recovery flow and no Student Authenticator recovery flow.

### Resend `.env`

For real Resend delivery:

```env
EMAIL_DELIVERY_MODE=resend
RESEND_API_KEY=re_your_private_key
RESEND_API_URL=https://api.resend.com/emails
EMAIL_FROM=onboarding@resend.dev
PASSWORD_RESET_OTP_EXPIRES_IN=10m
PASSWORD_RESET_OTP_MAX_ATTEMPTS=5
PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS=60
```

Do not commit `RESEND_API_KEY`.

`onboarding@resend.dev` is only for development. Resend allows that testing domain to send to the email address associated with the Resend account. To send OTP to arbitrary Student Gmail/school addresses, verify your own domain in Resend and change `EMAIL_FROM` to an address on that domain.

## 3. Admin / Super Admin MFA

`UNIVERSITY_ADMIN` and `PLATFORM_SUPER_ADMIN`:

- must enroll Google Authenticator if not already enrolled;
- enter TOTP/recovery code during login;
- keep the existing encrypted TOTP secret and recovery-code protections.

Student/Staff login never enters the admin TOTP flow.

Approve/reject management actions do not ask for another password, MFA code, or reason prompt. Admin login MFA is the security boundary for those normal dashboard actions.

## 4. Staff FREE / PAID event

Staff event creation has:

```text
Ticket type: FREE | PAID
```

For `PAID`:

- Staff enters an integer ticket price;
- currency is `MNT` in the current UI;
- price is stored in UniNet DB;
- Staff event is always saved as `PENDING_APPROVAL` (unless it is only a draft).

University Admin `Approve` changes an Event directly to `PUBLISHED`. `Reject` changes it to `REJECTED`.

## 5. FREE event ticket

```text
Student → Тасалбар авах → CONFIRMED → signed QR ticket
```

## 6. PAID event ticket with Stripe TEST/SANDBOX

```text
Student → Тасалбар авах
→ PAYMENT_PENDING registration
→ Payment(PENDING)
→ Stripe Checkout Session
→ test payment
→ Stripe webhook
→ Payment(PAID)
→ Registration(CONFIRMED)
→ QR ticket unlocked
```

The frontend never sends the authoritative event price to Stripe. The backend loads the event price from UniNet DB and creates Checkout `price_data` dynamically. No Stripe Product ID or Price ID is required.

### Stripe `.env`

```env
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=your_test_or_sandbox_secret_key
STRIPE_WEBHOOK_SECRET=whsec_from_the_listener
APP_URL=http://localhost:5174
```

Do not commit Stripe keys.

### Local webhook

Install/login to Stripe CLI using the official Stripe instructions, then run a listener such as:

```powershell
stripe listen --events checkout.session.completed,checkout.session.expired,payment_intent.payment_failed,charge.refunded --forward-to http://localhost:4000/api/payments/stripe/webhook
```

Copy the `whsec_...` printed by that exact `stripe listen` process into `STRIPE_WEBHOOK_SECRET`, then restart `npm run server:dev`.

The webhook signing secret produced by Stripe CLI is different from a Dashboard webhook endpoint secret. Use the secret that belongs to the endpoint/listener generating the event.

### Stripe test card

Use test/sandbox values only, for example:

```text
4242 4242 4242 4242
Any future expiry, e.g. 12/34
Any 3-digit CVC, e.g. 123
```

Never use a real card in Stripe test mode.

## 7. Payment model

`Payment` is provider-neutral at the UniNet domain level:

- provider: `STRIPE` (future providers such as QPay can be added later)
- statuses: `PENDING`, `PAID`, `FAILED`, `CANCELED`, `REFUNDED`
- provider session/payment IDs are unique
- one Payment belongs to one event Registration

The Stripe session is bound to the UniNet payment by session ID and metadata. Webhook completion also verifies paid status, expected DB amount and currency before confirming the registration.

## 8. QR admission rule

A paid event QR cannot be fetched unless its Payment is `PAID`. Attendance scanning also rejects a paid QR if the payment is not `PAID`.

Student ticket UI shows:

> Энэхүү QR кодоо event дээр өөрийн биеэр очиж зохион байгуулагчид үзүүлж нэвтэрнэ үү. QR тасалбараа үзүүлэхгүй бол арга хэмжээнд нэвтрэх боломжгүй.

Staff/Admin scans the signed ticket at the event. A valid confirmed ticket becomes `ATTENDED`.

## 9. Local startup order

```powershell
docker compose up -d postgres redis mailpit
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run server:dev
```

In a second terminal:

```powershell
npm run dev
```

Frontend: `http://localhost:5174`

For Stripe paid-ticket testing keep the Stripe CLI listener running in another terminal.

## 10. Required `.env` values to paste after extracting the ZIP

At minimum, preserve your existing DB/JWT/Google values and set:

```env
DATABASE_URL=postgresql://uninet:uninet-local-only@localhost:5433/uninet?schema=public
APP_URL=http://localhost:5174
VITE_API_URL=http://localhost:4000/api

EMAIL_DELIVERY_MODE=resend
RESEND_API_KEY=re_your_key
EMAIL_FROM=onboarding@resend.dev

STRIPE_ENABLED=true
STRIPE_SECRET_KEY=your_test_or_sandbox_secret
STRIPE_WEBHOOK_SECRET=whsec_from_stripe_listen

REMEMBER_ME_DAYS=30
JWT_REFRESH_EXPIRES_IN=30d
```

Google OAuth secrets remain only in backend `.env` as before.
