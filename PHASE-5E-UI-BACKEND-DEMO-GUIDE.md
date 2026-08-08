# Phase 5E — Frontend-ээр backend ажиллаж байгааг үзүүлэх заавар

Энэ demo нь UI харагдаж байгааг бус, **frontend action → backend authorization/transaction → PostgreSQL persistence → notification/audit** гэсэн бүтэн урсгалыг харуулна.

## 1. Demo орчныг бэлтгэх

`.env` дээр:

```env
NODE_ENV=development
EMAIL_VERIFICATION_ENABLED=false
SEED_ROLE_USERS=true
SEED_ROLE_PASSWORD=өөрийн-local-demo-password
SEED_SUPER_ADMIN_EMAIL=superadmin@uninet.local
DEMO_RESET_CONFIRM=RESET_UNINET_DEMO
```

Demo database-ийг цэвэр deterministic өгөгдөлтэй сэргээх нь өмнөх demo өгөгдлийг устгана. Зөвхөн local database дээр:

```powershell
npm install
npm run db:generate
docker compose up -d postgres redis minio minio-init clamav
npm run db:demo-reset
npm run server:dev
```

Шинэ terminal:

```powershell
npm run dev
```

Demo account-уудын password нь `.env`-ийн `SEED_ROLE_PASSWORD`.

```text
МУИС Student: student@num.edu.mn
МУИС Staff:   staff@num.edu.mn
МУИС Admin:   admin@num.edu.mn
ШУТИС Student: student@must.edu.mn
ШУТИС Admin:   admin@must.edu.mn
Platform Super Admin: superadmin@uninet.local
```

## 2. Event registration ба attendance backend

1. `student@num.edu.mn`-ээр нэвтэрнэ.
2. **Миний бүртгэлүүд** хэсэгт `Final MVP Backend Demo Event` database-аас харагдана.
3. Logout хийгээд `staff@num.edu.mn`-ээр орно.
4. **Бүртгэлүүд** хэсэгт Student, event, `REGISTERED` status харагдана.
5. `Ирц батлах` үйлдлийг дарна.
6. Дахин refresh хийхэд status `ATTENDED` болно.
7. Student-аар буцаж ороход attendance notification ирсэн байна.
8. Admin → **Audit Log** дээр attendance action харагдана.

**Багшид хэлэх тайлбар:** Staff-ийн frontend товч backend-д очиход permission, tenant, ownership, current status шалгаад transaction-аар attendance хадгалж, notification болон audit үүсгэдэг.

## 3. Application state machine

1. `staff@num.edu.mn` → **Өргөдлүүд**.
2. `Final MVP Full-stack Internship`-ийн `SUBMITTED` application-ийг нээнэ.
3. Student profile, CV link/metadata, immutable history-г харуулна.
4. Дарааллаар:

```text
SUBMITTED → UNDER_REVIEW → SHORTLISTED → ACCEPTED
```

5. Төлөв бүрийн дараа history-д шинэ мөр нэмэгдэж, хуучин мөр өөрчлөгдөхгүй.
6. Student account-аар ороход status notification харагдана.
7. Audit Log дээр application status actions харагдана.

**Backend evidence:** UI зөвхөн боломжит дараагийн status-уудыг харуулна; backend мөн state machine-ийг дахин шалгаж буруу үсрэлтийг `409`-өөр хориглоно.

## 4. Survey permission, visibility, response

1. Staff → **Судалгаа ба асуулга** дээр `Final MVP Student Feedback` харагдана.
2. Шинэ `PRIVATE` survey үүсгэж publish хийнэ.
3. МУИС Student survey-г харж бөглөнө.
4. ШУТИС Student-аар ороход МУИС-ийн `PRIVATE` survey харагдахгүй.
5. Staff → **Судалгааны хариулт** дээр response болон aggregate report харна.
6. Нэг Student дахин submit хийхэд backend duplicate response-ийг хориглоно.

## 5. Multi-tenant isolation

1. `admin@num.edu.mn` → Оюутнууд, Staff, registrations, applications-ийг харуулна.
2. Logout → `admin@must.edu.mn`.
3. МУИС-ийн Student/application/registration ШУТИС Admin-д харагдахгүй.
4. Багшид browser-ийн `F12 → Network` хэсэгт API response `200` боловч зөвхөн тухайн tenant-ийн rows буцаж байгааг үзүүлж болно.

## 6. Pending Student review

1. Шинэ `demo.pending@num.edu.mn` Student бүртгэнэ. Local flag-ийн улмаас 6 оронтой код алгасна.
2. Roster-д байхгүй тул `PENDING_REVIEW` болно.
3. ШУТИС Admin-ийн **Хянах хүсэлт** хэсэгт харагдахгүй.
4. МУИС Admin → Roster import → preview → commit.
5. МУИС Admin → Хянах хүсэлт → approve.
6. Student дахин login хийхэд ACTIVE dashboard нээгдэнэ.
7. Audit Log дээр roster import болон student approval харагдана.

## 7. University/domain backend workflow

1. `superadmin@uninet.local` → **Их сургуулиуд**.
2. Нэг сургуулийн `Удирдах` action дарна.
3. `phase5e-demo.example.edu.mn` шиг давтагдаагүй domain нэмнэ.
4. `Хүсэлт үүсгэх` → administrative evidence бичих → `Admin approval`.
5. Баталгаажсан domain-ийг `Primary болгох`.
6. Verified domain байхгүй шинэ university-г ACTIVE болгоход backend хориглож Монгол алдаа харуулна.
7. Verified domain-тай бол ACTIVE болгоно.
8. SUSPEND хийхэд тухайн university session-ууд revoke болно.
9. Audit Log дээр domain request/verify/primary/status action-ууд харагдана.

## 8. 403, 404, 500 дэлгэц

- **404:** Student нэвтэрсний дараа browser address дээр `/student/does-not-exist` гэж оруулна.
- **403:** Admin Staff-ийн `canManageSurveys` эсвэл workflow permission-ийг унтрааж, Staff restricted үйлдэл хийхэд backend 403 Монгол тайлбартай ирнэ.
- **500/network:** Backend terminal-ийг түр зогсоогоод dashboard refresh хийхэд retry бүхий server error дэлгэц гарна; дараа нь backend-ээ асааж `Дахин оролдох` дарна.

## 9. Demo-г дуусгах audit evidence

University Admin-ийн **Audit Log** дээр дараахыг хайж үзүүл:

```text
EVENT_ATTENDANCE_RECORDED
APPLICATION_STATUS_CHANGED
SURVEY_STATUS_CHANGED / SURVEY_RESPONSE_CREATED
STUDENT_REVIEW_APPROVED
UNIVERSITY_DOMAIN_*
UNIVERSITY_STATUS_CHANGED
```

## 10. Шалгалтын өмнөх final commands

```powershell
npm run test:phase5e-smoke
npm test
npm run test:integration
npm run lint
npm run type-check
npm run build
npm run test:e2e
```

Аль нэг command fail бол terminal log-ийг засахаас өмнө “бүрэн баталгаажсан” гэж хэлэхгүй.
