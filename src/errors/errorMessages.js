const CODE_MESSAGES = Object.freeze({
  UNAUTHENTICATED: "Нэвтэрч байж энэ үйлдлийг хийнэ үү.",
  GOOGLE_OAUTH_DISABLED: "Google OAuth тохиргоо идэвхжээгүй байна.",
  OAUTH_STATE_MISMATCH: "Google нэвтрэлтийн хамгаалалтын state тохирсонгүй. Дахин эхлүүлнэ үү.",
  OAUTH_PKCE_MISSING: "Google нэвтрэлтийн PKCE session олдсонгүй. Дахин эхлүүлнэ үү.",
  OAUTH_NONCE_MISMATCH: "Google identity хамгаалалтын nonce тохирсонгүй.",
  GOOGLE_AUTH_CANCELLED: "Google нэвтрэлтийг цуцаллаа. Дахин оролдож болно.",
  GOOGLE_AUTH_FAILED: "Google нэвтрэлт амжилтгүй боллоо. Дахин эхлүүлнэ үү.",
  GOOGLE_IDENTITY_INVALID: "Google identity баталгаажуулалт хүчингүй эсвэл хугацаа дууссан байна.",
  GOOGLE_ACCOUNT_NOT_LINKED: "Энэ бүртгэл Google account-тай холбогдоогүй байна.",
  LOCAL_PASSWORD_REQUIRED_BEFORE_UNLINK: "Google холбоос салгахаас өмнө local нууц үгтэй байх шаардлагатай.",
  UPSTREAM_CIRCUIT_OPEN: "Backend service түр хамгаалалтын горимд байна. Түр хүлээгээд дахин оролдоно уу.",
  UPSTREAM_TIMEOUT: "Backend-ийн дэд үйлчилгээ хариу өгөх хугацаа хэтэрлээ.",
  OAUTH_LINK_CREDENTIALS_INVALID: "Сургуулийн имэйл эсвэл нууц үг буруу байна.",
  OAUTH_LINK_TENANT_MISMATCH: "Student account болон сургуулийн домэйн тохирохгүй байна.",
  OAUTH_ACCOUNT_ALREADY_LINKED: "Энэ Student account өөр Google account-той аль хэдийн холбогдсон байна.",
  GOOGLE_ACCOUNT_ALREADY_USED: "Энэ Google account өөр UniNet бүртгэлтэй холбогдсон байна.",
  OAUTH_ACCOUNT_ALREADY_EXISTS: "Энэ сургуулийн имэйл өмнө нь бүртгэгдсэн байна. Бүртгэлтэй account-аар нэвтрэх сонголтыг ашиглана уу.",
  UNIVERSITY_DOMAIN_NOT_VERIFIED: "Энэ сургуулийн домэйн UniNet-д баталгаажаагүй байна.",
  ACCOUNT_INCOMPLETE: "Student account-ийн email эсвэл сургуулийн домэйн баталгаажуулалт дутуу байна.",
  PASSWORD_RESET_OTP_INVALID: "6 оронтой OTP код буруу эсвэл хугацаа дууссан байна.",
  PASSWORD_RESET_STUDENT_NOT_FOUND: "Идэвхтэй Student account олдсонгүй.",
  PASSWORD_RESET_OTP_DELIVERY_FAILED: "OTP код имэйлээр илгээж чадсангүй. Түр хүлээгээд дахин оролдоно уу.",
  AUTH_CHALLENGE_RATE_LIMITED: "Authenticator кодыг хэт олон удаа туршсан байна. Түр хүлээгээд дахин оролдоно уу.",
  MFA_CODE_REPLAYED: "Энэ 6 оронтой код өмнө ашиглагдсан байна. Шинэ код гарахыг хүлээнэ үү.",
  UNIVERSITY_LOGO_NOT_FOUND: "Сургуулийн upload хийсэн лого олдсонгүй.",
  FILE_STORAGE_UNAVAILABLE: "Файл хадгалах үйлчилгээ түр ажиллахгүй байна.",
  FILE_SCAN_UNAVAILABLE: "Файлын аюулгүй байдлыг шалгах үйлчилгээ түр ажиллахгүй байна.",
  FILE_SIGNATURE_MISMATCH: "Файлын бодит төрөл өргөтгөлтэй тохирохгүй байна.",
  UPSTREAM_UNAVAILABLE: "Backend-ийн нэг үйлчилгээ түр ажиллахгүй байна.",
  INVALID_ACCESS_TOKEN: "Нэвтрэх хугацаа дууссан байна. Дахин нэвтэрнэ үү.",
  FORBIDDEN: "Энэ үйлдлийг хийх эрх танд байхгүй байна.",
  PERMISSION_DENIED: "Таны role-д шаардлагатай зөвшөөрөл олгогдоогүй байна.",
  TENANT_ACCESS_DENIED: "Өөр их сургуулийн мэдээлэлд хандах боломжгүй.",
  RESOURCE_OWNERSHIP_DENIED: "Өөр ажилтны үүсгэсэн мэдээллийг удирдах эрхгүй.",
  CONTENT_CREATE_FORBIDDEN: "Контент үүсгэх зөвшөөрөл танд байхгүй.",
  CONTENT_UPDATE_FORBIDDEN: "Энэ контентыг засах эрхгүй.",
  CONTENT_DELETE_FORBIDDEN: "Энэ контентыг устгах эрхгүй.",
  CONTENT_STATUS_FORBIDDEN: "Контентын төлөв өөрчлөх эрхгүй.",
  REGISTRATION_MANAGE_FORBIDDEN: "Арга хэмжээний бүртгэл удирдах зөвшөөрөл байхгүй.",
  APPLICATION_MANAGE_FORBIDDEN: "Өргөдөл удирдах зөвшөөрөл байхгүй.",
  ATTENDANCE_MANAGE_FORBIDDEN: "Ирц баталгаажуулах эрхгүй.",
  MEMBERSHIP_FORBIDDEN: "Энэ сургуулийн гишүүнчлэлийг удирдах эрхгүй.",
  CONTENT_ACCESS_FORBIDDEN: "Энэ контентыг удирдах эрхгүй.",
  CONTENT_NOT_FOUND: "Контент олдсонгүй эсвэл танд харах эрх байхгүй.",
  SURVEY_NOT_FOUND: "Судалгаа олдсонгүй эсвэл танд харах эрх байхгүй.",
  EVENT_REGISTRATION_NOT_FOUND: "Арга хэмжээний бүртгэл олдсонгүй.",
  APPLICATION_NOT_FOUND: "Өргөдөл олдсонгүй.",
  MEMBERSHIP_NOT_FOUND: "Хэрэглэгчийн гишүүнчлэл олдсонгүй.",
  UNIVERSITY_NOT_FOUND: "Их сургуулийн мэдээлэл олдсонгүй.",
  UNIVERSITY_DOMAIN_NOT_FOUND: "Их сургуулийн домэйн олдсонгүй.",
  UNIVERSITY_VERIFIED_DOMAIN_REQUIRED: "Их сургуулийг идэвхжүүлэхийн өмнө баталгаажсан домэйн шаардлагатай.",
  VERIFIED_EMAIL_LOCKED: "Баталгаажсан их сургуулийн имэйлийг профайлаас шууд өөрчлөх боломжгүй.",
  VERIFIED_UNIVERSITY_LOCKED: "Баталгаажсан их сургуулийг профайлаас шууд өөрчлөх боломжгүй.",
  CURRENT_PASSWORD_INVALID: "Одоогийн нууц үг буруу байна.",
  DOMAIN_VERIFICATION_EVIDENCE_REQUIRED: "Домэйн баталгаажуулах нотолгоо оруулна уу.",
  PRIMARY_DOMAIN_REVOKE_FORBIDDEN: "Үндсэн домэйнийг шууд хүчингүй болгох боломжгүй.",
  ROSTER_MATCH_REQUIRED: "Оруулсан roster member ID олдсонгүй эсвэл тохирохгүй байна.",
  STUDENT_REVIEW_INVALID_STATE: "Энэ оюутны хүсэлтийг одоогийн төлөвөөс шийдвэрлэх боломжгүй.",
  APPLICATION_STATUS_TRANSITION_INVALID: "Өргөдлийн төлөвийг энэ дарааллаар өөрчлөх боломжгүй.",
  CONTENT_STATUS_TRANSITION_INVALID: "Контентын төлөвийг энэ дарааллаар өөрчлөх боломжгүй.",
  VALIDATION_ERROR: "Оруулсан мэдээллээ шалгаад дахин оролдоно уу.",
  INVALID_REQUEST: "Хүсэлтийн мэдээлэл буруу байна.",
  INVALID_JSON: "Илгээсэн JSON мэдээлэл буруу байна.",
  CONFLICT: "Өгөгдөл зэрэг өөрчлөгдсөн эсвэл давхардсан байна.",
  DEPENDENCY_UNAVAILABLE: "Шаардлагатай дэд үйлчилгээ түр ажиллахгүй байна.",
  ZOD_VALIDATION_ERROR: "Оруулсан мэдээллийн формат буруу байна.",
  API_RATE_LIMITED: "Хүсэлт хэт олон байна. Түр хүлээгээд дахин оролдоно уу.",
  SEARCH_RATE_LIMITED: "Хайлтын хүсэлт хэт олон байна. Түр хүлээнэ үү.",
  REQUEST_TIMEOUT: "Сервер хариу өгөх хугацаа хэтэрлээ.",
  NETWORK_ERROR: "Backend сервертэй холбогдож чадсангүй.",
  INTERNAL_SERVER_ERROR: "Сервер дээр түр зуурын алдаа гарлаа.",
});

export function mongolianErrorMessage(error, fallback = "Үйлдлийг гүйцэтгэж чадсангүй.") {
  if (!error) return fallback;
  if (CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code];
  if (error.status === 403) return CODE_MESSAGES.FORBIDDEN;
  if (error.status === 404) return "Хүссэн мэдээлэл олдсонгүй.";
  if (error.status >= 500) return CODE_MESSAGES.INTERNAL_SERVER_ERROR;
  return error.message || fallback;
}

export function errorScreenStatus(error) {
  if (error?.status === 403) return 403;
  if (error?.status === 404) return 404;
  if (Number(error?.status) >= 500 || error?.code === "NETWORK_ERROR") return 500;
  return null;
}
