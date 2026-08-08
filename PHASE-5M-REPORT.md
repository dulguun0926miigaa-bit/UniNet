# UniNet Phase 5M Report

Phase 5M consolidates the requested Student authentication and paid-event flow.

## Delivered

- Student local email/password + Google OAuth both remain supported.
- Google identity uniqueness remains enforced by the existing OAuthAccount constraints.
- Student login no longer uses Google Authenticator.
- Google Authenticator login remains mandatory for University Admin and Platform Super Admin.
- Student-only `Remember me` persists the refresh cookie/session; password reset revokes all sessions.
- Student forgot password now uses a six-digit Resend OTP sent to the verified linked Google email, with verified school-email fallback.
- OTP expiry, resend cooldown, attempt cap, one-time reset token, password history and session revocation are enforced.
- Staff Event creation supports FREE/PAID and MNT price input.
- Staff Event submission always goes to University Admin approval; Event approval publishes it.
- FREE events keep immediate signed QR ticket issuance.
- PAID events use a provider-neutral Payment model and Stripe TEST/SANDBOX Checkout.
- Stripe Product/Price IDs are not required; Checkout inline price_data comes from the DB event price.
- Stripe webhook signature uses the exact raw body, timestamp tolerance and timing-safe HMAC comparison.
- `checkout.session.completed` must report paid and match expected amount/currency before QR unlock.
- Failed/expired/refunded payments invalidate pending/paid ticket state as applicable.
- Paid QR fetch and attendance scan both require Payment=PAID.
- Public event-registration QR flow remains removed; QR is an admission ticket shown in person.

See `docs/PHASE-5M-RESEND-REMEMBER-STRIPE-SETUP.md` for local setup and `.env` instructions.
