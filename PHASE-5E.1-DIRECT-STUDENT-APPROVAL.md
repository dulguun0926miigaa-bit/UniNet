# Phase 5E.1 — Direct Student Approval

## Өөрчлөлт

- University Admin-ийн `Оюутны бүртгэл батлах` dialog-оос roster member ID болон approval reason input-ийг хасав.
- `Бүртгэл батлах` дарахад frontend default audit reason-тай хүсэлт шууд илгээнэ.
- Backend тухайн tenant-ийн `PENDING_REVIEW` Student-ийг `ACTIVE` болгоно.
- Email эсвэл Student ID-аар таарах идэвхтэй roster мөр байвал автоматаар холбоно.
- Таарах roster мөр байхгүй бол `DIRECT_ADMIN_APPROVAL` mode-оор батална.
- Notification, session revoke болон `STUDENT_REVIEW_APPROVED` Audit Log хэвээр үүснэ.
- API-аар roster UUID зориуд өгсөн боловч буруу бол хуучин validation хамгаалалт хэвээр ажиллана.

## Шалгах

```powershell
npm run test:phase5e1-smoke
npm run server:dev
npm run dev
```

Frontend:

```text
University Admin → Оюутнууд → Хянах хүсэлт → Батлах → Бүртгэл батлах
```

Хүлээгдэх үр дүн: Student шууд `ACTIVE` болж жагсаалтаас алга болно.
