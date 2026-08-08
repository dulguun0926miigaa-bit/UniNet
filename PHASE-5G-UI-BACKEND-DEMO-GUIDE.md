# Phase 5G — Frontend and backend verification flow

## 1. Verify the microservices

Open:

```text
http://localhost:4000/api/ready
```

Expected response:

```json
{
  "status": "ready",
  "gateway": "up",
  "services": {
    "identity": "up",
    "core": "up"
  }
}
```

Explain that the React application uses one stable gateway URL while authentication and collaboration requests are processed by separate services.

## 2. Verify the redesigned filter dropdown

Log in as any role and open a page with filters, for example:

```text
Student → UniNet сүлжээ
Staff → Судалгаа ба асуулга
Admin → Оюутнууд
Staff → Бүртгэлүүд
```

Click a filter such as `Сургууль`, `Төлөв` or `Visibility`.

Verify:

- the label is above the control and no longer overlaps `Бүгд`;
- the menu is a custom white popover;
- the selected row is blue with a check icon;
- arrow keys, Enter and Escape work;
- clicking outside closes the menu.

## 3. Google OAuth — existing Student account

Requirements:

```env
GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

Flow:

```text
Нэвтрэх
→ Google эрхээр нэвтрэх
→ any Google account сонгох
→ Бүртгэлтэй account-аар нэвтрэх
→ сургуулийн имэйл + одоогийн нууц үг
→ Google account холбож нэвтрэх
```

Backend checks:

- Google authorization code + PKCE;
- signed state cookie;
- ID-token audience, verified email and nonce;
- Student account password re-authentication;
- university domain/tenant match;
- one Google subject ↔ one UniNet account;
- audit event `GOOGLE_OAUTH_EXISTING_STUDENT_LINKED`.

After the first link, log out and choose the same Google account again. It should go directly to the same Student account without asking for the university email again.

## 4. Google OAuth — new Student registration

Flow:

```text
Бүртгүүлэх
→ Google эрхээр бүртгүүлэх
→ any Google account сонгох
→ Шинээр бүртгүүлэх
→ arbitrary local-part university email, profile and enrollment year
→ Google-ээр шинэ Student бүртгэл үүсгэх
```

Examples:

```text
bat.bold@num.edu.mn
my.name@must.edu.mn
student2026@msue.edu.mn
```

The local part does not need to be `student`. The verified domain determines the university.

If roster matching does not activate the account, the registration becomes `PENDING_REVIEW` and University Admin approval is required. The same Google account stays permanently linked to that Student record.

## 5. Verify service routing in browser Network tools

Open Developer Tools → Network and perform:

```text
POST /api/auth/login
GET  /api/student/bootstrap
GET  /api/surveys/manage
```

The browser always calls port `4000`. Response headers show the downstream owner:

```text
X-UniNet-Service: identity-service
X-UniNet-Service: core-service
```

## 6. Failure isolation demonstration

Stop only Core Service. Authentication routes should still reach Identity Service, while collaboration routes return:

```json
{
  "error": {
    "code": "UPSTREAM_UNAVAILABLE",
    "message": "Backend service түр ашиглах боломжгүй байна."
  }
}
```

Restart `npm run services:dev`, then refresh the UI.
