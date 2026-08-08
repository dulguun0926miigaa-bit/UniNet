# UniNet Phase 1 — Email verification ба roster matching test report

Огноо: 2026-07-27

## Хэрэгжүүлсэн хүрээ

- Бүртгэл үүсэхдээ `PENDING_VERIFICATION`, `emailVerifiedAt = null` болдог.
- Бүртгэлийн дараа access/refresh session шууд олгохоо больсон.
- HMAC-SHA256 hash-тай 6 оронтой, хугацаатай, one-time verification code хийсэн.
- `POST /api/auth/verify-email` болон `POST /api/auth/resend-verification` нэмсэн.
- Resend cooldown, maximum attempt, expired/used token handling нэмсэн.
- Email verification finalize нь database transaction дотор ажилладаг.
- Verified official-domain хэрэглэгчийг `UniversityMember` roster-тэй тулгана.
- Зөвхөн `STUDENT + ACTIVE enrollment + хүчинтэй хугацаа` таарвал `ACTIVE` болно.
- Roster таарахгүй, идэвхгүй эсвэл unknown/free domain бол `PENDING_REVIEW` болно.
- Frontend-д verification code болон pending-review flow нэмсэн.
- OpenAPI contract 85 endpoint болж шинэчлэгдсэн.

## Амжилттай ажиллуулсан шалгалтууд

```bash
npm run lint
npm run type-check
npm run test:email-verification-smoke
```

`test:email-verification-smoke` дараахыг бодитоор шалгасан:

1. Register нь verified/active хэрэглэгч шууд үүсгэхгүй.
2. Verification code нь 6 оронтой бөгөөд database-д plaintext биш hash-аар хадгалагдана.
3. Active student roster match үед account `ACTIVE` болж session гарна.
4. Roster match байхгүй үед account `PENDING_REVIEW` болж session гарахгүй.
5. Unknown/free domain account university tenant-д автоматаар холбогдохгүй.
6. Client role mass-assignment reject хийгдэнэ.
7. Repository transaction code consume + roster match + profile update-ийг atomic байдлаар гүйцэтгэнэ.
8. Prisma schema болон migration-д `EmailVerificationToken` table/relation/FK бүтэц байна.
9. OpenAPI-д verify/resend route байна.
10. Invalid verify request HTTP 422 `VALIDATION_ERROR` буцаана.

Мөн өөрчилсөн JavaScript файлууд дээр `node --check`, `Uninetlanding.jsx` дээр Babel parser шалгалт амжилттай болсон.

## Энэ Linux container-д эхэлж чадаагүй шалгалтууд

### Vitest болон Vite build

ZIP дотор Windows дээр суулгасан `node_modules` орсон байсан. Linux container-д `@rolldown/binding-linux-x64-gnu` native optional dependency байхгүй тул:

```bash
npm test
npm run build
```

startup үе дээр зогссон. Энэ нь Phase 1 application assertion failure биш; platform-specific dependency installation issue юм.

### Prisma generate/migration deploy

ZIP-д зөвхөн Windows Prisma schema engine байсан. Linux engine-ийг татах үед container-ийн network/DNS хаалттай байсан тул:

```bash
npm run db:generate
```

эхэлж чадаагүй. Migration SQL, schema relation болон repository logic-ийг smoke test-ээр шалгасан боловч бодит PostgreSQL database дээр migration deploy-ийг Windows орчинд дахин ажиллуулах шаардлагатай.

## Windows дээр хийх эцсийн баталгаажуулалт

Project folder дотроос:

```powershell
# ZIP-ээс ирсэн хуучин node_modules-ийг ашиглахгүй.
Remove-Item -Recurse -Force node_modules
npm install

npm run db:generate
npm run db:migrate
npm run test:email-verification-smoke
npm test
npm run test:integration
npm run build
```

Migration нэр асуувал:

```text
email_verification
```

`.env`-д development/test орчинд дараах variable-уудыг тохируулна:

```env
EMAIL_VERIFICATION_CODE_EXPIRES_IN=10m
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60
EMAIL_VERIFICATION_MAX_ATTEMPTS=5
EMAIL_VERIFICATION_SECRET=replace-with-a-long-random-secret-different-from-jwt-secrets
```

SMTP тохируулаагүй local development үед одоогийн email adapter mode-оо ашиглана. Production-д dedicated verification secret болон бодит SMTP/transactional email тохиргоо заавал хэрэгтэй.

## Checklist update

`things-to-do.md` дотор Phase 1-т хамаарах 7 мөрийг бодит implementation болон дээрх purpose-built test-үүдийн дараа `[x]` болгосон. OAuth/OIDC, MFA, production deployment, external security verification зэрэг нийлмэл эсвэл гадаад орчин шаардсан мөрүүдийг `[ ]` хэвээр үлдээсэн.
