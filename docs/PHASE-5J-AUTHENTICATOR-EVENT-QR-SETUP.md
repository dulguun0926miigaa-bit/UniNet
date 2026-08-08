# UniNet Phase 5J — тохируулах ба турших заавар

Энэ хувилбар дараах өөрчлөлтүүдийг агуулна:

- Student dashboard dropdown overlay засвар
- Мэдэгдэл нэг бүрээр болон бүгдийг уншсан болгох, холбоотой хэсэг рүү нээх, бүтэн мэдэгдлийн хуудас
- Баталгаажсан сургуулийн домэйнтэй шинэ Student-ийг University Admin approval-гүйгээр шууд `ACTIVE` болгох
- University Admin сургуулийн профайлын бүх талбарыг хадгалах, URL эсвэл файл upload-аар лого шинэчлэх
- Layout-т таарсан skeleton loading
- Өмнө идэвхжүүлсэн Google Authenticator ашиглан Student password reset хийх
- Event registration QR deep link, Student signed ticket QR, Staff/Admin camera scanner
- Google шинэ Student registration-д сургуулийн email verification + local UniNet password

## 1. Шаардлагатай орчин

- Node.js `24.15.0`
- npm `11.12.1`
- PostgreSQL
- Redis
- University logo upload ашиглах бол S3-compatible storage (local дээр MinIO)
- Production file upload дээр ClamAV

Төслийн root:

```powershell
cd "...\UniNet\uninet-app"
```

Dependency:

```powershell
npm install
```

## 2. `.env` бэлтгэх

```powershell
Copy-Item .env.example .env
```

Өөрийн бодит secret, database, Google OAuth болон email тохиргоог зөвхөн `.env`-д оруулна. `.env`-ийг GitHub/чатад нийтлэхгүй.

Шаардлагатай үндсэн утгууд:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/uninet?schema=public
VITE_API_URL=http://localhost:4000/api
APP_URL=http://localhost:5174
VITE_PUBLIC_APP_URL=http://localhost:5174
CORS_ORIGINS=http://localhost:5173,http://localhost:5174

GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=YOUR_ROTATED_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback

PASSWORD_RESET_TOTP_CHALLENGE_EXPIRES_IN=10m
FILE_UNIVERSITY_LOGO_MAX_BYTES=2097152
```

Secret үүсгэх жишээ:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`MFA_ENCRYPTION_KEY` нь хоёр дахь командын гаргасан 64 hex тэмдэгт байна.

Өмнө чатад эсвэл өөр газар ил болсон Google Client Secret-ийг ашиглахгүй; Google Cloud дээр reset/rotate хийсэн шинэ secret ашиглана.

## 3. Бодит 6 оронтой email verification

Google-ээр шинээр Student account үүсгэх үед сургуулийн email рүү 6 оронтой код бодитоор явуулахын тулд:

```env
EMAIL_VERIFICATION_ENABLED=true
EMAIL_DELIVERY_MODE=resend
EMAIL_FROM=no-reply@your-verified-domain.mn
RESEND_API_KEY=YOUR_RESEND_API_KEY
RESEND_REPLY_TO=support@your-domain.mn
```

эсвэл SMTP:

```env
EMAIL_VERIFICATION_ENABLED=true
EMAIL_DELIVERY_MODE=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_FROM=no-reply@example.com
```

`EMAIL_DELIVERY_MODE=console` үед код terminal дээр харагдана; inbox руу очихгүй.

## 4. Database migration

Prisma client үүсгээд migration ажиллуулна:

```powershell
npm run db:generate
npm run db:deploy
```

Development database дээр migration шинээр удирдах шаардлагатай бол:

```powershell
npm run db:migrate
```

Phase 5J migration:

- `FilePurpose.UNIVERSITY_LOGO` нэмнэ
- Email нь баталгаажсан хуучин `PENDING_REVIEW` Student-үүдийг `ACTIVE` болгоно

## 5. Local ажиллуулах

Terminal 1:

```powershell
npm run server:dev
```

Дараах service-үүд асна:

- API Gateway — `127.0.0.1:4000`
- Identity Service — `127.0.0.1:4101`
- Core Service — `127.0.0.1:4102`

Terminal 2:

```powershell
npm run dev
```

Frontend тогтмол:

```text
http://localhost:5174
```

Health check:

```text
http://localhost:4000/api/health
```

## 6. Student Authenticator password reset

### Урьдчилсан нөхцөл

Student password-аа мартахаас өмнө:

```text
Student Settings → Security → Authenticator MFA → QR scan → 6 оронтой код баталгаажуулах
```

### Reset урсгал

```text
Нууц үг мартсан?
→ Student email
→ Google Authenticator-ийн 6 оронтой TOTP
→ Шинэ нууц үг + давталт
→ Бүх хуучин session revoke
→ Шинэ нууц үгээр login
```

Хамгаалалт:

- Challenge 10 минут
- Нэг challenge дээр 15 минутанд 8 оролдлого
- IP rate limit
- Нэг TOTP time-step-ийг дахин ашиглах боломжгүй
- Reset token нэг удаагийн
- Өмнөх password history шалгана
- Password солигдоход бүх session revoke хийнэ

Authenticator өмнө идэвхжээгүй Student TOTP reset ашиглах боломжгүй. Тэр тохиолдолд email reset эсвэл account recovery ашиглана.

## 7. University logo upload

Local MinIO/S3 тохиргоо:

```env
FILE_STORAGE_PROVIDER=s3
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=uninet-files
S3_ACCESS_KEY=uninet-local
S3_SECRET_KEY=uninet-local-secret
S3_FORCE_PATH_STYLE=true
CLAMAV_MODE=disabled
```

Infrastructure-ийг Docker Compose-оор асааж болно:

```powershell
docker compose up -d postgres redis minio
```

University Admin:

```text
Сургуулийн профайл
→ Лого URL оруулах
эсвэл
→ JPG/PNG/WebP файл сонгох → Upload
→ Бусад талбаруудаа засах → Профайл хадгалах
```

Production дээр `CLAMAV_MODE=disabled` ашиглахгүй.

## 8. Event registration QR-г утсаар турших

`localhost` гэдэг нь тухайн төхөөрөмж өөрөө учраас утас PC-ийн `localhost` руу орж чаддаггүй.

### Нэг Wi-Fi сүлжээнд local/password login-аар турших

PC-ийн IPv4 хаягийг олно:

```powershell
ipconfig
```

Жишээ IP: `192.168.1.25`.

`.env`:

```env
VITE_API_URL=http://192.168.1.25:4000/api
VITE_PUBLIC_APP_URL=http://192.168.1.25:5174
CORS_ORIGINS=http://localhost:5174,http://192.168.1.25:5174
GATEWAY_BIND_HOST=0.0.0.0
APP_URL=http://localhost:5174
```

Backend restart, дараа нь frontend:

```powershell
npm run dev:network
```

Утаснаас:

```text
http://192.168.1.25:5174
```

нээгдэж байх ёстой. Windows Firewall дээр Node.js/private network access зөвшөөрнө.

### Google OAuth-ийг утаснаас local орчинд турших

`http://localhost:4000` callback нь утас дээр PC рүү заахгүй. Google OAuth mobile test-д HTTPS tunnel эсвэл бодит HTTPS dev domain ашиглана.

Жишээ бүтэц:

```env
APP_URL=https://YOUR-FRONTEND-TUNNEL.example
VITE_PUBLIC_APP_URL=https://YOUR-FRONTEND-TUNNEL.example
VITE_API_URL=https://YOUR-API-TUNNEL.example/api
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR-API-TUNNEL.example/api/auth/google/callback
CORS_ORIGINS=https://YOUR-FRONTEND-TUNNEL.example
```

Google Cloud → OAuth Client → Authorized redirect URIs хэсэгт яг ижил HTTPS callback нэмнэ.

Production дээр:

```env
APP_URL=https://app.uninet.mn
VITE_PUBLIC_APP_URL=https://app.uninet.mn
VITE_API_URL=https://api.uninet.mn/api
GOOGLE_OAUTH_REDIRECT_URI=https://api.uninet.mn/api/auth/google/callback
CORS_ORIGINS=https://app.uninet.mn
```

## 9. QR урсгал

```text
University Admin/Staff published PUBLIC эсвэл NETWORK event нээнэ
→ Event registration QR үүсгэнэ
→ Student утасны Camera app-аар scan хийнэ
→ Public event detail нээгдэнэ
→ Нэвтрээгүй бол login
→ Login дуусмагц event detail рүү буцна
→ “Тасалбар авах”
→ CONFIRMED бол signed Student ticket QR гарна
→ Staff/Admin camera scanner-аар ticket QR уншуулна
→ Attendance = ATTENDED
```

WAITLISTED Student-д баталгаажсан ticket QR гарахгүй.

## 10. Шалгалт

Dependency шаардахгүй source smoke:

```powershell
npm run test:phase5j-smoke
```

Бүрэн шалгалт:

```powershell
npm run db:generate
npm run lint
npm run type-check
npm run test
npm run build
```

## 11. Түгээмэл алдаа

### `EADDRINUSE :4000`

```powershell
netstat -ano | findstr :4000
Stop-Process -Id REAL_PID -Force
```

### OAuth callback 5173 рүү очих

`.env`:

```env
APP_URL=http://localhost:5174
```

Backend-ээ restart хийнэ.

### Logo upload storage error

MinIO/S3 ажиллаж байгаа эсэх, bucket болон credential-ийг шалгана.

### Authenticator reset invalid

- Student MFA өмнө идэвхжсэн эсэх
- Утасны цаг automatic байгаа эсэх
- Нэг кодыг өмнө ашигласан эсэх
- Challenge 10 минутаас хэтэрсэн эсэх
