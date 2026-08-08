# UniNet Phase 5J — Authentication, Event QR and Profile UX

## Delivered

- Student dashboard dropdown menus now render above cards.
- Notification dropdown and full pages support individual read, read-all and action navigation.
- Verified university-domain Student registrations activate directly without University Admin review.
- Google onboarding keeps password login and Google login together; new Google Students create a local password and verify the school email.
- University Admin own-profile edits no longer trigger the platform mutation reason/step-up prompt.
- University profile fields persist through the backend; logo supports URL and scanned file upload.
- Transient profile network failures receive a bounded retry and an explicit retry state.
- Dashboard/profile/table/card skeleton variants match their target layouts.
- Student TOTP password reset includes signed challenge, challenge/IP rate limits, replay-safe TOTP verification, one-time reset token, password history and all-session revocation.
- Published PUBLIC/NETWORK events expose a public QR deep link.
- Login preserves the target event and returns the Student to the ticket action.
- Existing signed Student ticket QR and attendance validation were connected to a camera-based Staff/Admin scanner.
- OpenAPI, environment example, migration, setup documentation and Phase 5J source smoke were updated.

## Database migration

`server/prisma/migrations/20260806170000_phase5j_student_access_qr_profile/migration.sql`

- Adds `UNIVERSITY_LOGO` to `FilePurpose`.
- Activates verified legacy Student records that remained in `PENDING_REVIEW`.

## Security properties

- Google Client Secret remains backend-only.
- Google identity uniqueness constraints remain database-backed.
- New Student activation requires a verified, active University domain and school-email ownership when email verification is enabled.
- TOTP password reset is Student-only and requires an already-enabled credential.
- Recovery codes are not accepted in the TOTP reset path.
- Replayed TOTP steps are rejected atomically.
- Reset and session tokens are invalidated after password change.
- Uploaded university logos use content signature validation, quarantine, malware scanning and digest-checked delivery.

## Local runtime

- Frontend is pinned to `http://localhost:5174`.
- Use `npm run dev:network` for LAN QR testing.
- Phone-based Google OAuth needs an HTTPS tunnel or deployed HTTPS URLs; raw phone-to-PC `localhost` cannot work.

## Verification

Run:

```bash
npm run test:phase5j-smoke
```

Then, with dependencies and services available:

```bash
npm run db:generate
npm run lint
npm run type-check
npm run test
npm run build
```
