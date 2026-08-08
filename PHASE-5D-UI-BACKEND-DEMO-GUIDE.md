# Phase 5D — Frontend-ээр backend workflow үзүүлэх заавар

Энэ заавар нь Postman/Swagger ашиглахгүйгээр UniNet-ийн Phase 5D backend feature-үүдийг frontend-ээс багшид үзүүлэхэд зориулагдсан.

## 1. Demo орчин бэлтгэх

`.env`-д local demo тохиргоог хийнэ:

```env
EMAIL_VERIFICATION_ENABLED=false
EMAIL_DELIVERY_MODE=console
SEED_ROLE_USERS=true
SEED_ROLE_PASSWORD=ChangeMe!2026Local
```

Resend-ийг бодитоор турших бол `EMAIL_DELIVERY_MODE=resend` болгож доорх Resend хэсгийн тохиргоог ашиглана.

```powershell
npm install
npm run db:generate
docker compose up -d postgres redis minio minio-init clamav
npm run db:deploy
npm run db:seed
npm run server:dev
```

Шинэ terminal:

```powershell
npm run dev
```

Demo account-ууд:

```text
МУИС Staff:   staff@num.edu.mn
МУИС Admin:   admin@num.edu.mn
МУИС Student: student@num.edu.mn
ШУТИС Staff:  staff@must.edu.mn
ШУТИС Admin:  admin@must.edu.mn
ШУТИС Student: student@must.edu.mn
Password:     SEED_ROLE_PASSWORD-ын утга
```

## 2. Event registration ба waitlist demo

### Алхам A — Staff event үүсгэх

1. `staff@num.edu.mn`-ээр нэвтэрнэ.
2. Event/content management хэсэгт шинэ event үүсгэнэ.
3. Visibility-г `NETWORK`, capacity-г `1`, registration deadline-ийг ирээдүйн огноо болгоно.
4. Event-ээ нийтэлнэ.

Багшид тайлбарлах зүйл:

> Event-ийн capacity, visibility, deadline болон owner нь backend/database-д хадгалагдаж байна.

### Алхам B — Эхний Student бүртгүүлэх

1. Logout хийнэ.
2. `student@num.edu.mn`-ээр нэвтэрнэ.
3. Үүсгэсэн event-ээ нээгээд бүртгүүлнэ.

Хүлээгдэх үр дүн:

```text
REGISTERED
```

Database status нь `CONFIRMED`, харин demo UI/API дээр ойлгомжтой байлгахын тулд `REGISTERED` гэж харагдана.

### Алхам C — Хоёр дахь Student waitlist-д орох

1. Logout хийнэ.
2. `student@must.edu.mn`-ээр нэвтэрнэ.
3. Ижил NETWORK event-д бүртгүүлнэ.

Capacity дүүрсэн тул:

```text
WAITLISTED
```

болно.

### Алхам D — Staff registration management харах

1. `staff@num.edu.mn`-ээр дахин нэвтэрнэ.
2. `Бүртгэлүүд` хэсэгт орно.
3. Event filter, status filter, search болон pagination-ийг ашиглана.

Харагдах зүйлс:

- эхний Student — `REGISTERED`;
- хоёр дахь Student — `WAITLISTED`;
- зөвхөн тухайн Staff-ийн өөрийн үүсгэсэн event-ийн registration-ууд.

### Алхам E — Automatic waitlist promotion

1. `student@num.edu.mn`-ээр орж event registration-аа цуцална.
2. `student@must.edu.mn`-ээр дахин орж мэдэгдлээ шалгана.
3. Staff registration page-ийг refresh хийнэ.

Хүлээгдэх үр дүн:

```text
эхний Student → CANCELLED
хоёр дахь Student → REGISTERED
```

Backend transaction нь сул орон гармагц waitlist-ийн эхний Student-ийг автоматаар дэвшүүлж, үлдсэн waitlist position-уудыг шинэчилнэ. Дэвшсэн Student-д notification болон optional email үүснэ.

### Алхам F — Ирц батлах

1. Staff registration page дээр дэвшсэн Student-ийн `Ирц батлах` үйлдлийг дарна.
2. Төлөв `ATTENDED` болсон эсэхийг харна.
3. Student account-аар орж notification-оо шалгана.
4. University Admin → Audit Log хэсгээс attendance event-ийг харна.

Багшид тайлбарлах зүйл:

> Attendance mutation нь permission, tenant, content ownership, одоогийн төлөв болон idempotency key-г backend дээр шалгаж байж transaction-аар хадгалагддаг.

## 3. Internship/job application demo

### Алхам A — Staff opportunity үүсгэх

1. `staff@num.edu.mn`-ээр нэвтэрнэ.
2. Internship эсвэл Job content үүсгэнэ.
3. Visibility-г `NETWORK` болгоод publish хийнэ.

### Алхам B — Student өргөдөл илгээх

1. `student@num.edu.mn` эсвэл `student@must.edu.mn`-ээр нэвтэрнэ.
2. Opportunity-г нээнэ.
3. Profile CV upload эсвэл зөвшөөрөгдсөн CV URL ашиглана.
4. Application илгээнэ.

Хүлээгдэх эхний төлөв:

```text
SUBMITTED
```

### Алхам C — Staff application management

1. `staff@num.edu.mn`-ээр орно.
2. `Өргөдлүүд` хэсэгт орно.
3. Search, status filter, opportunity filter болон pagination ашиглана.
4. Application detail нээнэ.

Detail modal дээр:

- Student-ийн нэр, email, Student ID, сургууль;
- opportunity мэдээлэл;
- зөвшөөрөгдсөн CV download;
- application status history;
- зөвхөн server-аас зөвшөөрсөн дараагийн үйлдлүүд

харагдана.

### Алхам D — Status state machine

UI дээр дараах зөв дарааллаар өөрчилнө:

```text
SUBMITTED
→ UNDER_REVIEW
→ SHORTLISTED
→ ACCEPTED
```

эсвэл зөвшөөрөгдсөн үе дээр:

```text
SUBMITTED / UNDER_REVIEW / SHORTLISTED
→ REJECTED
```

UI нь зөвшөөрөгдөөгүй товчийг харуулахгүй. Backend рүү буруу үсрэлт очсон тохиолдолд `409 Conflict`-оор хориглоно. Status бүрийн дараа reason бичиж хадгална.

### Алхам E — Student notification ба history

1. Student account-аар дахин нэвтэрнэ.
2. Application status notification-уудыг харна.
3. `Миний өргөдлүүд` хэсэгт эцсийн төлөв шинэчлэгдсэн эсэхийг шалгана.
4. Staff detail modal дээр status history нь мөр тус бүрээр нэмэгдэж, өмнөх мөрүүд өөрчлөгдөөгүйг харуулна.

Багшид тайлбарлах зүйл:

> Backend status mutation бүрийг transaction-аар хийж, immutable history, Student notification, audit event болон optional email үүсгэдэг.

## 4. Tenant ба ownership security demo

### Өөр Staff-ийн өгөгдөл

1. МУИС Staff A event/opportunity үүсгэнэ.
2. Өөр Staff account-аар орно.
3. Registration/Application management жагсаалтыг шалгана.

Staff B-д Staff A-ийн item-ууд харагдахгүй. Staff route нь creator-scoped.

### Өөр сургуулийн Admin

1. МУИС-ийн event/application үүсгэсэн байна.
2. `admin@must.edu.mn`-ээр орно.
3. Registration/Application management жагсаалтыг шалгана.

ШУТИС Admin-д МУИС-ийн operational management data харагдахгүй. University Admin route нь tenant-scoped.

### CV authorization

Application detail дэх CV-г зөвхөн:

- тухайн application-ийн Student;
- opportunity-г үүсгэсэн Staff;
- тухайн tenant-ийн University Admin

татаж чадна. Өөр Staff эсвэл өөр tenant CV URL/ID-г мэдсэн ч backend access-ийг хориглоно.

## 5. Audit Log дээр үзүүлэх event-үүд

University Admin-ийн Audit Log хэсгээс:

```text
EVENT_REGISTRATION_CREATED
EVENT_REGISTRATION_CANCELLED
WAITLIST_PROMOTED
EVENT_ATTENDANCE_CONFIRMED
APPLICATION_SUBMITTED
APPLICATION_STATUS_CHANGED
APPLICATION_WITHDRAWN
```

зэрэг event-үүдийг хайж харуулна. Event-ийн actor, university, resource, severity, өмнөх/шинэ утга болон timestamp харагдана.

## 6. Resend email delivery тохируулах

`.env`-д нууц түлхүүрийг repository-д commit хийхгүйгээр оруулна:

```env
EMAIL_DELIVERY_MODE=resend
EMAIL_FROM=no-reply@YOUR_VERIFIED_DOMAIN
RESEND_API_KEY=re_your_private_api_key
RESEND_API_URL=https://api.resend.com/emails
RESEND_REPLY_TO=support@YOUR_VERIFIED_DOMAIN
```

Backend-ээ restart хийнэ:

```powershell
npm run server:dev
```

Phase 5D-д дараах email template/trigger бэлэн:

- application status өөрчлөгдөх;
- attendance батлагдах;
- waitlist-аас registration руу дэвших;
- өмнөх verification, invitation, password reset flow.

Local demo дээр бодит email шаардахгүй бол:

```env
EMAIL_DELIVERY_MODE=console
```

гэж үлдээхэд email payload backend terminal дээр харагдана.

## 7. Багшид 7 минутын товч demo

```text
1. Staff NETWORK event capacity=1 үүсгэнэ.
2. МУИС Student бүртгүүлж REGISTERED болно.
3. ШУТИС Student бүртгүүлж WAITLISTED болно.
4. Эхний Student цуцлахад хоёр дахь нь автоматаар REGISTERED болно.
5. Staff Registration page-ээс attendance батална.
6. Student NETWORK internship-д application илгээнэ.
7. Staff SUBMITTED → UNDER_REVIEW → SHORTLISTED → ACCEPTED болгоно.
8. Student notification авсныг үзүүлнэ.
9. University Admin Audit Log дээр бүх үйлдлийг харуулна.
10. Өөр tenant/өөр Staff-д эдгээр management data харагдахгүйг харуулна.
```

## 8. Demo-г бүрэн баталгаажуулах Windows команд

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
npm run test:phase5d-smoke
npm test
npm run test:integration
npm run lint
npm run type-check
npm run build
```

Эдгээр командын амжилттай output-ийг screenshot эсвэл текст log болгон дипломын нотолгоонд хадгална.
