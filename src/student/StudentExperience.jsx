import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleHelp, LogOut, MessageSquareText, Settings, UserRound } from "lucide-react";
import { studentService } from "./studentService";
import { apiRequest } from "../api/apiClient.js";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingSkeleton,
  Modal,
  OpportunityCard,
  PageHeader,
  SelectFilter,
  StatCard,
  StatusBadge,
  Tabs,
  Toast,
  VisibilityBadge,
} from "./StudentUI";
import SidebarToggleButton from "../dashboard/SidebarToggleButton";
import NotificationDropdown from "../dashboard/NotificationDropdown";
import SidebarNavIcon from "../dashboard/SidebarNavIcon";
import UniversityLogo, { normalizeUniversityName } from "../dashboard/UniversityLogo";
import SharedSettingsPage from "../settings/SettingsPage";
import HttpErrorState from "../errors/HttpErrorState.jsx";
import { errorScreenStatus, mongolianErrorMessage } from "../errors/errorMessages.js";

const routes = [
  { label: "Нүүр", path: "/student" },
  { label: "Миний сургууль", path: "/student/my-university" },
  { label: "UniNet сүлжээ", path: "/student/network" },
  { label: "Хадгалсан", path: "/student/saved" },
  { label: "Миний бүртгэлүүд", path: "/student/registrations" },
  { label: "Миний өргөдлүүд", path: "/student/applications" },
];

const typeMap = {
  "/student/events": "EVENT",
  "/student/internships": "INTERNSHIP",
  "/student/jobs": "JOB",
  "/student/announcements": "ANNOUNCEMENT",
};

function StudentSurveyField({ question, value, onChange }) {
  const normalized = typeof question === "string"
    ? { title: question, type: "PARAGRAPH", required: false, options: [] }
    : question;
  const options = normalized?.options || [];
  if (normalized?.type === "MULTIPLE_CHOICE") return <div className="mt-4 space-y-3" role="radiogroup" aria-label={normalized.title}>{options.map(option => <label key={option} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="radio" name={normalized.id} checked={value === option} onChange={() => onChange(option)} />{option}</label>)}</div>;
  if (normalized?.type === "CHECKBOXES") {
    const selected = value ? value.split("|||") : [];
    return <div className="mt-4 space-y-3" role="group" aria-label={normalized.title}>{options.map(option => <label key={option} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={selected.includes(option)} onChange={event => onChange(event.target.checked ? [...selected, option].join("|||") : selected.filter(item => item !== option).join("|||"))} />{option}</label>)}</div>;
  }
  if (normalized?.type === "DROPDOWN") return <select value={value} required={normalized.required} aria-label={normalized.title} onChange={event => onChange(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="">Сонгох...</option>{options.map(option => <option key={option}>{option}</option>)}</select>;
  if (normalized?.type === "RATING") return <div className="mt-4 flex gap-2" role="radiogroup" aria-label={normalized.title}>{[1,2,3,4,5].map(rating => <button key={rating} type="button" role="radio" aria-checked={value === String(rating)} aria-label={`${rating} / 5`} onClick={() => onChange(String(rating))} className={`h-11 w-11 rounded-full border text-sm font-bold ${value === String(rating) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200"}`}>{rating}</button>)}</div>;
  if (normalized?.type === "SHORT_TEXT") return <input value={value} required={normalized.required} aria-label={normalized.title} onChange={event => onChange(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 p-3" placeholder="Таны хариулт" />;
  return <textarea value={value} required={normalized?.required} aria-label={normalized?.title || "Таны хариулт"} onChange={event => onChange(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 p-3" rows="4" placeholder="Таны хариулт" />;
}

const pageCopy = {
  "/student/my-university": ["Миний сургууль", "Таны сургуулийн дотоод болон нийтэд хуваалцсан мэдээлэл."],
  "/student/network": ["UniNet сүлжээ", "Их сургуулиудын боломжийг нэг дороос олж мэдээрэй."],
  "/student/events": ["Арга хэмжээ", "Арга хэмжээ хайж, хадгалж, бүртгүүлээрэй."],
  "/student/internships": ["Дадлага", "Мэргэжлийн туршлага хуримтлуулах дадлагын боломжууд."],
  "/student/jobs": ["Ажлын байр", "Оюутан болон шинэ төгсөгчдөд зориулсан ажлын байр."],
  "/student/research": ["Судалгаа", "Судалгааны багт нэгдэх эсвэл асуулгад оролцох боломж."],
  "/student/announcements": ["Зарлал", "Сургууль болон UniNet-ийн албан ёсны мэдээлэл."],
  "/student/saved": ["Хадгалсан", "Таны дараа үзэхээр хадгалсан бүх контент."],
};

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("mn-MN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
}

function parseCalendarDate(value) {
  const match = String(value || "").match(/^(\d{4})[.-](\d{2})[.-](\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function daysUntil(value) {
  const date = parseCalendarDate(value);
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

function downloadCalendarEvent(item) {
  const date = String(item.date || "").replaceAll(".", "").replaceAll("-", "");
  if (!/^\d{8}$/.test(date)) return false;
  const time = String(item.time || "09:00").replace(":", "").padEnd(4, "0");
  const escapeIcs = value => String(value || "").replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UniNet//Student Event//MN", "BEGIN:VEVENT",
    `UID:${item.registrationId || item.id}@uninet`, `DTSTART:${date}T${time}00`,
    `SUMMARY:${escapeIcs(item.title)}`, `LOCATION:${escapeIcs(item.location)}`,
    `DESCRIPTION:${escapeIcs(`${item.university || "UniNet"} · ${item.status || ""}`)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `uninet-${item.registrationId || item.id}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

function contentIdOf(item) {
  return item?.contentId || item?.eventId || item?.opportunityId || item?.content?.id || item?.id;
}

function universityNameOf(value) {
  if (typeof value === "string") return value;
  return value?.shortName || value?.name || "";
}

function QrTicketContent({ registration, profile }) {
  const [ticket, setTicket] = useState(null);
  const [qrImage, setQrImage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadTicket() {
      try {
        const result = await studentService.getEventTicket(contentIdOf(registration));
        const qrModule = await import("qrcode");
        const toDataURL = qrModule.toDataURL || qrModule.default?.toDataURL;
        if (!toDataURL) throw new Error("QR үүсгэгч ачаалагдсангүй.");
        const dataUrl = await toDataURL(result.token, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 384,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (active) {
          setTicket(result);
          setQrImage(dataUrl);
        }
      } catch (reason) {
        if (active) setError(reason.message || "QR тасалбар ачаалж чадсангүй.");
      }
    }
    loadTicket();
    return () => { active = false; };
  }, [registration]);

  if (error) return <ErrorState message={error} />;
  if (!ticket || !qrImage) return <div aria-live="polite"><LoadingSkeleton variant="ticket" /></div>;
  return <>
    <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <img src={qrImage} width="240" height="240" alt={`${ticket.event.title} арга хэмжээний баталгаажсан QR тасалбар`} className="h-60 w-60" />
    </div>
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-semibold leading-relaxed text-amber-900">
      Тасалбар амжилттай авлаа. Энэхүү QR кодоо event дээр өөрийн биеэр очиж зохион байгуулагчид үзүүлж нэвтэрнэ үү. QR тасалбараа үзүүлэхгүй бол арга хэмжээнд нэвтрэх боломжгүй.
    </div>
    <dl className="mt-6 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
      <div className="flex justify-between gap-4"><dt>Оюутан</dt><dd className="text-right font-bold">{profile.lastName} {profile.firstName}</dd></div>
      <div className="flex justify-between gap-4"><dt>Сургууль</dt><dd className="text-right font-bold">{profile.university}</dd></div>
      <div className="flex justify-between gap-4"><dt>Арга хэмжээ</dt><dd className="text-right font-bold">{ticket.event.title}</dd></div>
      <div className="flex justify-between gap-4"><dt>Огноо</dt><dd className="text-right font-bold">{ticket.event.date || "—"}</dd></div>
      <div className="flex justify-between gap-4"><dt>Код</dt><dd className="break-all text-right font-mono text-xs font-bold">{ticket.registrationId}</dd></div>
      <div className="flex justify-between gap-4"><dt>Статус</dt><dd><StatusBadge value={ticket.status} /></dd></div>
    </dl>
    <a href={qrImage} download={`uninet-ticket-${ticket.registrationId}.png`} className="mt-4 block w-full rounded-xl border border-slate-200 py-3 text-center text-xs font-bold hover:bg-slate-50">QR тасалбар татах</a>
  </>;
}

function PaymentSuccessPage({ profile, navigate }) {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("eventId");
  const [state, setState] = useState({ loading: true, error: "", ticketAvailable: false, payment: null, registration: null });

  useEffect(() => {
    if (!eventId) { setState({ loading: false, error: "Event ID олдсонгүй.", ticketAvailable: false, payment: null, registration: null }); return undefined; }
    let active = true;
    let timer;
    let attempts = 0;
    const poll = async () => {
      try {
        const result = await studentService.getEventPayment(eventId);
        if (!active) return;
        const ticketAvailable = Boolean(result?.registration?.ticketAvailable);
        const terminalFailure = ["FAILED", "CANCELED", "REFUNDED"].includes(result?.payment?.status);
        const exhausted = !ticketAvailable && !terminalFailure && attempts >= 20;
        setState({ loading: !ticketAvailable && !terminalFailure && !exhausted, error: terminalFailure ? `Төлбөрийн төлөв: ${result?.payment?.status}. Тасалбар идэвхжээгүй байна.` : exhausted ? "Webhook баталгаажуулалт удааширлаа. Миний бүртгэлүүд хэсгээс төлбөрийн төлвөө дахин шалгана уу." : "", ticketAvailable, payment: result?.payment || null, registration: result?.registration || null });
        if (!ticketAvailable && !terminalFailure && attempts++ < 20) timer = window.setTimeout(poll, 1200);
      } catch (reason) {
        if (active) setState(current => ({ ...current, loading: false, error: reason.message || "Төлбөрийн төлөв шалгаж чадсангүй." }));
      }
    };
    poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [eventId]);

  return <>
    <PageHeader title="Төлбөрийн үр дүн" description="Stripe Sandbox төлбөр webhook-оор баталгаажсаны дараа QR тасалбар нээгдэнэ." />
    <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
      {state.error ? <ErrorState message={state.error} /> : state.ticketAvailable ? <>
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">✓ Төлбөр амжилттай баталгаажлаа. Таны QR тасалбар бэлэн боллоо.</div>
        <QrTicketContent registration={{ eventId, contentId: eventId, status: "CONFIRMED" }} profile={profile} />
      </> : <>
        <LoadingSkeleton variant="ticket" />
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">Stripe webhook төлбөрийг баталгаажуулж байна. Энэ хуудсыг хаахгүй түр хүлээнэ үү.</div>
        {state.payment?.status && <p className="mt-3 text-center text-xs font-bold text-slate-500">Payment status: {state.payment.status}</p>}
      </>}
      <button type="button" onClick={() => navigate("/student/registrations")} className="mt-6 w-full rounded-xl border border-slate-200 py-3 text-xs font-bold">Миний бүртгэлүүд рүү очих</button>
    </div>
  </>;
}

function HomePage({ data, savedIds, navigate, onSave, onView, onAction, onReadNotification }) {
  const recommended = data.contentItems.filter(item => item.status === "ACTIVE").slice(0, 4);
  const unread = data.notifications.filter(item => !item.read);
  return (
    <>
      <PageHeader eyebrow={`${data.studentProfile.university} · ${formatDate()}`} title={`Сайн байна уу, ${data.studentProfile.firstName} 👋`}
        description="Танд тохирох шинэ боломж, бүртгэл болон өргөдлийн мэдээлэл." />
      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard value={data.registrations.filter(item => item.status === "CONFIRMED").length} label="Удахгүй болох арга хэмжээ" />
        <StatCard value={data.applications.filter(item => !["REJECTED", "WITHDRAWN"].includes(item.status)).length} label="Идэвхтэй өргөдөл" />
        <StatCard value={savedIds.length} label="Хадгалсан боломж" />
        <StatCard value={unread.length} label="Уншаагүй мэдэгдэл" />
      </div>

      <section className="mb-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Танд санал болгох</h2>
          <button type="button" onClick={() => navigate("/student/network")} className="text-xs font-bold text-blue-600">Бүгдийг харах</button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {recommended.map(item => <OpportunityCard key={item.id} item={item} saved={savedIds.includes(item.id)} onSave={onSave} onView={onView} onAction={onAction} />)}
        </div>
      </section>

      <div className="mb-10 grid gap-6 xl:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Удахгүй болох бүртгэл</h2>
            <button type="button" onClick={() => navigate("/student/registrations")} className="text-xs font-bold text-blue-600">Бүгдийг харах</button>
          </div>
          {data.registrations.filter(item => ["CONFIRMED", "ATTENDED"].includes(item.status) && (item.pricingType !== "PAID" || item.paymentStatus === "PAID")).slice(0, 1).map(item => (
            <div key={item.id} className="card-effect rounded-2xl border border-slate-200 bg-white p-6">
              <StatusBadge value={item.status} />
              <h3 className="font-display mt-3 font-bold">{item.title}</h3>
              <p className="mt-2 text-xs text-slate-500">{item.university} · {item.date} {item.time}</p>
              <p className="mt-1 text-xs text-slate-400">{item.location}{daysUntil(item.date) != null ? ` · ${daysUntil(item.date)} хоног үлдсэн` : ""}</p>
              <div className="mt-5 flex gap-2">
                {item.pricingType === "PAID" && item.paymentStatus === "PAID" && <button type="button" onClick={() => onView({ ...item, modalType: "QR" })} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">QR тасалбар</button>}
                <button type="button" onClick={() => navigate(`/student/content/${contentIdOf(item)}`)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Дэлгэрэнгүй</button>
              </div>
            </div>
          ))}
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Сүүлийн өргөдөл</h2>
            <button type="button" onClick={() => navigate("/student/applications")} className="text-xs font-bold text-blue-600">Timeline харах</button>
          </div>
          {data.applications.slice(0, 1).map(item => (
            <div key={item.id} className="card-effect rounded-2xl border border-slate-200 bg-white p-6">
              <StatusBadge value={item.status} />
              <h3 className="font-display mt-3 font-bold">{item.title}</h3>
              <p className="mt-2 text-xs text-slate-500">{item.organization} · {item.university}</p>
              <p className="mt-1 text-xs text-slate-400">Илгээсэн: {item.appliedAt}</p>
            </div>
          ))}
        </section>
      </div>

      <section className="mb-10">
        <h2 className="font-display mb-4 text-xl font-bold">Шуурхай үйлдэл</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[["Арга хэмжээ хайх", "/student/events"], ["Дадлага үзэх", "/student/internships"], ["CV шинэчлэх", "/student/profile"], ["Миний өргөдлүүд", "/student/applications"]].map(([label, path]) => (
            <button key={label} type="button" onClick={() => navigate(path)} className="card-effect rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-700">{label}</button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Сүүлийн мэдэгдэл</h2>
          <button type="button" onClick={() => navigate("/student/notifications")} className="text-xs font-bold text-blue-600">Бүх мэдэгдлийг харах</button>
        </div>
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {data.notifications.slice(0, 4).map(item => (
            <button key={item.id} type="button" onClick={() => onReadNotification(item)} className={`block w-full p-4 text-left transition hover:bg-slate-50 ${item.read ? "" : "bg-blue-50/50"}`}>
              <div className="flex justify-between gap-4"><h3 className="text-sm font-bold">{item.title}</h3><span className="text-[10px] text-slate-400">{item.time}</span></div>
              <p className="mt-1 text-xs text-slate-500">{item.description}</p>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function DiscoveryPage({ route, data, savedIds, onSave, onView, onAction }) {
  const [search, setSearch] = useState("");
  const [university, setUniversity] = useState("ALL");
  const [visibility, setVisibility] = useState("ALL");
  const [view, setView] = useState("grid");
  const [researchTab, setResearchTab] = useState("RESEARCH");
  const [contentTab, setContentTab] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [title, description] = pageCopy[route];

  const items = useMemo(() => {
    let result = data.contentItems;
    if (route === "/student/my-university") result = result.filter(item => item.university === data.studentProfile.university);
    if (route === "/student/network") result = result.filter(item => item.university !== data.studentProfile.university && ["PARTNERS", "NETWORK", "PUBLIC"].includes(item.visibility));
    if (typeMap[route]) result = result.filter(item => item.type === typeMap[route]);
    if (route === "/student/research") result = result.filter(item => item.type === researchTab);
    if (route === "/student/saved") result = result.filter(item => savedIds.includes(item.id));
    if (contentTab !== "ALL") result = result.filter(item => item.type === contentTab);
    if (university !== "ALL") result = result.filter(item => item.university === university);
    if (visibility !== "ALL") result = result.filter(item => item.visibility === visibility);
    if (status !== "ALL") result = result.filter(item => item.status === status);
    if (search) result = result.filter(item => `${item.title} ${item.shortDescription} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
    return result;
  }, [contentTab, data, researchTab, route, savedIds, search, status, university, visibility]);

  const allTypeTabs = ["ALL", "EVENT", "INTERNSHIP", "JOB", "RESEARCH", "ANNOUNCEMENT"];
  const currentUniversity = data.universities.find(
    item => item.name === data.studentProfile.university,
  );
  return (
    <>
      <PageHeader breadcrumb="Student Dashboard / Мэдээлэл" eyebrow={route === "/student/network" ? "Зөвшөөрөгдсөн контент" : undefined}
        title={title} description={description}
        actions={route === "/student/my-university" && currentUniversity?.website && <a href={currentUniversity.website} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Албан ёсны сайт</a>} />

      {route === "/student/my-university" && (
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="font-display font-bold">{data.studentProfile.university}</h2>
          <p className="mt-1 text-sm text-blue-800">{currentUniversity?.description || "Таны сургуулийн мэдээлэл"} · {data.studentProfile.department} · {data.studentProfile.major}</p>
        </div>
      )}

      {route === "/student/research" && <Tabs tabs={[{ value: "RESEARCH", label: "Судалгааны боломж" }, { value: "SURVEY", label: "Асуулга" }]} active={researchTab} onChange={setResearchTab} />}
      {["/student/my-university", "/student/saved", "/student/announcements"].includes(route) && (
        <Tabs tabs={allTypeTabs.map(value => ({ value, label: value === "ALL" ? "Бүгд" : value }))} active={contentTab} onChange={setContentTab} />
      )}

      <FilterBar search={search} onSearch={setSearch} view={view} onView={setView}>
        <SelectFilter label="Сургууль" value={university} onChange={setUniversity} options={data.universities.map(item => item.name)} />
        <SelectFilter label="Visibility" value={visibility} onChange={setVisibility} options={["PRIVATE", "PARTNERS", "NETWORK", "PUBLIC"]} />
        <SelectFilter label="Төлөв" value={status} onChange={setStatus} options={["ACTIVE", "EXPIRED"]} />
      </FilterBar>

      {items.length === 0 ? <EmptyState title="Таны хайлтад тохирох үр дүн олдсонгүй." description="Шүүлтүүрээ өөрчлөөд дахин хайна уу." />
        : <div className={view === "grid" ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
          {items.map(item => <OpportunityCard key={item.id} item={item} saved={savedIds.includes(item.id)} onSave={onSave} onView={onView} onAction={onAction} list={view === "list"} />)}
        </div>}
    </>
  );
}

function RegistrationsPage({ registrations, onQr, onPay, onCancel, onCalendar }) {
  const [openedAt] = useState(Date.now);
  const visible = registrations.filter(item => {
    if (item.status === "CANCELLED") return false;
    const expiresAt = Date.parse(item.ticketExpiresAt || "");
    return !Number.isFinite(expiresAt) || expiresAt > openedAt;
  });
  return (
    <>
      <PageHeader title="Миний бүртгэлүүд" description="Арга хэмжээний бүртгэл, waitlist болон QR тасалбараа удирдана." />
      <div className="mb-4 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Удахгүй болох</div>
      <div className="space-y-4">
        {visible.length ? visible.map(item => (
          <article key={item.id} className="card-effect rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><StatusBadge value={item.status} /><h2 className="font-display mt-3 text-lg font-bold">{item.title}</h2><p className="mt-2 text-xs text-slate-500">{item.university} · {item.date} {item.time} · {item.location}</p></div>
              <div className="flex flex-wrap gap-2">
                {(["CONFIRMED", "ATTENDED"].includes(item.status) && item.pricingType === "PAID" && item.paymentStatus === "PAID")
                  ? <button type="button" onClick={() => onQr(item)} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">QR тасалбар</button>
                  : item.pricingType === "PAID" && ["PAYMENT_PENDING", "CONFIRMED"].includes(item.status)
                    ? <button type="button" onClick={() => onPay(item)} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white">{Number(item.priceAmount || 0).toLocaleString()} ₮ төлөх</button>
                    : null}
                <button type="button" onClick={() => onCalendar(item)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Календарьт нэмэх</button>
                <button type="button" onClick={() => onCancel(item)} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Цуцлах</button>
              </div>
            </div>
            {item.waitlistPosition && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs font-bold text-amber-700">Waitlist байр: {item.waitlistPosition}</p>}
          </article>
        )) : <EmptyState title="Энэ төлөвт бүртгэл алга." />}
      </div>
    </>
  );
}

function ApplicationsPage({ applications, onWithdraw, onView }) {
  const [tab, setTab] = useState("ALL");
  const visible = applications.filter(item => tab === "ALL" || item.kind === tab || item.status === tab);
  return (
    <>
      <PageHeader title="Миний өргөдлүүд" description="Дадлага болон ажлын байрны өргөдлийн явц, ашигласан CV, timeline-аа хянана." />
      <Tabs tabs={[{ value: "ALL", label: "Бүгд" }, { value: "INTERNSHIP", label: "Дадлага" }, { value: "JOB", label: "Ажлын байр" }, { value: "UNDER_REVIEW", label: "Шалгаж байгаа" }, { value: "ACCEPTED", label: "Тэнцсэн" }, { value: "REJECTED", label: "Татгалзсан" }]} active={tab} onChange={setTab} />
      <div className="space-y-4">
        {visible.length ? visible.map(item => (
          <article key={item.id} className="card-effect rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><StatusBadge value={item.status} /><h2 className="font-display mt-3 text-lg font-bold">{item.title}</h2><p className="mt-2 text-xs text-slate-500">{item.organization} · {item.university} · {item.appliedAt}</p><p className="mt-1 text-xs text-slate-400">CV: {item.cv}</p></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => onView({ ...item, modalType: "TIMELINE" })} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">Timeline</button>
                <button type="button" onClick={() => onWithdraw(item)} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Буцаан татах</button>
              </div>
            </div>
          </article>
        )) : <EmptyState title="Энэ төлөвт өргөдөл алга." />}
      </div>
    </>
  );
}

function SecureAvatar({ asset, fallback }) {
  const [preview, setPreview] = useState({ id: null, source: "" });
  useEffect(() => {
    if (!asset?.id) return undefined;
    let active = true;
    let objectUrl = "";
    studentService.downloadFile(asset.id).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setPreview({ id: asset.id, source: objectUrl });
    }).catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset?.id]);
  if (preview.id === asset?.id && preview.source) return <img src={preview.source} alt="Профайл зураг" className="h-16 w-16 rounded-full object-cover" />;
  return <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 font-display text-xl font-bold text-blue-700">{fallback}</div>;
}

function StudentNotificationsPage({ notifications, onOpen, onMarkAll }) {
  const unread = notifications.filter(item => !item.read).length;
  return <>
    <PageHeader title="Мэдэгдэл" description="Мэдэгдэл дээр дарахад холбогдох арга хэмжээ, бүртгэл, өргөдөл эсвэл тохиргооны хэсэг шууд нээгдэнэ." actions={unread > 0 ? <button type="button" onClick={onMarkAll} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700">Бүгдийг уншсан болгох</button> : null} />
    <div className="space-y-3">
      {!notifications.length && <EmptyState title="Одоогоор мэдэгдэл алга." />}
      {notifications.map(item => <button key={item.id} type="button" onClick={() => onOpen(item)} className={`block w-full rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg ${item.read ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50/60"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-display font-bold text-slate-900">{item.title}</h2>{!item.read && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold text-white">ШИНЭ</span>}</div><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{item.description}</p></div><span className="text-[10px] font-semibold text-slate-400">{item.time}</span></div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] font-bold"><span className="text-slate-400">{item.university || "UniNet"}</span><span className="text-blue-600">Нээх →</span></div>
      </button>)}
    </div>
  </>;
}

function ProfilePage({ profile, setProfile, registrations, applications, completedSurveyCount, savedCount, onToast }) {
  const [editing, setEditing] = useState(false);
  const toggleEdit = async () => {
    if (!editing) { setEditing(true); return; }
    try {
      const payload = await apiRequest("/auth/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          phone: profile.phone || "",
          university: profile.university,
          department: profile.department || "",
          major: profile.major || "",
          studentId: profile.studentId || "",
          enrollmentYear: profile.enrollmentYear || "",
          graduationYear: profile.graduationYear || "",
          about: profile.about || "",
          cv: profile.cv || "",
          portfolio: profile.portfolio || "",
          github: profile.github || "",
          linkedin: profile.linkedin || "",
        }),
      });
      setProfile(current => ({ ...current, ...payload.profile }));
      setEditing(false);
      onToast("Профайл database-д хадгалагдлаа.");
    } catch (reason) { onToast(reason.message); }
  };
  return (
    <>
      <PageHeader title="Профайл" description="Хувийн, академик болон карьерын мэдээллээ удирдана."
        actions={<button type="button" onClick={toggleEdit} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">{editing ? "Хадгалах" : "Засах"}</button>} />
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-5"><SecureAvatar asset={profile.avatarFile} fallback={`${profile.firstName?.[0] || ""}${profile.lastName?.[0] || ""}`.toUpperCase()} /><div className="flex-1"><h2 className="font-display text-xl font-bold">{profile.lastName} {profile.firstName}</h2><p className="text-sm text-slate-500">{profile.university} · {profile.department} · {profile.major}</p><div className="mt-3 h-2 max-w-sm rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${profile.completion}%` }} /></div><p className="mt-1 text-[10px] text-slate-400">Профайл {profile.completion}% бүрэн</p></div></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[
          ["Хувийн мэдээлэл", [["Овог", "lastName"], ["Нэр", "firstName"], ["Имэйл", "email"], ["Утас", "phone"]]],
          ["Академик мэдээлэл", [["Сургууль", "university"], ["Салбар сургууль", "department"], ["Мэргэжил", "major"], ["Оюутны ID", "studentId"], ["Элсэх он", "enrollmentYear"], ["Төгсөх он", "graduationYear"]]],
        ].map(([title, fields]) => (
          <section key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-display mb-4 font-bold">{title}</h2>
            <div className="space-y-4">{fields.map(([label, key]) => {
              const locked = key === "email" || key === "university";
              return <label key={key} className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">{label}{locked ? " · баталгаажсан" : ""}</span><input disabled={!editing || locked} value={profile[key]} onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" /></label>;
            })}</div>
          </section>
        ))}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="font-display mb-4 font-bold">Карьерын профайл</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Танилцуулга</span><textarea disabled={!editing} value={profile.about || ""} onChange={event => setProfile(current => ({ ...current, about: event.target.value }))} rows="4" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" /></label>
            {[["CV холбоос (fallback)", "cv"], ["Portfolio", "portfolio"], ["GitHub", "github"], ["LinkedIn", "linkedin"]].map(([label, key]) => <label key={key} className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">{label}</span><input type="url" disabled={!editing} value={profile[key] || ""} onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} placeholder="https://..." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" /></label>)}
          </div>
        </section>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4"><StatCard value={registrations.length} label="Бүртгэл" /><StatCard value={applications.length} label="Өргөдөл" /><StatCard value={completedSurveyCount} label="Бөглөсөн судалгаа" /><StatCard value={savedCount} label="Хадгалсан" /></div>
    </>
  );
}

// Legacy settings UI retained until the shared settings migration is fully stabilized.
// eslint-disable-next-line no-unused-vars
function SettingsPage({ onLogout, consentHistory, onToast, onDanger }) {
  const [group, setGroup] = useState("ACCOUNT");
  const [preferences, setPreferences] = useState({ inApp: true, email: true, event: true, application: true, survey: false, announcement: true });
  const groups = [{ value: "ACCOUNT", label: "Account" }, { value: "SECURITY", label: "Security" }, { value: "NOTIFICATIONS", label: "Мэдэгдэл" }, { value: "PRIVACY", label: "Нууцлал" }, { value: "APPEARANCE", label: "Харагдац" }];
  return (
    <>
      <PageHeader title="Тохиргоо" description="Бүртгэл, аюулгүй байдал, нууцлал болон notification тохиргоо." />
      <Tabs tabs={groups} active={group} onChange={setGroup} />
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        {group === "ACCOUNT" && <div className="space-y-4"><h2 className="font-display font-bold">Account</h2><label className="block text-xs font-bold">Хэл<select className="mt-2 block w-full rounded-lg border border-slate-200 p-3"><option>Монгол</option><option>English</option></select></label><label className="block text-xs font-bold">Timezone<select className="mt-2 block w-full rounded-lg border border-slate-200 p-3"><option>Asia/Ulaanbaatar</option></select></label></div>}
        {group === "SECURITY" && <div className="space-y-4"><h2 className="font-display font-bold">Аюулгүй байдал</h2><button type="button" onClick={() => onToast("Нууц үг солих хүсэлт нээгдлээ.")} className="rounded-lg border border-slate-200 px-4 py-3 text-xs font-bold">Нууц үг солих</button><div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">2FA — backend холбогдсоны дараа идэвхжинэ.</div><button type="button" onClick={onLogout} className="rounded-lg border border-rose-200 px-4 py-3 text-xs font-bold text-rose-600">Бүх төхөөрөмжөөс гарах</button></div>}
        {group === "NOTIFICATIONS" && <div><h2 className="font-display mb-4 font-bold">Notification preference</h2><div className="space-y-3">{Object.entries(preferences).map(([key, value]) => <label key={key} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm font-semibold"><span>{key}</span><input type="checkbox" checked={value} onChange={() => setPreferences(current => ({ ...current, [key]: !current[key] }))} /></label>)}</div></div>}
        {group === "PRIVACY" && <div><h2 className="font-display mb-4 font-bold">Нууцлал ба зөвшөөрөл</h2><label className="flex items-center justify-between border-b border-slate-100 py-3 text-sm">CV-г зөвхөн өргөдөл илгээх үед хуваалцах <input type="checkbox" defaultChecked /></label><h3 className="mt-6 text-xs font-bold uppercase text-slate-400">Consent history</h3>{consentHistory.map(item => <div key={item.id} className="mt-3 rounded-lg bg-slate-50 p-3 text-xs"><b>{item.action}</b><p className="mt-1 text-slate-500">{item.fields} · {item.date}</p></div>)}</div>}
        {group === "APPEARANCE" && <div><h2 className="font-display mb-4 font-bold">Харагдац</h2><div className="grid grid-cols-3 gap-3">{["Light", "Dark", "System"].map(item => <button key={item} type="button" onClick={() => onToast(`${item} харагдац сонгогдлоо.`)} className="rounded-xl border border-slate-200 p-4 text-xs font-bold">{item}</button>)}</div><div className="mt-8 border-t border-rose-100 pt-6"><h3 className="font-display font-bold text-rose-700">Account actions</h3><div className="mt-3 flex gap-2"><button type="button" onClick={() => onDanger("deactivate")} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Идэвхгүй болгох</button><button type="button" onClick={() => onDanger("delete")} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white">Устгах</button></div></div></div>}
      </section>
    </>
  );
}

export default function StudentExperience({ user, onLogout, GlobalStyles }) {
  const [route, setRoute] = useState(() => {
    const eventMatch = window.location.pathname.match(/^\/event\/([0-9a-f-]{36})\/?$/i);
    const initial = eventMatch ? `/student/content/${eventMatch[1]}` : window.location.pathname.startsWith("/student") ? window.location.pathname : "/student";
    if (eventMatch) window.history.replaceState({}, "", initial);
    return initial;
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showAllMenu, setShowAllMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [savedIds, setSavedIds] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState(null);
  const [selected, setSelected] = useState(null);
  const [flow, setFlow] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState("");
  const [surveyStep, setSurveyStep] = useState(1);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [surveyAnswers, setSurveyAnswers] = useState([]);
  const drawerRef = useRef(null);
  const toggleRef = useRef(null);
  const profileTriggerRef = useRef(null);
  const profileMenuRef = useRef(null);
  const profileCloseTimerRef = useRef(null);
  const profileMenuId = useId();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await studentService.getBootstrap();
      const accountProfile = user.studentProfile || {};
      const backendProfile = result.studentProfile || {};
      const email = backendProfile.email || user.email || "";
      const emailDomain = email.split("@")[1]?.toLowerCase();
      const domainUniversity = result.universities.find(item => (
        item.domain?.toLowerCase() === emailDomain
        || item.domains?.some(domain => (domain.domain || domain).toLowerCase() === emailDomain)
      ));
      const backendUniversity = universityNameOf(backendProfile.university) || backendProfile.universityName;
      const accountUniversity = backendUniversity
        || universityNameOf(user.university)
        || (user.school && user.school !== "UniNet" ? user.school : "")
        || universityNameOf(domainUniversity)
        || "UniNet";
      result.studentProfile = {
        ...accountProfile,
        ...backendProfile,
        id: backendProfile.id || accountProfile.id || user.id,
        firstName: backendProfile.firstName || accountProfile.firstName || user.firstName || "",
        lastName: backendProfile.lastName || accountProfile.lastName || user.lastName || "",
        email,
        university: accountUniversity,
        department: backendProfile.department || accountProfile.department || "",
        major: backendProfile.major || accountProfile.major || "",
        studentId: backendProfile.studentId || accountProfile.studentId || "",
        enrollmentYear: backendProfile.enrollmentYear || accountProfile.enrollmentYear || "",
        graduationYear: backendProfile.graduationYear || accountProfile.graduationYear || "",
        interests: Array.isArray(backendProfile.interests) ? backendProfile.interests : [],
        skills: Array.isArray(backendProfile.skills) ? backendProfile.skills : [],
        completion: backendProfile.completion ?? 0,
      };
      setData(result);
      setProfile(result.studentProfile);
      setSavedIds(result.contentItems.filter(item => item.isSaved).map(item => item.id));
      setNotifications(result.notifications);
    } catch (reason) {
      setError(reason);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user.email, user.firstName, user.id, user.lastName, user.school, user.studentProfile, user.university]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!window.location.pathname.startsWith("/student")) window.history.replaceState({}, "", "/student");
  }, []);
  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => () => window.clearTimeout(profileCloseTimerRef.current), []);
  useEffect(() => {
    if (!profileMenu) return undefined;
    const onKey = event => {
      if (event.key === "Escape") {
        setProfileMenu(false);
        profileTriggerRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = [...(profileMenuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : event.key === "ArrowDown" ? (current + 1 + items.length) % items.length
            : (current - 1 + items.length) % items.length;
      items[next].focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileMenu]);

  const openProfileMenu = () => {
    window.clearTimeout(profileCloseTimerRef.current);
    setProfileMenu(true);
    setNotificationsOpen(false);
  };
  const scheduleProfileMenuClose = () => {
    window.clearTimeout(profileCloseTimerRef.current);
    profileCloseTimerRef.current = window.setTimeout(() => setProfileMenu(false), 450);
  };

  const closeDrawer = useCallback(() => {
    setDrawer(false);
    window.setTimeout(() => toggleRef.current?.querySelector("button")?.focus(), 0);
  }, []);
  useEffect(() => {
    if (!drawer) return undefined;
    drawerRef.current?.querySelector("button")?.focus();
    const onKey = event => {
      if (event.key === "Escape") closeDrawer();
      if (event.key === "Tab" && drawerRef.current) {
        const focusable = [...drawerRef.current.querySelectorAll("button")];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDrawer, drawer]);

  const navigate = path => {
  window.history.pushState({}, "", path);

  const pathname = new URL(path, window.location.origin).pathname;
  setRoute(pathname);

  closeDrawer();
  setProfileMenu(false);
  setNotificationsOpen(false);

  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

  window.scrollTo({ top: 0, behavior });
};
  const openSettingsSection = section => {
    window.sessionStorage.setItem("uninet-settings-section", section);
    window.dispatchEvent(new CustomEvent("uninet:settings-section", { detail: section }));
    navigate("/student/settings");
  };
  const save = async id => {
    const wasSaved = savedIds.includes(id);
    const updateSavedState = isSaved => {
      setSavedIds(items => isSaved
        ? (items.includes(id) ? items : [...items, id])
        : items.filter(item => item !== id));
      setData(current => ({
        ...current,
        contentItems: current.contentItems.map(item => item.id === id ? { ...item, isSaved } : item),
      }));
    };

    updateSavedState(!wasSaved);
    try {
      if (wasSaved) await studentService.unsaveContent(id);
      else await studentService.saveContent(id);
      setToast(wasSaved ? "Хадгалсан жагсаалтаас хаслаа." : "Контентыг хадгаллаа.");
    } catch (reason) {
      updateSavedState(wasSaved);
      setToast(reason.message || "Хадгалсан төлөвийг шинэчилж чадсангүй.");
    }
  };
  const openView = item => navigate(`/student/content/${item.id}`);
  const openAction = item => {
    setSelected(item);
    if (item.type === "EVENT") setFlow("EVENT_CONSENT");
    else if (["INTERNSHIP", "JOB", "RESEARCH"].includes(item.type)) setFlow("APPLICATION");
    else if (item.type === "SURVEY") {
      if (!Array.isArray(item.questions) || !item.questions.length) {
        setSelected(null);
        setToast("Энэ судалгаанд асуулт тохируулаагүй байна.");
        return;
      }
      setFlow("SURVEY"); setSurveyStep(1); setSurveySubmitted(false); setSurveyAnswers(item.questions.map(() => ""));
    }
    else if (item.type === "ANNOUNCEMENT") setFlow("DETAIL");
    else { setToast("Хүсэлт амжилттай илгээгдлээ."); }
  };
  const submitEvent = async () => {
    try {
      if (selected?.pricingType === "PAID") {
        const result = await studentService.createEventCheckout(contentIdOf(selected));
        if (result?.status === "WAITLISTED") {
          setFlow(null);
          await load(true);
          setToast(`Waitlist-д орлоо. Таны байр: ${result.waitlistPosition}`);
          return;
        }
        if (result?.ticketAvailable) {
          setSelected({ ...selected, status: "CONFIRMED", paymentStatus: "PAID" });
          setFlow("QR");
          await load(true);
          return;
        }
        if (result?.checkoutUrl) {
          window.location.assign(result.checkoutUrl);
          return;
        }
        if (result?.awaitingWebhook) {
          navigate(`/student/payment/success?eventId=${encodeURIComponent(contentIdOf(selected))}`);
          setFlow(null);
          return;
        }
        throw new Error("Stripe Checkout URL олдсонгүй.");
      }
      const result = await studentService.registerEvent(contentIdOf(selected));
      const registration = { ...selected, ...result, contentId: contentIdOf(selected) };
      setSelected(registration);
      setFlow(registration.status === "CONFIRMED" ? "QR" : null);
      await load(true);
      setToast(registration.status === "CONFIRMED" ? "Тасалбар амжилттай авлаа. QR кодоо event дээр өөрийн биеэр очиж үзүүлнэ үү." : `Waitlist-д орлоо. Таны байр: ${registration.waitlistPosition}`);
    } catch (reason) {
      setToast(reason.message || "Арга хэмжээнд бүртгүүлж чадсангүй.");
    }
  };

  const payRegistration = async item => {
    try {
      const result = await studentService.createEventCheckout(contentIdOf(item));
      if (result?.checkoutUrl) return window.location.assign(result.checkoutUrl);
      if (result?.ticketAvailable) { setSelected(item); setFlow("QR"); await load(true); return; }
      if (result?.awaitingWebhook) return navigate(`/student/payment/success?eventId=${encodeURIComponent(contentIdOf(item))}`);
      setToast("Stripe төлбөрийн session үүсгэж чадсангүй.");
    } catch (reason) { setToast(reason.message || "Төлбөр эхлүүлж чадсангүй."); }
  };
  const submitApplication = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await studentService.submitApplication(contentIdOf(selected), {
        cvAssetId: form.get("cvAssetId") || undefined,
        cvUrl: form.get("cv") || "",
        coverNote: form.get("coverNote"),
        consentGranted: form.has("consent"),
      });
      setFlow(null);
      setSelected(null);
      await load(true);
      setToast("Өргөдөл амжилттай илгээгдлээ.");
    } catch (reason) {
      setToast(reason.message || "Өргөдөл илгээж чадсангүй.");
    }
  };

  const readNotification = async item => {
    if (!item.read) {
      setNotifications(current => current.map(notification => notification.id === item.id ? { ...notification, read: true } : notification));
      try {
        await studentService.markNotificationRead(item.id);
      } catch (reason) {
        setNotifications(current => current.map(notification => notification.id === item.id ? { ...notification, read: false } : notification));
        setToast(reason.message || "Мэдэгдлийг уншсанаар тэмдэглэж чадсангүй.");
        return;
      }
    }
    const actionUrl = String(item.actionUrl || "");
    if (actionUrl.startsWith("/student/")) {
      navigate(actionUrl);
      return;
    }
    if (actionUrl === "/settings" || actionUrl.startsWith("/settings/")) {
      const section = actionUrl.split("/").filter(Boolean)[1] || "security";
      window.sessionStorage.setItem("uninet-settings-section", section);
      window.dispatchEvent(new CustomEvent("uninet:settings-section", { detail: section }));
      navigate("/student/settings");
    }
  };

  const markAllNotificationsRead = async () => {
    const previous = notifications;
    setNotifications(current => current.map(item => ({ ...item, read: true })));
    try { await studentService.markAllNotificationsRead(); }
    catch (reason) { setNotifications(previous); setToast(reason.message || "Мэдэгдлүүдийг шинэчилж чадсангүй."); }
  };

  const confirmAction = async () => {
    const pending = confirm;
    if (!pending) return;
    try {
      if (pending.kind === "cancel") {
        await studentService.cancelRegistration(contentIdOf(pending.item));
        setToast("Бүртгэл амжилттай цуцлагдлаа.");
      } else if (pending.kind === "withdraw") {
        await studentService.withdrawApplication(contentIdOf(pending.item));
        setToast("Өргөдлийг амжилттай буцаан татлаа.");
      }
      setConfirm(null);
      await load(true);
    } catch (reason) {
      setToast(reason.message || "Үйлдлийг гүйцэтгэж чадсангүй.");
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-50">{GlobalStyles && <GlobalStyles />}<LoadingSkeleton variant="shell" /></div>;
  if (error) {
    const status = errorScreenStatus(error);
    return <div className="min-h-screen bg-slate-50 p-8">{GlobalStyles && <GlobalStyles />}<div className="mx-auto max-w-3xl">{status
      ? <HttpErrorState status={status} error={error} onRetry={() => load()} onHome={() => navigate("/student")} />
      : <ErrorState message={mongolianErrorMessage(error, "Мэдээллийг ачаалж чадсангүй.")} onRetry={() => load()} />}</div></div>;
  }
  const unread = notifications.filter(item => !item.read).length;
  const studentUniversityName = normalizeUniversityName(profile.university);

  let page;
  if (route === "/student/payment/success") page = <PaymentSuccessPage profile={profile} navigate={navigate} />;
  else if (route.startsWith("/student/content/")) {
    const item = data.contentItems.find(content => content.id === route.split("/").pop());
    page = item ? <><PageHeader breadcrumb="Student Dashboard / Дэлгэрэнгүй" title={item.title} description={item.shortDescription} actions={<button type="button" onClick={() => window.history.back()} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Буцах</button>} /><article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-9"><div className="flex flex-wrap gap-2"><VisibilityBadge value={item.visibility} /><StatusBadge value={item.status} /></div><div className="mt-7 grid gap-5 rounded-2xl bg-slate-50 p-5 text-sm md:grid-cols-2"><div><span className="text-xs text-slate-400">Сургууль</span><b className="mt-1 block">{item.university}</b></div><div><span className="text-xs text-slate-400">Огноо</span><b className="mt-1 block">{item.date || item.deadline || item.publishedAt}</b></div><div><span className="text-xs text-slate-400">Байршил</span><b className="mt-1 block">{item.location || item.mode || "Онлайн"}</b></div><div><span className="text-xs text-slate-400">Ангилал</span><b className="mt-1 block">{item.category || item.type}</b></div>{item.type === "EVENT" && <div><span className="text-xs text-slate-400">Тасалбар</span><b className={`mt-1 block ${item.pricingType === "PAID" ? "text-blue-600" : "text-emerald-600"}`}>{item.pricingType === "PAID" ? `${Number(item.priceAmount || 0).toLocaleString()} ₮` : "FREE · Үнэгүй"}</b></div>}</div><p className="mt-7 max-w-3xl text-sm leading-7 text-slate-600">{item.description || item.shortDescription}</p><button type="button" onClick={() => openAction(item)} className="mt-8 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white">{item.type === "EVENT" ? "Тасалбар авах" : "Үргэлжлүүлэх"}</button></article></> : <HttpErrorState status={404} error={{ status: 404, code: "CONTENT_NOT_FOUND" }} onHome={() => navigate("/student")} compact />;
  } else if (route === "/student") page = <HomePage data={{ ...data, notifications }} savedIds={savedIds} navigate={navigate} onSave={save} onView={openView} onAction={openAction} onReadNotification={readNotification} />;
  else if (pageCopy[route]) page = <DiscoveryPage route={route} data={data} savedIds={savedIds} onSave={save} onView={openView} onAction={openAction} />;
  else if (route === "/student/registrations") page = <RegistrationsPage registrations={data.registrations} onQr={item => { setSelected({ ...item, modalType: "QR" }); setFlow("QR"); }} onPay={payRegistration} onCalendar={item => setToast(downloadCalendarEvent(item) ? "Календарын файл татагдлаа." : "Арга хэмжээний огноо тодорхойгүй байна.")} onCancel={item => setConfirm({ kind: "cancel", item })} />;
  else if (route === "/student/notifications") page = <StudentNotificationsPage notifications={notifications} onOpen={readNotification} onMarkAll={markAllNotificationsRead} />;
  else if (route === "/student/applications") page = <ApplicationsPage applications={data.applications} onView={item => { setSelected(item); setFlow("TIMELINE"); }} onWithdraw={item => setConfirm({ kind: "withdraw", item })} />;
  else if (route === "/student/profile") page = <ProfilePage profile={profile} setProfile={setProfile} registrations={data.registrations} applications={data.applications} completedSurveyCount={data.completedSurveyCount} savedCount={savedIds.length} onToast={setToast} />;
  else if (route === "/student/settings") page = <SharedSettingsPage user={{ ...user, ...profile, role: "STUDENT", university: profile.university }} onLogout={onLogout} />;
  else page = <HttpErrorState status={404} error={{ status: 404, code: "ROUTE_NOT_FOUND" }} onHome={() => navigate("/student")} compact />;

  return (
    <div className="font-body min-h-screen bg-slate-50 text-slate-900">
      {GlobalStyles && <GlobalStyles />}
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 md:px-7">
          <span ref={toggleRef}><SidebarToggleButton mobile expanded={drawer} onClick={() => setDrawer(true)} controls="student-sidebar" className="md:hidden" /></span>
          <SidebarToggleButton expanded={!collapsed} onClick={() => setCollapsed(value => !value)} controls="student-sidebar" className="hidden md:inline-flex" />
          <button type="button" onClick={() => navigate("/student")} className="font-display text-lg font-bold">UniNet</button>
          <div className="mx-auto hidden max-w-xl flex-1 md:block">
            <input type="search" value={globalSearch} onChange={event => setGlobalSearch(event.target.value)} onKeyDown={event => event.key === "Enter" && navigate(`/student/network?search=${encodeURIComponent(globalSearch)}`)}
              aria-label="Глобал хайлт" placeholder="Арга хэмжээ, дадлага, ажил хайх..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-500" />
          </div>
          <NotificationDropdown open={notificationsOpen} onToggle={() => { setNotificationsOpen(value => !value); setProfileMenu(false); }}
            onClose={() => setNotificationsOpen(false)} notifications={notifications} unread={unread} onNotificationClick={readNotification} onOpenAll={() => { navigate("/student/notifications"); setNotificationsOpen(false); }} />
          <div className="relative" onMouseEnter={openProfileMenu} onMouseLeave={scheduleProfileMenuClose}>
            <button ref={profileTriggerRef} type="button" onClick={() => { setProfileMenu(value => !value); setNotificationsOpen(false); }} aria-expanded={profileMenu} aria-haspopup="menu" aria-controls={profileMenuId}
              className={`topbar-action group inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition duration-200 ${profileMenu ? "border-slate-700 bg-slate-900 text-white shadow-xl shadow-slate-900/20" : "border-slate-800 bg-slate-900 text-white hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/20"}`}>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 transition group-hover:scale-105 group-hover:bg-white/15"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
              <span className="hidden min-w-0 sm:block"><span className="block max-w-28 truncate text-xs font-bold">{profile.firstName}</span><span className="block max-w-28 truncate text-[9px] text-slate-300">{studentUniversityName}</span></span>
              <ChevronDown aria-hidden="true" className={`hidden h-4 w-4 text-slate-300 transition duration-200 sm:block ${profileMenu ? "rotate-180" : "group-hover:translate-y-0.5"}`} />
            </button>
            {profileMenu && (
              <div id={profileMenuId} ref={profileMenuRef} role="menu" className="uninet-popover absolute right-0 z-[1100] mt-3 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                <div className="border-b border-slate-100 px-3 py-3"><div className="text-xs font-bold">Student</div><div className="mt-1 break-all text-[10px] text-slate-400">{profile.email}</div></div>
                <button role="menuitem" type="button" onClick={() => navigate("/student/profile")} className="profile-menu-item"><UserRound className="h-4 w-4" />Профайл</button>
                <button role="menuitem" type="button" onClick={() => navigate("/student/settings")} className="profile-menu-item"><Settings className="h-4 w-4" />Тохиргоо</button>
                <div className="my-1 border-t border-slate-100" />
                <button role="menuitem" type="button" onClick={() => openSettingsSection("help")} className="profile-menu-item hover:text-blue-700"><CircleHelp className="h-4 w-4" />Help</button>
                <button role="menuitem" type="button" onClick={() => openSettingsSection("feedback")} className="profile-menu-item hover:text-blue-700"><MessageSquareText className="h-4 w-4" />Send feedback</button>
                <div className="my-1 border-t border-slate-100" />
                <button role="menuitem" type="button" onClick={onLogout} className="profile-menu-item profile-menu-item-danger"><LogOut className="h-4 w-4" />Гарах</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {drawer && <button type="button" aria-label="Цэс хаах" onClick={closeDrawer} className="fixed inset-0 z-40 bg-slate-950/40 md:hidden" />}
      <div className="md:grid transition-[grid-template-columns] duration-300" style={{ gridTemplateColumns: collapsed ? "84px minmax(0,1fr)" : "250px minmax(0,1fr)" }}>
        <aside id="student-sidebar" ref={drawerRef} className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-200 bg-white transition-[transform,width] duration-300 md:sticky md:top-16 md:z-30 md:h-[calc(100vh-4rem)] ${collapsed ? "md:w-[84px]" : "md:w-[250px]"} ${drawer ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
          <div className="flex items-center justify-between border-b border-slate-100 p-5 md:hidden"><b className="font-display">Student menu</b><button type="button" onClick={closeDrawer} aria-label="Drawer хаах" className="px-3 py-2">×</button></div>
          <div className={`flex min-h-20 border-b border-slate-100 ${collapsed ? "items-center justify-center px-3" : "items-start px-8 py-5"}`}>
            {collapsed ? (
              <>
                <UniversityLogo university={studentUniversityName} className="hidden h-12 w-12 md:inline-grid" />
                <div className="md:hidden"><div className="font-display text-sm font-bold">{studentUniversityName}</div><div className="mt-1 text-[10px] text-slate-400">{profile.department}</div></div>
              </>
            ) : (
              <div className="min-w-0"><div className="font-display truncate text-sm font-bold">{studentUniversityName}</div><div className="mt-1 truncate text-[10px] text-slate-400">{profile.department}</div></div>
            )}
          </div>
          <nav className="sidebar-scrollbar h-[calc(100%-5rem)] space-y-1 overflow-y-auto p-4" aria-label="Student navigation">
            {(showAllMenu || routes.slice(5).some(item => route === item.path) ? routes : routes.slice(0, 5)).map(item => <button key={item.path} type="button" onClick={() => navigate(item.path)} title={collapsed ? item.label : undefined} aria-label={collapsed ? item.label : undefined}
              className={`group relative block w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold ${collapsed ? "md:px-2 md:text-center" : ""} ${route === item.path ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
              <span className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
                <SidebarNavIcon path={item.path} />
                <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
              </span>
              {collapsed && <span role="tooltip" className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg group-hover:md:block group-focus-visible:md:block">{item.label}</span>}
            </button>)}
            <button type="button" onClick={() => setShowAllMenu(value => !value)} title={collapsed ? (showAllMenu ? "See less" : "See more") : undefined}
              className={`block w-full rounded-xl border border-dashed border-slate-200 px-4 py-2.5 text-left text-xs font-bold text-blue-600 hover:bg-blue-50 ${collapsed ? "md:px-2 md:text-center" : ""}`}>
              {collapsed ? <><span className="hidden md:inline">•••</span><span className="md:hidden">{showAllMenu ? "See less" : "See more"}</span></> : showAllMenu ? "See less" : "See more"}
            </button>
          </nav>
        </aside>
        <main className="min-w-0 p-5 md:p-8 lg:p-10"><div className="mx-auto max-w-7xl">{page}</div></main>
      </div>

      {flow === "EVENT_CONSENT" && <Modal title="Бүртгэлийн зөвшөөрөл" onClose={() => setFlow(null)}><p className="text-sm text-slate-500">Дараах мэдээллийг зохион байгуулагчтай хуваалцана:</p><ul className="my-5 space-y-2 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800"><li>Нэр: {profile.lastName} {profile.firstName}</li><li>Имэйл: {profile.email}</li><li>Сургууль: {profile.university}</li><li>Мэргэжил: {profile.major}</li></ul><button type="button" onClick={submitEvent} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white">{selected.remainingSeats === 0 ? "Зөвшөөрч waitlist-д орох" : selected.pricingType === "PAID" ? `Төлбөр төлөх · ${Number(selected.priceAmount || 0).toLocaleString()} ₮` : "Зөвшөөрч бүртгүүлэх"}</button></Modal>}

      {flow === "APPLICATION" && <Modal title={`${selected.type === "JOB" ? "Ажлын байрны" : selected.type === "RESEARCH" ? "Судалгааны" : "Дадлагын"} өргөдөл`} onClose={() => setFlow(null)} wide><form onSubmit={submitApplication} className="space-y-4"><div className="rounded-xl bg-slate-50 p-4 text-sm"><b>{profile.lastName} {profile.firstName}</b><p className="mt-1 text-slate-500">{profile.email} · {profile.university} · {profile.major}</p></div>{profile.cvFile ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><input type="hidden" name="cvAssetId" value={profile.cvFile.id} /><b>Аюулгүй CV файл</b><p className="mt-1 text-xs">{profile.cvFile.originalName}</p></div> : <label className="block text-xs font-bold">CV холбоос (fallback)<input name="cv" type="url" required defaultValue={profile.cv || ""} placeholder="https://..." className="mt-2 w-full rounded-lg border border-slate-200 p-3" /></label>}<label className="block text-xs font-bold">Portfolio URL<input name="portfolioUrl" type="url" defaultValue={profile.portfolio || ""} className="mt-2 w-full rounded-lg border border-slate-200 p-3" /></label><label className="block text-xs font-bold">Cover note<textarea name="coverNote" rows="4" className="mt-2 w-full rounded-lg border border-slate-200 p-3" /></label><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">Нэр, имэйл, сургууль, мэргэжил, CV, portfolio болон cover note хуваалцагдана.</div><label className="flex gap-2 text-xs"><input name="consent" type="checkbox" required /> Мэдээлэл хуваалцахыг зөвшөөрч байна.</label><button className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white">Өргөдөл илгээх</button></form></Modal>}

      {flow === "SURVEY" && <Modal title={selected.title} onClose={() => setFlow(null)}><div className="mb-5 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${surveySubmitted ? 100 : surveyStep / surveyAnswers.length * 100}%` }} /></div>{surveySubmitted ? <div className="py-8 text-center"><h3 className="font-display text-xl font-bold">Баярлалаа!</h3><p className="mt-2 text-sm text-slate-500">Судалгааг {formatDate()} өдөр амжилттай илгээлээ.</p><button type="button" onClick={() => setFlow(null)} className="mt-5 rounded-lg bg-slate-900 px-5 py-2 text-xs font-bold text-white">Жагсаалт руу буцах</button></div> : <><div className="mb-5 rounded-xl bg-emerald-50 p-4 text-xs text-emerald-800">Таны хариулт database-д аюулгүй хадгалагдана.</div><p className="text-xs font-bold text-slate-400">Асуулт {surveyStep} / {surveyAnswers.length}</p><h3 className="mt-2 font-display font-bold">{typeof selected.questions?.[surveyStep - 1] === "string" ? selected.questions[surveyStep - 1] : selected.questions?.[surveyStep - 1]?.title}{selected.questions?.[surveyStep - 1]?.required && <span className="ml-1 text-rose-600">*</span>}</h3><StudentSurveyField question={selected.questions?.[surveyStep - 1]} value={surveyAnswers[surveyStep - 1]} onChange={answer => setSurveyAnswers(values => values.map((value, index) => index === surveyStep - 1 ? answer : value))} /><div className="mt-5 flex justify-between"><button type="button" disabled={surveyStep === 1} onClick={() => setSurveyStep(step => step - 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold disabled:opacity-40">Өмнөх</button><button type="button" onClick={async () => { const currentQuestion = selected.questions?.[surveyStep - 1]; if (currentQuestion?.required && !surveyAnswers[surveyStep - 1]?.trim()) { setToast("Заавал бөглөх асуултад хариулна уу."); return; } if (surveyStep === surveyAnswers.length) { try { await studentService.submitSurvey(selected.id, surveyAnswers); setSurveySubmitted(true); setToast("Судалгаа амжилттай илгээгдлээ."); } catch (reason) { setToast(reason.message); } } else setSurveyStep(step => step + 1); }} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">{surveyStep === surveyAnswers.length ? "Илгээх" : "Дараах"}</button></div></>}</Modal>}

      {flow === "QR" && selected && <Modal title="QR тасалбар" onClose={() => setFlow(null)}><QrTicketContent registration={selected} profile={profile} /></Modal>}

      {flow === "TIMELINE" && <Modal title="Өргөдлийн timeline" onClose={() => setFlow(null)}><div className="space-y-0">{(selected.timeline?.length ? selected.timeline : [{ id: "current", status: selected.status, date: selected.appliedAt }]).map((entry, index) => <div key={entry.id || `${entry.status}-${index}`} className="flex gap-4 pb-6"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</div><div><h3 className="text-sm font-bold">{entry.status}</h3><p className="mt-1 text-xs text-slate-400">{entry.date ? new Intl.DateTimeFormat("mn-MN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.date)) : "Огноо тодорхойгүй"}</p>{entry.reason && <p className="mt-1 text-xs text-slate-500">{entry.reason}</p>}</div></div>)}</div></Modal>}

      {confirm && <ConfirmDialog title={confirm.kind === "cancel" ? "Бүртгэл цуцлах уу?" : confirm.kind === "withdraw" ? "Өргөдөл буцаан татах уу?" : "Аюултай үйлдэл"}
        description="Энэ үйлдлийг хийсний дараа буцаах боломж хязгаарлагдаж болзошгүй." danger confirmLabel="Тийм, үргэлжлүүлэх"
        onClose={() => setConfirm(null)} onConfirm={confirmAction} />}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
