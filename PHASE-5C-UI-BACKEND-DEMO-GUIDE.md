# Phase 5C — Backend feature-үүдийг frontend-ээр шалгах заавар

## 1. Local environment

Phase 5C-ийн `.env` дотор наад зах нь:

```env
EMAIL_VERIFICATION_ENABLED=false
SEED_ROLE_USERS=true
SEED_ROLE_PASSWORD=ChangeMe!2026Local
SEED_SUPER_ADMIN_EMAIL=superadmin@uninet.local
```

`SEED_ROLE_PASSWORD`-д өөрийн local demo password тавьж болно. Бүх seeded Student, Staff, University Admin account ижил утгыг ашиглана.

Ажиллуулах:

```powershell
npm install
npm run db:generate
docker compose up -d postgres redis
npm run db:deploy
npm run db:seed
npm run server:dev
```

Шинэ terminal:

```powershell
npm run dev
```

## 2. Demo account-ууд

| Сургууль | Student | Staff | University Admin |
|---|---|---|---|
| МУИС | `student@num.edu.mn` | `staff@num.edu.com` | `admin@num.edu.mn` |
| ШУТИС | `student@must.edu.mn` | `staff@must.edu.mn` | `admin@must.edu.mn` |
| МУБИС | `student@msue.edu.mn` | `staff@msue.edu.mn` | `admin@msue.edu.mn` |
| АШУҮИС | `student@mnums.edu.mn` | `staff@mnums.edu.mn` | `admin@mnums.edu.mn` |
| ХААИС | `student@muls.edu.mn` | `staff@muls.edu.mn` | `admin@muls.edu.mn` |

Password нь `.env`-ийн `SEED_ROLE_PASSWORD`.

## 3. Зургаан оронтой код алгасаж байгааг шалгах

1. Frontend-ийн бүртгүүлэх хуудсыг нээнэ.
2. Шинэ, давтагдаагүй сургуулийн email ашиглана. Жишээ: `pending.demo@num.edu.mn`.
3. Бүртгэлээ илгээнэ.
4. Зургаан оронтой кодын дэлгэц гарахгүй.
5. Roster-д мөр байхгүй тул `PENDING_REVIEW` дэлгэц гарна.

Энэ нь verification-ийг бүр мөсөн устгасан гэсэн үг биш. Local/demo дээр feature flag-аар түр алгассан; production дээр заавал асаалттай байна.

## 4. Tenant isolation-ийг frontend-ээр шалгах

1. `admin@num.edu.mn`-ээр нэвтэрнэ.
2. `Оюутнууд -> Хянах хүсэлт` рүү орно.
3. `pending.demo@num.edu.mn` харагдана.
4. Logout хийгээд `admin@must.edu.mn`-ээр орно.
5. Тэр МУИС-ийн pending account харагдах ёсгүй.

Ингэснээр нэг сургуулийн Admin өөр сургуулийн pending Student-ийг жагсаалтаас авахгүй байгааг харуулна.

## 5. Roster import -> Student approve урсгал

1. `admin@num.edu.mn`-ээр нэвтэрнэ.
2. `Оюутнууд -> Roster импорт` tab-ийг нээнэ.
3. `Template татах` дарна.
4. CSV-д `pending.demo@num.edu.mn`-ийг `STUDENT`, `ACTIVE` төлөвтэй, давтагдаагүй Student ID-тай нэмнэ.
5. Файлыг сонгоод `Preview хийх` дарна.
6. Алдаатай бол `Алдааны CSV` татаж мөр бүрийн шалтгааныг харна.
7. Алдаагүй бол `Commit хийх` дарна.
8. `Хянах хүсэлт` tab руу буцаж Student-ийг `Батлах` хийнэ.
9. Logout хийгээд шинээр батлагдсан Student email/password-аар login хийнэ.

Энд CSV preview, row validation, transaction commit, tenant roster, approve policy, audit болон session/status flow хамт ажиллана.

## 6. Membership болон roster export

University Admin-аар:

- `Оюутнууд -> Бүх оюутан` дээр filter тавиад download icon дарна.
- `Staff` жагсаалт дээр filter тавиад download icon дарна.
- `Оюутнууд -> Roster импорт` дээр `Roster CSV` дарна.

Татагдсан CSV нь зөвхөн тухайн сургуулийн өгөгдөлтэй байна. Export үйлдэл audit log-д хадгалагдана.

## 7. Survey permission ба visibility

### Permission

1. University Admin -> Staff хэрэглэгчийн permission дээр `Судалгаа удирдах` эрхийг унтраана.
2. Staff account-аар дахин login хийнэ.
3. Судалгаа үүсгэхэд backend permission error өгнө.
4. Permission-ийг асааж, Staff-ийг дахин login хийлгэсний дараа үүсгэх боломжтой болно.

### PRIVATE

1. МУИС Staff `PRIVATE` survey үүсгэж нийтэлнэ.
2. `student@num.edu.mn` survey-г харна.
3. `student@must.edu.mn` survey-г харах ёсгүй.

### NETWORK

1. Staff `NETWORK` survey нийтэлнэ.
2. Өөр идэвхтэй сургуулийн Student survey-г харж бөглөж чадна.

### PARTNERS

1. Идэвхтэй partnership байхгүй үед `PARTNERS` survey нийтлэхэд backend хориглоно.
2. Admin-ийн түншлэлийн flow-оор ACTIVE partnership бэлэн болгосны дараа түнш сургуулийн Student survey-г харна.
3. Түнш биш сургуулийн Student харахгүй.

## 8. Survey lifecycle ба database behavior

Staff frontend-ээс:

```text
DRAFT -> edit -> PUBLISHED -> Student response -> report -> CLOSED -> REOPENED -> ARCHIVED
```

урсгалыг шалгана. Нэг Student ижил survey-г хоёр удаа бөглөхөд backend давхардлыг хориглоно. Staff-ийн `Судалгааны хариулт` дэлгэц дээр aggregate болон CSV report гарна.

## 9. Багшид харуулах 7 минутын demo

1. МУИС Admin болон ШУТИС Admin account тусдаа tenant-д орж байгааг харуулах.
2. Шинэ Student бүртгэж, кодын дэлгэцгүйгээр `PENDING_REVIEW` болсныг харуулах.
3. ШУТИС Admin-д МУИС Student харагдахгүйг харуулах.
4. МУИС Admin-аар roster template -> preview -> commit -> approve хийх.
5. Student login амжилттай болсныг харуулах.
6. Staff survey үүсгэж visibility сонгох.
7. Өөр сургуулийн Student-аар PRIVATE/NETWORK reach-ийн ялгааг харуулах.
8. Audit Log дээр import, approve, export, survey үйлдлүүд бүртгэгдсэнийг харуулах.

Frontend-ийн UI нь үйлдлийг эхлүүлнэ; backend ажиллаж байгааг tenant-аар ялгаатай үр дүн, status transition, хориглосон permission, database-д хадгалагдсан жагсаалт, audit log-оор нотолно.
