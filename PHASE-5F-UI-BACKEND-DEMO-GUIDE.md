# Phase 5F — Frontend-ээр backend шалгах дараалал

## A. Нэг удаагийн бэлтгэл

1. Phase 5F folder-ийн `UniNet/uninet-app`-ийг VS Code дээр нээнэ.
2. Өмнөх `.env`-ээ хуулна.
3. Local demo-д:

```env
NODE_ENV=development
EMAIL_VERIFICATION_ENABLED=false
EMAIL_DELIVERY_MODE=console
SEED_ROLE_USERS=true
SEED_ROLE_PASSWORD=ChangeMe!2026Local
DEMO_RESET_CONFIRM=RESET_UNINET_DEMO

GOOGLE_OAUTH_ENABLED=false
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

4. Ажиллуулна:

```powershell
npm install
npm run db:generate
docker compose up -d postgres redis minio minio-init clamav
npm run db:deploy
npm run db:seed
npm run test:phase5f-smoke
npm run server:dev
```

Шинэ terminal:

```powershell
npm run dev
```

## B. Landing UI

1. `http://localhost:5173` нээнэ.
2. Network/grid background, таван university card-ийн top border болон шинэ before/after block-ийг үзүүлнэ.
3. Visibility card-ууд эхэндээ адилхан харагдаж байгааг, дарахад тухайн өнгийн detail гарч байгааг үзүүлнэ.
4. Footer дээр FAQ/help/security агуулга харагдаж байгааг үзүүлнэ.

## C. Google OAuth бодитоор шалгах

Google Cloud console дээр Web application client үүсгээд authorized redirect URI-д яг:

```text
http://localhost:4000/api/auth/google/callback
```

оруулна. `.env`:

```env
GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=<client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<client-secret>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

Backend-ээ restart хийнэ.

1. `Google эрхээр бүртгүүлэх` дарна.
2. Gmail account сонгоно.
3. Буцаж ирсэн onboarding form дээр `bat@num.edu.mn` зэрэг сургуулийн имэйл бичнэ. Local-part нь `student` байх албагүй.
4. Backend verified domain-аар МУИС-ийг тодорхойлж Student account үүсгэнэ.
5. Admin approval шаардлагатай бол `admin@num.edu.mn`-ээр орж `Оюутнууд → Хянах хүсэлт → Батлах` хийнэ.
6. Дараагийн удаа Google товчоор шууд session үүсэж dashboard нээгдэнэ.

Database нотолгоо:

```powershell
npm run db:studio
```

`User` хүснэгтэд `googleId`, `gmail`, `studentEmail`, `authProvider=GOOGLE`, `googleLinkedAt`, `universityId` харагдана.

## D. Realtime University Admin notification

1. Browser A дээр `admin@num.edu.mn`-ээр нэвтэрч мэдэгдлийн хэсгийг нээлттэй үлдээнэ.
2. Browser B/incognito дээр шинэ `random.name@num.edu.mn` Student бүртгэнэ.
3. Browser A-г refresh хийхгүйгээр шинэ approval notification ирэхийг харуулна.
4. Notification дээр дарж pending Student page рүү орно.
5. `Батлах → Бүртгэл батлах` дарахад Student `ACTIVE` болно.

Тайлбар: notification database-д хадгалагдаж, backend SSE channel шинэ event дамжуулна. SSE тасарвал frontend polling fallback ашиглана.

## E. Survey нэгтгэсэн дэлгэц

1. `staff@num.edu.com`-ээр орно.
2. `Судалгаа ба асуулга` руу орно.
3. Builder, survey жагсаалт, response count болон analytics нэг дэлгэцэд байгааг үзүүлнэ.
4. PRIVATE survey нийтэлж `student@num.edu.mn` хардаг, `student@must.edu.mn` харахгүйг үзүүлнэ.

## F. University Admin profile

1. `admin@num.edu.mn`-ээр орно.
2. `Сургуулийн профайл` нээнэ.
3. Лого URL, website, contact, rector, address болон brand color-оос нэгийг өөрчилж хадгална.
4. Page refresh хийсний дараа өөрчлөлт хэвээр байгааг үзүүлнэ.
5. `Audit Log` дээр university update event-ийг харуулна.

## G. Partnership ба report merge

1. Admin sidebar дээр зөвхөн нэг `Түншлэл` entry байгааг үзүүлнэ.
2. Pending/Active filter ашиглаж invitation болон active partnership-ийг нэг table-аас удирдана.
3. `Тайлан ба аналитик` дээр PostgreSQL source timestamp болон бодит count-уудыг үзүүлнэ.
4. Шинэ Student эсвэл content үүсгээд refresh хийхэд count өөрчлөгдөхийг харуулна.

## H. Super Admin real management

1. `superadmin@uninet.local`-ээр орно.
2. `Их сургуулиуд → Удирдах` дээр:
   - name/logo/contact/brand хадгална;
   - domain нэмнэ/verify/primary/revoke хийнэ;
   - university activate/suspend хийнэ.
3. `Шинэ сургууль нэмэх` нь тусдаа sidebar route бөгөөд university list active state-тай давхар сонгогдохгүйг үзүүлнэ.
4. `Нийт хэрэглэгчид → Удирдах` дээр хэрэглэгч suspend/activate хийнэ.
5. `Түншлэлийн сүлжээ → Удирдах` дээр pending invitation accept/reject эсвэл active partnership end хийнэ.
6. JSON dump биш structured detail/action UI гарч байгааг үзүүлнэ.

## I. Live Global Analytics ба Monitoring

1. `Global Analytics` нээнэ.
2. `Source: POSTGRESQL_LIVE_AGGREGATES` болон generated timestamp-ийг үзүүлнэ.
3. User/content/registration/application/partnership status count-ууд database-аас ирж байгааг тайлбарлана.
4. `System Monitoring` дээр:
   - Node uptime/version/memory;
   - PostgreSQL response;
   - Redis connectivity;
   - active sessions;
   - SQL injection blocked count;
   - critical audit count
   харуулна.

## J. SQL injection хамгаалалтыг Postman-аар үзүүлэх

Admin access token авсны дараа жишээ list API руу:

```http
GET http://localhost:4000/api/memberships/students?search=' UNION SELECT password FROM users --
Authorization: Bearer <token>
```

Хүлээгдэх хариу:

```json
{
  "error": {
    "code": "SUSPICIOUS_INPUT_BLOCKED",
    "message": "Аюулгүй байдлын шүүлтүүр хүсэлтийг хориглолоо."
  }
}
```

Дараа нь Super Admin monitoring/audit дээр `SECURITY_SQL_INJECTION_BLOCKED` count/event нэмэгдсэнийг үзүүлнэ. Багшид Prisma parameterized query нь үндсэн хамгаалалт, request guard нь нэмэлт detection/audit layer гэдгийг хэлнэ.

## K. 12 минутын хамгаалалтын demo

1. Landing redesign ба visibility interaction — 1 минут.
2. Google OAuth architecture/env/DB fields — 2 минут.
3. Student бүртгэл → Admin realtime notification → direct approval — 2 минут.
4. Staff survey + response analytics нэг page — 1 минут.
5. Admin university profile ба merged partnership/report — 2 минут.
6. Super Admin university/user/partnership real actions — 2 минут.
7. Global Analytics + Monitoring + SQL injection block — 2 минут.
