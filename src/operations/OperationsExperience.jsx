import { useCallback, useEffect, useRef, useState } from "react";
import DashboardLayout from "../dashboard/DashboardLayout";
import { PermissionGuard, RoleGuard } from "../auth/RoleGuard";
import { ConfirmDialog, EmptyState, ErrorState, FilterBar, LoadingSkeleton, Modal, PageHeader, SelectFilter, StatCard, Toast, VisibilityBadge } from "../student/StudentUI";
import { adminRoutes, operationsService, platformRoutes, resolveApiAssetUrl, staffRoutes } from "./operationsData";
import SettingsPage from "../settings/SettingsPage";
import { Bell, Building2, Camera, CheckCheck, ChevronDown, Clock3, Copy, Database, Eye, GripVertical, Plus, RotateCcw, Send, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { PlatformAdminManagementPage, UniversityMembershipPage } from "../memberships/MembershipManagement.jsx";
import HttpErrorState from "../errors/HttpErrorState.jsx";
import { errorScreenStatus, mongolianErrorMessage } from "../errors/errorMessages.js";
import StyledSelect from "../ui/StyledSelect.jsx";
import { startQrCameraScanner } from "./qrCameraScanner.js";
import { formatDate, formatDateTime, toIsoFromLocalDateTime, toLocalDateTimeInput } from "../settings/uiPreferences.js";
import NativeStyledSelect from "../ui/NativeStyledSelect.jsx";

const roleConfig = {
  STAFF: { base: "/staff", routes: staffRoutes, title: "Staff Dashboard", permission: "CREATE_CONTENT" },
  UNIVERSITY_ADMIN: { base: "/admin", routes: adminRoutes, title: "University Admin", permission: "MANAGE_WORKSPACE" },
  PLATFORM_SUPER_ADMIN: { base: "/platform", routes: platformRoutes, title: "Platform Super Admin", permission: "MANAGE_PLATFORM" },
};

const statusStyle = status => status === "ACTIVE" || status === "PUBLISHED" || status === "APPROVED" || status === "OPERATIONAL"
  ? "bg-emerald-50 text-emerald-700" : ["PENDING", "PENDING_APPROVAL", "DRAFT", "DEGRADED", "ALREADY_APPROVED"].includes(status)
    ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700";

function Badge({ value }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyle(value)}`}>{value}</span>;
}

function exportRowsCsv(rows, filename) {
  if (!rows.length) return false;
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const escape = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [keys.map(escape).join(","), ...rows.map(row => keys.map(key => escape(row[key])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

function recentMonthSeries(items, dateKey) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1); date.setMonth(date.getMonth() - (5 - index));
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: `${date.getMonth() + 1} сар`, count: 0 };
  });
  for (const item of items) {
    const key = String(item[dateKey] || "").replaceAll(".", "-").slice(0, 7);
    const month = months.find(entry => entry.key === key);
    if (month) month.count += 1;
  }
  return { labels: months.map(month => month.label), values: months.map(month => month.count) };
}

function DataTable({ columns, rows, actions }) {
  if (!rows.length) return <EmptyState title="Одоогоор мэдээлэл олдсонгүй." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr>{columns.map(column => <th key={column.key} className="px-4 py-3">{column.label}</th>)}{actions && <th className="px-4 py-3">Үйлдэл</th>}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={row.id || index} className="hover:bg-slate-50">{columns.map(column => <td key={column.key} className="px-4 py-4 text-slate-600">{column.render ? column.render(row[column.key], row) : row[column.key]}</td>)}{actions && <td className="px-4 py-4"><button type="button" onClick={() => actions(row)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold">Удирдах</button></td>}</tr>)}</tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-4 py-3 text-[10px] text-slate-400">{rows.length} үр дүн</div>
    </div>
  );
}

function MetricBars({ labels = [], values = [] }) {
  const maximum = Math.max(1, ...values);
  return <div className="flex h-48 items-end gap-3">{values.map((value, index) => <div key={labels[index]} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><b className="text-[10px] text-slate-600">{value}</b><div className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-violet-500" style={{ height: `${value ? Math.max(8, value / maximum * 100) : 2}%` }} /><span className="text-[9px] text-slate-400">{labels[index]}</span></div>)}</div>;
}

function DashboardPage({ role, data, navigate, user }) {
  const isStaff = role === "STAFF", isAdmin = role === "UNIVERSITY_ADMIN";
  const content = data.staffContent || [], users = data.users || [], registrations = data.registrations || [], applications = data.applications || [], universities = data.universities || [];
  const analytics = data.analytics || {};
  const exact = (group, key) => Number(analytics[group]?.[key] || 0).toLocaleString();
  const exactTotal = group => Object.values(analytics[group] || {}).reduce((sum, value) => sum + Number(value || 0), 0).toLocaleString();
  const count = (items, key, value) => items.filter(item => item[key] === value).length.toLocaleString();
  const stats = isStaff
    ? [[content.length.toLocaleString(), "Нийт үүсгэсэн контент"], [count(content, "status", "DRAFT"), "Ноорог"], [count(content, "status", "PENDING_APPROVAL"), "Батлуулах хүлээгдэж буй"], [count(content, "status", "PUBLISHED"), "Нийтлэгдсэн"], [registrations.length.toLocaleString(), "Нийт бүртгэл"], [applications.length.toLocaleString(), "Нийт өргөдөл"], [content.filter(item => item.closes && new Date(String(item.closes).replaceAll(".", "-")) >= new Date()).length.toLocaleString(), "Хаагдаагүй контент"], [(data.notifications || []).filter(item => !item.read).length.toLocaleString(), "Уншаагүй мэдэгдэл"]]
    : isAdmin
      ? [[exactTotal("usersByRole"), "Нийт хэрэглэгч"], [exact("usersByRole", "STUDENT"), "Нийт оюутан"], [exact("usersByRole", "STAFF"), "Нийт ажилтан"], [users.filter(item => item.permissions?.includes("PUBLISH_CONTENT")).length.toLocaleString(), "Publish эрхтэй"], [exactTotal("contentByStatus"), "Нийт контент"], [exact("contentByStatus", "PENDING_APPROVAL"), "Батлуулах хүсэлт"], [exact("partnershipsByStatus", "ACTIVE"), "Идэвхтэй түншлэл"], [exactTotal("registrationsByStatus"), "Нийт бүртгэл"]]
      : [[universities.length.toLocaleString(), "Нийт их сургууль"], [count(universities, "status", "ACTIVE"), "Идэвхтэй их сургууль"], [exactTotal("usersByRole"), "Нийт хэрэглэгч"], [exact("usersByRole", "STUDENT"), "Нийт оюутан"], [exact("usersByRole", "STAFF"), "Нийт Staff"], [exact("usersByRole", "UNIVERSITY_ADMIN"), "University Admin"], [exact("partnershipsByStatus", "ACTIVE"), "Идэвхтэй түншлэл"], [exact("contentByStatus", "PUBLISHED"), "Нийтлэгдсэн контент"]];
  const series = recentMonthSeries(isStaff ? content : isAdmin ? users : universities, isStaff ? "created" : isAdmin ? "joined" : "created");
  const quick = isStaff ? [["Арга хэмжээ үүсгэх", "/staff/content/create"], ["Дадлага үүсгэх", "/staff/content/create"], ["Ажлын байр үүсгэх", "/staff/content/create"], ["Асуулга үүсгэх", "/staff/content/create"]]
    : isAdmin ? [["Контент батлах", "/admin/approvals"], ["Staff урих", "/admin/staff"], ["Түншлэл удирдах", "/admin/partnerships"], ["Audit шалгах", "/admin/audit-logs"]]
      : [["Сургууль нэмэх", "/platform/universities/create"], ["Admin урих", "/platform/admins"], ["Monitoring", "/platform/monitoring"], ["Global audit", "/platform/audit-logs"]];
  return (
    <>
      <PageHeader eyebrow={`${user.university} · Workspace active`} title={`Сайн байна уу, ${user.name}`} description={`${roleConfig[role].title} — хариуцсан өгөгдөл, үйл ажиллагааны нэгдсэн тойм.`}
        actions={<button type="button" onClick={() => navigate(quick[0][1])} className="rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold text-white">{quick[0][0]}</button>} />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">{stats.map(([value, label]) => <StatCard key={label} value={value} label={label} />)}</div>
      <section className="mb-8"><h2 className="font-display mb-4 text-xl font-bold">Шуурхай үйлдэл</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{quick.map(([label, path]) => <button key={label} type="button" onClick={() => navigate(path)} className="card-effect rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold">{label}</button>)}</div></section>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="mb-5 flex justify-between"><h2 className="font-display font-bold">{isStaff ? "Контентын гүйцэтгэл" : isAdmin ? "Хэрэглэгчийн өсөлт" : "Сүлжээний өсөлт"}</h2><span className="text-xs text-slate-400">Сүүлийн 6 сар</span></div><MetricBars labels={series.labels} values={series.values} /></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-display mb-4 font-bold">{isStaff ? "Сүүлийн контент" : isAdmin ? "Батлуулах хүсэлт" : "System alerts"}</h2><div className="space-y-3">{(isStaff || isAdmin ? data.staffContent : data.systemHealth).slice(0, 4).map(item => <div key={item.id || item.service} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-3"><b className="text-xs">{item.title || item.service}</b><Badge value={item.status} /></div><p className="mt-1 text-[10px] text-slate-400">{item.created || item.response}</p></div>)}</div></section>
      </div>
    </>
  );
}

function ContentManagement({ data, route, onManage, onToast }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(route.endsWith("/drafts") ? "DRAFT" : route.endsWith("/approvals") ? "PENDING_APPROVAL" : route.endsWith("/published") ? "PUBLISHED" : "ALL");
  const [type, setType] = useState("ALL");
  const rows = data.staffContent.filter(item => (status === "ALL" || item.status === status) && (type === "ALL" || item.type === type) && item.title.toLowerCase().includes(search.toLowerCase()));
  const title = route.endsWith("/drafts") ? "Ноорог" : route.endsWith("/approvals") ? "Баталгаажуулалтын төлөв" : route.endsWith("/published") ? "Нийтлэгдсэн контент" : "Контентын удирдлага";
  return (
    <>
      <PageHeader title={title} description="Контентын lifecycle, visibility, хугацаа болон engagement-ийг нэг дороос удирдана."
        actions={<button type="button" onClick={() => { if (exportRowsCsv(rows, "uninet-content.csv")) onToast("Backend-ээс татсан контентыг CSV файлаар татлаа."); }} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">CSV export</button>} />
      <FilterBar search={search} onSearch={setSearch}>
        <SelectFilter label="Статус" value={status} onChange={setStatus} options={["DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED", "CLOSED", "ARCHIVED", "REJECTED"]} />
        <SelectFilter label="Төрөл" value={type} onChange={setType} options={["EVENT", "INTERNSHIP", "JOB", "RESEARCH", "SURVEY", "ANNOUNCEMENT"]} />
      </FilterBar>
      <DataTable rows={rows} actions={onManage} columns={[
        { key: "title", label: "Гарчиг", render: value => <b className="text-slate-800">{value}</b> },
        { key: "type", label: "Төрөл" }, { key: "visibility", label: "Visibility", render: value => <VisibilityBadge value={value} /> },
        { key: "status", label: "Статус", render: value => <Badge value={value} /> }, { key: "created", label: "Үүсгэсэн" },
        { key: "closes", label: "Хаагдах" }, { key: "views", label: "Үзэлт" }, { key: "engagement", label: "Бүртгэл/өргөдөл" },
      ]} />
    </>
  );
}

function ContentEditor({ content, onSaved, onDelete, onError }) {
  const [title, setTitle] = useState(content.title);
  const [shortDescription, setShortDescription] = useState(content.shortDescription);
  const [description, setDescription] = useState(content.description);
  const [visibility, setVisibility] = useState(content.visibility);
  const [category, setCategory] = useState(content.category || "");
  const [organization, setOrganization] = useState(content.organization || "");
  const [location, setLocation] = useState(content.location || "");
  const [capacity, setCapacity] = useState(content.capacity || "");
  const [pricingType, setPricingType] = useState(content.pricingType || "FREE");
  const [priceAmount, setPriceAmount] = useState(content.priceAmount || "");
  const [currency, setCurrency] = useState(content.currency || "MNT");
  const [startsAt, setStartsAt] = useState(toLocalDateTimeInput(content.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalDateTimeInput(content.endsAt));
  const [saving, setSaving] = useState(false);
  const editable = ["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(content.status);
  const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

  const save = async event => {
    event.preventDefault();
    if (content.type === "EVENT" && (!startsAt || !endsAt)) {
      onError("Арга хэмжээний эхлэх болон дуусах огноо, цагийг оруулна уу.");
      return;
    }
    if (content.type === "EVENT" && new Date(endsAt) <= new Date(startsAt)) {
      onError("Дуусах огноо, цаг нь эхлэх огноо, цагаас хойш байна.");
      return;
    }
    setSaving(true);
    try {
      const updated = await operationsService.updateContent(content.id, {
        version: content.version,
        title: title.trim(),
        shortDescription: shortDescription.trim(),
        description: description.trim(),
        visibility,
        category: category.trim(),
        organization: organization.trim(),
        location: location.trim(),
        ...(capacity ? { capacity: Number(capacity) } : {}),
        ...(content.type === "EVENT" ? {
          startsAt: toIsoFromLocalDateTime(startsAt),
          endsAt: toIsoFromLocalDateTime(endsAt),
          pricingType,
          priceAmount: pricingType === "PAID" ? Number(priceAmount) : 0,
          currency,
        } : {}),
      });
      await onSaved(updated);
    } catch (reason) { onError(reason.message); }
    finally { setSaving(false); }
  };

  if (!editable) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">Энэ төлөвтэй контент read-only байна. Засахын өмнө зөвшөөрөгдсөн lifecycle төлөвт шилжүүлнэ.</div>;
  return <form onSubmit={save} className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-xs font-bold">Гарчиг *<input required minLength="3" value={title} onChange={event => setTitle(event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-bold">Visibility<NativeStyledSelect value={visibility} onChange={event => setVisibility(event.target.value)} className={inputClass}>{["PRIVATE", "PARTNERS", "NETWORK", "PUBLIC"].map(value => <option key={value}>{value}</option>)}</NativeStyledSelect></label>
      <label className="text-xs font-bold md:col-span-2">Товч тайлбар *<input required minLength="3" value={shortDescription} onChange={event => setShortDescription(event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-bold md:col-span-2">Дэлгэрэнгүй *<textarea required minLength="3" rows="5" value={description} onChange={event => setDescription(event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-bold">Ангилал<input value={category} onChange={event => setCategory(event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-bold">Байгууллага<input value={organization} onChange={event => setOrganization(event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-bold">Байршил<input value={location} onChange={event => setLocation(event.target.value)} className={inputClass} /></label>
      {content.type === "EVENT" && <>
        <label className="text-xs font-bold">Эхлэх огноо, цаг *<input type="datetime-local" required value={startsAt} onChange={event => setStartsAt(event.target.value)} className={inputClass} /></label>
        <label className="text-xs font-bold">Дуусах огноо, цаг *<input type="datetime-local" required min={startsAt || undefined} value={endsAt} onChange={event => setEndsAt(event.target.value)} className={inputClass} /></label>
        <label className="text-xs font-bold">Багтаамж<input type="number" min="1" value={capacity} onChange={event => setCapacity(event.target.value)} className={inputClass} /></label>
        <label className="text-xs font-bold">Тасалбарын төрөл<NativeStyledSelect value={pricingType} onChange={event => setPricingType(event.target.value)} className={inputClass}><option value="FREE">FREE · Үнэгүй</option><option value="PAID">PAID · Төлбөртэй</option></NativeStyledSelect></label>
        {pricingType === "PAID" && <>
          <label className="text-xs font-bold">Тасалбарын үнэ<input type="number" min="1" step="1" required value={priceAmount} onChange={event => setPriceAmount(event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-bold">Валют<NativeStyledSelect value={currency} onChange={event => setCurrency(event.target.value)} className={inputClass}><option value="MNT">MNT · ₮</option></NativeStyledSelect></label>
        </>}
      </>}
    </div>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onDelete} className="mr-auto rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Устгах</button>
      <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "Хадгалж байна..." : "Өөрчлөлт хадгалах"}</button>
    </div>
  </form>;
}

function EventQrApprovalScanner({ event, onToast }) {
  const [cameraOpen, setCameraOpen] = useState(true);
  const [cameraError, setCameraError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const approveTicket = useCallback(async token => {
    if (processingRef.current) return;
    processingRef.current = true;
    setScanning(true);
    setCameraError("");
    setCameraOpen(false);
    try {
      const attendance = await operationsService.scanAttendance(event.id, token.trim());
      if (!mountedRef.current) return;
      setResult(attendance);
      onToast(attendance.alreadyRecorded
        ? "Already approved — энэ QR тасалбар өмнө нь баталгаажсан байна."
        : "QR тасалбар APPROVED болж, ирц нэг удаа бүртгэгдлээ.");
    } catch (reason) {
      if (!mountedRef.current) return;
      const message = reason.message || "QR тасалбарыг баталгаажуулж чадсангүй.";
      setCameraError(message);
      onToast(message);
    } finally {
      if (mountedRef.current) setScanning(false);
      processingRef.current = false;
    }
  }, [event.id, onToast]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let active = true;
    let scanner;

    const start = async () => {
      try {
        scanner = await startQrCameraScanner(videoRef.current, value => {
          if (active && !processingRef.current) approveTicket(value);
        });
        if (!active) scanner.stop();
      } catch (reason) {
        if (!active) return;
        setCameraError(reason.message || "Камер нээж чадсангүй. Camera permission-ээ шалгана уу.");
        setCameraOpen(false);
      }
    };

    start();
    return () => {
      active = false;
      scanner?.stop();
    };
  }, [approveTicket, cameraOpen]);

  const restart = () => {
    processingRef.current = false;
    setCameraError("");
    setResult(null);
    setCameraOpen(true);
  };

  return <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-3 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Secure QR approval</p><p className="mt-1 text-xs text-slate-300">Камер UniNet-ийн DB-д hash-аар бүртгэгдсэн төлбөртэй QR-г уншмагц ирцийг бүртгэнэ.</p></div>
      {!cameraOpen && !scanning && <button type="button" onClick={restart} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-[10px] font-bold text-white"><RotateCcw className="h-3.5 w-3.5" />Дахин QR шалгах</button>}
    </div>
    {cameraOpen && <><video ref={videoRef} muted playsInline className="mx-auto max-h-[420px] w-full rounded-xl bg-black object-cover" /><p className="mt-2 text-center text-[10px] text-slate-300">Camera permission зөвшөөрөөд Student-ийн QR-г хүрээнд байрлуулна.</p></>}
    {scanning && <div role="status" className="rounded-xl border border-blue-700 bg-blue-950 p-4 text-center text-xs font-bold text-blue-100">QR-г серверээр шалгаж байна...</div>}
    {cameraError && !scanning && <div role="alert" className="rounded-xl border border-rose-700 bg-rose-950 p-4 text-xs text-rose-100">{cameraError}</div>}
    {result && !scanning && <div aria-live="polite" className={`rounded-xl border p-4 text-xs ${result.alreadyRecorded ? "border-amber-600 bg-amber-950 text-amber-100" : "border-emerald-600 bg-emerald-950 text-emerald-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{result.alreadyRecorded ? "ALREADY APPROVED" : "APPROVED"}</b><span>{result.attendedAt ? formatDateTime(result.attendedAt) : ""}</span></div>
      <p className="mt-2">{result.student} · {result.university} · {result.event}</p>
    </div>}
  </div>;
}

function ContentDescriptionPanel({ content, user, canManageRegistrations, onToast }) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const canScanOwnEvent = user.role === "STAFF"
    && content.type === "EVENT"
    && content.pricingType === "PAID"
    && content.status === "PUBLISHED"
    && content.createdById === user.id
    && canManageRegistrations;

  return <section className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-sm font-bold text-slate-900">{content.type === "EVENT" ? "Event-ийн дэлгэрэнгүй тайлбар" : "Дэлгэрэнгүй тайлбар"}</h3>
        {content.type === "EVENT" && content.startsAt && content.endsAt && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{formatDateTime(content.startsAt)} — {formatDateTime(content.endsAt)}</p>}
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{content.description || content.shortDescription || "Тайлбар оруулаагүй байна."}</p>
      </div>
      {canScanOwnEvent && <button type="button" onClick={() => setScannerOpen(value => !value)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700"><Camera className="h-4 w-4" />{scannerOpen ? "Scanner хаах" : "QR шалгах"}</button>}
    </div>
    {canScanOwnEvent && <p className="mt-4 rounded-lg bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">QR шалгахыг нээхэд camera permission хүснэ. Зөвхөн UniNet серверийн гарын үсэгтэй, энэ event-д хамаарах, төлбөр нь баталгаажсан ticket APPROVED болно.</p>}
    {scannerOpen && <EventQrApprovalScanner event={content} onToast={onToast} />}
  </section>;
}

function CreateContent({ onToast, user, partnerships = [], onSaved }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState("EVENT");
  const [visibility, setVisibility] = useState("PRIVATE");
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [organization, setOrganization] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState("On-site");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const [pricingType, setPricingType] = useState("FREE");
  const [priceAmount, setPriceAmount] = useState("");
  const [currency, setCurrency] = useState("MNT");
  const [compensation, setCompensation] = useState("");
  const [requirements, setRequirements] = useState("");
  const [surveyQuestions, setSurveyQuestions] = useState("");
  const [selectedPartners, setSelectedPartners] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const activePartners = partnerships.filter(item => item.status === "ACTIVE");
  const universityName = typeof user.university === "string"
    ? user.university
    : user.university?.shortName || user.university?.name || user.school || "таны сургууль";
  const parsedQuestions = surveyQuestions.split("\n").map(value => value.trim()).filter(Boolean);
  const fieldClass = "mt-2 w-full rounded-xl border border-slate-200 p-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

  const validateStep = currentStep => {
    if (currentStep === 2) {
      if (title.trim().length < 3) return "Гарчгийг хамгийн багадаа 3 тэмдэгтээр оруулна уу.";
      if (type === "SURVEY" && description.trim().length < 3) return "Судалгааны тайлбарыг оруулна уу.";
      if (type !== "SURVEY" && shortDescription.trim().length < 3) return "Товч тайлбарыг оруулна уу.";
      if (type !== "SURVEY" && description.trim().length < 3) return "Дэлгэрэнгүй тайлбарыг оруулна уу.";
    }
    if (currentStep === 3 && type === "EVENT" && (!startsAt || !endsAt)) return "Арга хэмжээний эхлэх болон дуусах огноо, цагийг оруулна уу.";
    if (currentStep === 3 && type === "EVENT" && new Date(endsAt) <= new Date(startsAt)) return "Дуусах огноо, цаг нь эхлэх огноо, цагаас хойш байна.";
    if (currentStep === 3 && type === "EVENT" && pricingType === "PAID" && (!Number.isInteger(Number(priceAmount)) || Number(priceAmount) <= 0)) return "Төлбөртэй event-ийн тасалбарын үнийг 0-ээс их бүхэл тоогоор оруулна уу.";
    if (currentStep === 3 && type === "SURVEY" && parsedQuestions.length === 0) return "Хамгийн багадаа нэг асуулт оруулна уу.";
    return "";
  };
  const next = () => {
    const message = validateStep(step);
    if (message) { setError(message); return; }
    setError(""); setStep(value => Math.min(5, value + 1));
  };
  const types = ["EVENT", "INTERNSHIP", "JOB", "RESEARCH", "SURVEY", "ANNOUNCEMENT"];
  const contentPayload = status => ({
      type,
      title: title.trim(),
      shortDescription: shortDescription.trim(),
      description: description.trim(),
      visibility,
      status,
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(["INTERNSHIP", "JOB"].includes(type) && organization.trim() ? { organization: organization.trim() } : {}),
      ...(type === "EVENT" && location.trim() ? { location: location.trim() } : {}),
      ...(["INTERNSHIP", "JOB"].includes(type) ? { mode } : {}),
      ...(type === "EVENT" && startsAt ? { startsAt: toIsoFromLocalDateTime(startsAt) } : {}),
      ...(type === "EVENT" && endsAt ? { endsAt: toIsoFromLocalDateTime(endsAt) } : {}),
      ...(["INTERNSHIP", "JOB", "RESEARCH", "ANNOUNCEMENT"].includes(type) && deadlineAt ? { deadlineAt } : {}),
      ...(type === "EVENT" && capacity ? { capacity: Number(capacity) } : {}),
      ...(type === "EVENT" ? { pricingType, priceAmount: pricingType === "PAID" ? Number(priceAmount) : 0, currency } : {}),
      details: {
        tags: tags.split(",").map(value => value.trim()).filter(Boolean),
        ...(requirements.trim() ? { requirements: requirements.trim() } : {}),
        ...(compensation.trim() ? { compensation: compensation.trim() } : {}),
        ...(visibility === "PARTNERS" ? { partnershipIds: selectedPartners } : {}),
      },
    });
  const saveContent = async status => {
    const validationError = validateStep(2) || validateStep(3);
    if (validationError) { setError(validationError); return; }
    setSaving(true); setError("");
    try {
      const savedStatus = type === "SURVEY" ? (status === "DRAFT" ? "DRAFT" : "PUBLISHED") : status;
      if (type === "SURVEY") {
        await operationsService.createSurvey({
          title: title.trim(),
          description: description.trim(),
          status: savedStatus,
          questions: parsedQuestions,
        });
      } else {
        const effectiveStatus = type === "EVENT" && user.role === "STAFF" && status !== "DRAFT" ? "PENDING_APPROVAL" : status;
        await operationsService.createContent(contentPayload(effectiveStatus));
      }
      const effectiveSavedStatus = type === "EVENT" && user.role === "STAFF" && savedStatus !== "DRAFT" ? "PENDING_APPROVAL" : savedStatus;
      onToast(effectiveSavedStatus === "DRAFT" ? "Контент database-д нооргоор хадгалагдлаа." : type === "SURVEY" ? "Судалгаа нийтлэгдэж, оюутнуудад хүрлээ." : effectiveSavedStatus === "PUBLISHED" ? "Контент нийтлэгдлээ." : "Event University Admin-д батлуулахаар амжилттай илгээгдлээ.");
      await onSaved?.({ status: effectiveSavedStatus, type });
    } catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  return (
    <>
      <PageHeader title="Шинэ контент" description="Таван алхмаар мэдээллээ бэлтгэж, ноорог хадгалах эсвэл батлуулахаар илгээнэ." />
      <div className="mb-6 flex gap-2 overflow-x-auto">{["Төрөл", "Үндсэн мэдээлэл", "Тусгай мэдээлэл", "Audience", "Preview"].map((label, index) => <div key={label} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${step === index + 1 ? "bg-blue-600 text-white" : "bg-white text-slate-400"}`}>{index + 1}. {label}</div>)}</div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
        {error && <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</div>}
        {step === 1 && <div><h2 className="font-display mb-5 text-xl font-bold">Контентын төрөл</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{types.map(item => <button key={item} type="button" onClick={() => setType(item)} className={`rounded-xl border p-5 text-sm font-bold ${type === item ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200"}`}>{item}</button>)}</div></div>}
        {step === 2 && <div className="grid gap-4 md:grid-cols-2"><label className="md:col-span-2 text-xs font-bold">Гарчиг *<input value={title} onChange={event => setTitle(event.target.value)} className={fieldClass} /></label>{type !== "SURVEY" && <label className="md:col-span-2 text-xs font-bold">Товч тайлбар *<textarea value={shortDescription} onChange={event => setShortDescription(event.target.value)} maxLength="500" rows="3" className={fieldClass} /></label>}<label className="md:col-span-2 text-xs font-bold">{type === "SURVEY" ? "Судалгааны тайлбар" : "Дэлгэрэнгүй тайлбар"} *<textarea value={description} onChange={event => setDescription(event.target.value)} rows="6" className={fieldClass} /></label>{type !== "SURVEY" && <><label className="text-xs font-bold">Category<input value={category} onChange={event => setCategory(event.target.value)} className={fieldClass} /></label><label className="text-xs font-bold">Tags<input value={tags} onChange={event => setTags(event.target.value)} placeholder="AI, технологи" className={fieldClass} /></label></>}</div>}
        {step === 3 && <div>
          <h2 className="font-display mb-5 text-xl font-bold">{type} мэдээлэл</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {type === "EVENT" && <>
              <label className="text-xs font-bold">Эхлэх огноо, цаг *<input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} required className={fieldClass} /></label>
              <label className="text-xs font-bold">Дуусах огноо, цаг *<input type="datetime-local" min={startsAt || undefined} value={endsAt} onChange={event => setEndsAt(event.target.value)} required className={fieldClass} /></label>
              <label className="text-xs font-bold">Байршил<input value={location} onChange={event => setLocation(event.target.value)} className={fieldClass} /></label>
              <label className="text-xs font-bold">Багтаамж<input type="number" value={capacity} onChange={event => setCapacity(event.target.value)} min="1" className={fieldClass} /></label>
              <label className="text-xs font-bold">Тасалбарын төрөл<NativeStyledSelect value={pricingType} onChange={event => setPricingType(event.target.value)} className={fieldClass}><option value="FREE">FREE · Үнэгүй</option><option value="PAID">PAID · Төлбөртэй</option></NativeStyledSelect></label>
              {pricingType === "PAID" && <>
                <label className="text-xs font-bold">Тасалбарын үнэ *<input type="number" min="1" step="1" value={priceAmount} onChange={event => setPriceAmount(event.target.value)} placeholder="25000" className={fieldClass} /></label>
                <label className="text-xs font-bold">Валют<NativeStyledSelect value={currency} onChange={event => setCurrency(event.target.value)} className={fieldClass}><option value="MNT">MNT · ₮</option></NativeStyledSelect></label>
              </>}
            </>}
            {["INTERNSHIP", "JOB"].includes(type) && <>
              <label className="text-xs font-bold">Байгууллага<input value={organization} onChange={event => setOrganization(event.target.value)} className={fieldClass} /></label>
              <label className="text-xs font-bold">Deadline<input type="date" value={deadlineAt} onChange={event => setDeadlineAt(event.target.value)} className={fieldClass} /></label>
              <label className="text-xs font-bold">Work mode<NativeStyledSelect value={mode} onChange={event => setMode(event.target.value)} className={fieldClass}><option>On-site</option><option>Hybrid</option><option>Remote</option></NativeStyledSelect></label>
              <label className="text-xs font-bold">Цалин / нөхөн олговор<input value={compensation} onChange={event => setCompensation(event.target.value)} className={fieldClass} /></label>
              <label className="md:col-span-2 text-xs font-bold">Requirements<textarea value={requirements} onChange={event => setRequirements(event.target.value)} rows="5" className={fieldClass} /></label>
            </>}
            {type === "SURVEY" && <label className="md:col-span-2 text-xs font-bold">Асуултууд — мөр бүрт нэг асуулт *<textarea value={surveyQuestions} onChange={event => setSurveyQuestions(event.target.value)} rows="9" placeholder="Эхний асуултаа энд оруулна уу" className={fieldClass} /><span className="mt-2 block text-[10px] font-medium text-slate-400">{parsedQuestions.length} асуулт</span></label>}
            {!["EVENT", "INTERNSHIP", "JOB", "SURVEY"].includes(type) && <>
              <label className="text-xs font-bold">Field / Category<input value={category} onChange={event => setCategory(event.target.value)} className={fieldClass} /></label>
              <label className="text-xs font-bold">Deadline<input type="date" value={deadlineAt} onChange={event => setDeadlineAt(event.target.value)} className={fieldClass} /></label>
              <label className="md:col-span-2 text-xs font-bold">Requirements / Attachments<textarea value={requirements} onChange={event => setRequirements(event.target.value)} rows="6" className={fieldClass} /></label>
            </>}
          </div>
        </div>}
        {step === 4 && <div><h2 className="font-display mb-5 text-xl font-bold">Audience ба visibility</h2>{type === "SURVEY" ? <p className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-800">Судалгаа {universityName}-ийн оюутнуудад хүрнэ.</p> : <><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{["PRIVATE", "PARTNERS", "NETWORK", "PUBLIC"].map(item => <button key={item} type="button" onClick={() => setVisibility(item)} className={`rounded-xl border p-5 text-sm font-bold ${visibility === item ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200"}`}>{item}</button>)}</div>{visibility === "PARTNERS" && <div className="mt-5 rounded-xl bg-amber-50 p-5"><p className="text-xs font-bold text-amber-800">Идэвхтэй хамтрагч сургуулиуд</p>{activePartners.length ? <div className="mt-3 flex flex-wrap gap-3">{activePartners.map(item => <label key={item.id} className="text-sm"><input type="checkbox" checked={selectedPartners.includes(item.id)} onChange={event => setSelectedPartners(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} className="mr-2" />{item.university}</label>)}</div> : <p className="mt-3 text-xs text-amber-700">Идэвхтэй түншлэл одоогоор алга.</p>}</div>}<p className="mt-5 rounded-xl bg-blue-50 p-4 text-xs text-blue-800">{visibility === "PRIVATE" ? `Зөвхөн ${universityName}-ийн хэрэглэгчид харна.` : `${visibility} хүрээнд батлагдсаны дараа харагдана.`}</p></>}</div>}
        {step === 5 && <div>
          <h2 className="font-display mb-5 text-xl font-bold">Preview ба илгээх</h2>
          <div className="rounded-2xl border border-slate-200 p-6">
            <div className="flex justify-between"><span className="text-xs font-bold text-blue-600">{type}</span><VisibilityBadge value={type === "SURVEY" ? "PRIVATE" : visibility} /></div>
            <h3 className="font-display mt-4 text-xl font-bold">{title || "Гарчиг оруулаагүй"}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{type === "SURVEY" ? description : shortDescription}</p>
            {type === "EVENT" && <>
              <p className="mt-4 text-xs font-bold text-slate-700">{formatDateTime(startsAt)} — {formatDateTime(endsAt)}</p>
              <div className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{pricingType === "PAID" ? `PAID · ${Number(priceAmount || 0).toLocaleString()} ₮` : "FREE · Үнэгүй"}</div>
            </>}
          </div>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">{type === "SURVEY" ? "Судалгаа нийтлэгдсэний дараа оюутнууд бөглөх боломжтой болно." : user.permissions?.includes("PUBLISH_CONTENT") ? "Та шууд нийтлэх эрхтэй." : "Танд canPublish эрх байхгүй тул University Admin-д батлуулахаар илгээгдэнэ."}</div>
        </div>}
        <div className="mt-8 flex justify-between border-t border-slate-100 pt-5"><button type="button" disabled={step === 1 || saving} onClick={() => setStep(value => value - 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold disabled:opacity-40">Өмнөх</button><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => saveContent("DRAFT")} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold disabled:opacity-50">Ноорог хадгалах</button>{step < 5 ? <button type="button" disabled={saving} onClick={next} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Дараах</button> : <button type="button" disabled={saving} onClick={() => saveContent(type === "EVENT" && user.role === "STAFF" ? "PENDING_APPROVAL" : user.permissions?.includes("PUBLISH_CONTENT") ? "PUBLISHED" : "PENDING_APPROVAL")} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "Хадгалж байна..." : type === "SURVEY" ? "Судалгаа нийтлэх" : "Батлуулахаар илгээх"}</button>}</div></div>
      </div>
    </>
  );
}

const formQuestionTypes = [
  ["SHORT_TEXT", "Богино хариулт"],
  ["PARAGRAPH", "Дэлгэрэнгүй хариулт"],
  ["MULTIPLE_CHOICE", "Нэг сонголт"],
  ["CHECKBOXES", "Олон сонголт"],
  ["DROPDOWN", "Dropdown"],
  ["RATING", "Үнэлгээ (1–5)"],
];

const newFormQuestion = () => ({
  id: crypto.randomUUID(),
  title: "",
  type: "SHORT_TEXT",
  required: false,
  options: ["Сонголт 1", "Сонголт 2"],
});

function StaffFormsBuilder({ onToast }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("PRIVATE");
  const [questions, setQuestions] = useState([newFormQuestion()]);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [managedSurveys, setManagedSurveys] = useState([]);
  const [surveyPagination, setSurveyPagination] = useState(null);
  const [loadingSurveys, setLoadingSurveys] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [surveySearchDraft, setSurveySearchDraft] = useState("");
  const [surveySearch, setSurveySearch] = useState("");
  const [surveyStatus, setSurveyStatus] = useState("ALL");
  const [surveyVisibility, setSurveyVisibility] = useState("ALL");
  const [surveyPage, setSurveyPage] = useState(1);
  const [surveyPageSize, setSurveyPageSize] = useState(10);

  const loadManagedSurveys = useCallback(async () => {
    setLoadingSurveys(true);
    try {
      const payload = await operationsService.listManagedSurveys({
        page: surveyPage,
        pageSize: surveyPageSize,
        search: surveySearch,
        status: surveyStatus,
        visibility: surveyVisibility,
      });
      setManagedSurveys(payload.surveys || []);
      setSurveyPagination(payload.pagination || null);
    } catch (reason) { setError(reason.message); }
    finally { setLoadingSurveys(false); }
  }, [surveyPage, surveyPageSize, surveySearch, surveyStatus, surveyVisibility]);

  useEffect(() => { const timer = window.setTimeout(loadManagedSurveys, 0); return () => window.clearTimeout(timer); }, [loadManagedSurveys]);

  const resetEditor = () => {
    setTitle(""); setDescription(""); setVisibility("PRIVATE"); setQuestions([newFormQuestion()]); setPreview(false); setEditingId(null); setError("");
  };

  const editSurvey = survey => {
    setEditingId(survey.id);
    setTitle(survey.title || "");
    setDescription(survey.description || "");
    setVisibility(survey.visibility || "PRIVATE");
    setQuestions((survey.questions || []).map((question, index) => typeof question === "string"
      ? { ...newFormQuestion(), id: `legacy-${index}`, title: question, type: "PARAGRAPH" }
      : { ...question, options: question.options || [] }));
    setPreview(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateQuestion = (id, patch) => setQuestions(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  const addQuestion = () => setQuestions(items => [...items, newFormQuestion()]);
  const duplicateQuestion = question => setQuestions(items => [...items, { ...question, id: crypto.randomUUID() }]);
  const removeQuestion = id => setQuestions(items => items.length === 1 ? items : items.filter(item => item.id !== id));
  const usesOptions = type => ["MULTIPLE_CHOICE", "CHECKBOXES", "DROPDOWN"].includes(type);
  const updateOption = (questionId, index, value) => setQuestions(items => items.map(item => item.id === questionId
    ? { ...item, options: item.options.map((option, optionIndex) => optionIndex === index ? value : option) }
    : item));
  const addOption = questionId => setQuestions(items => items.map(item => item.id === questionId
    ? { ...item, options: [...item.options, `Сонголт ${item.options.length + 1}`] }
    : item));
  const removeOption = (questionId, index) => setQuestions(items => items.map(item => item.id === questionId
    ? { ...item, options: item.options.filter((_, optionIndex) => optionIndex !== index) }
    : item));

  const save = async status => {
    setError("");
    if (title.trim().length < 3) return setError("Формын гарчгийг хамгийн багадаа 3 тэмдэгтээр оруулна уу.");
    if (description.trim().length < 3) return setError("Формын тайлбарыг оруулна уу.");
    if (questions.some(question => question.title.trim().length < 2)) return setError("Асуулт бүрийн гарчгийг бөглөнө үү.");
    if (questions.some(question => usesOptions(question.type) && question.options.filter(option => option.trim()).length < 2)) return setError("Сонголттой асуулт бүр хамгийн багадаа 2 сонголттой байна.");
    setSaving(true);
    try {
      const survey = {
        title: title.trim(),
        description: description.trim(),
        visibility,
        questions: questions.map(question => ({ ...question, title: question.title.trim(), options: question.options.filter(option => option.trim()) })),
      };
      if (editingId) {
        await operationsService.updateSurvey(editingId, survey);
        if (status === "PUBLISHED") await operationsService.updateSurveyStatus(editingId, "PUBLISHED");
      } else {
        await operationsService.createSurvey({ ...survey, status });
      }
      onToast(status === "PUBLISHED" ? "Судалгаа нийтлэгдэж, оюутнуудад хүрлээ." : "Судалгаа ноорогт хадгалагдлаа.");
      resetEditor();
      await loadManagedSurveys();
    } catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };

  const changeStatus = async (survey, status) => {
    setError("");
    try {
      await operationsService.updateSurveyStatus(survey.id, status);
      onToast(`Судалгааны төлөв ${status} боллоо.`);
      await loadManagedSurveys();
    } catch (reason) { setError(reason.message); }
  };

  const deleteDraft = async () => {
    try {
      await operationsService.deleteSurvey(pendingDelete.id);
      if (editingId === pendingDelete.id) resetEditor();
      setPendingDelete(null);
      onToast("Ноорог судалгааг устгалаа.");
      await loadManagedSurveys();
    } catch (reason) { setPendingDelete(null); setError(reason.message); }
  };

  return (
    <>
      <PageHeader eyebrow="Form builder" title="Судалгаа ба асуулга" description="Оюутнуудад зориулсан судалгаа, санал асуулгыг Google Forms-той төстэй builder ашиглан үүсгэнэ."
        actions={<div className="flex gap-2">{editingId && <button type="button" onClick={resetEditor} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold">Шинэ форм</button>}<button type="button" onClick={() => setPreview(value => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold"><Eye className="h-4 w-4" />{preview ? "Засварлах" : "Preview"}</button></div>} />
      <div className="mx-auto max-w-4xl">
        {error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}
        {preview ? (
          <div className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-xl">
            <div className="h-3 bg-gradient-to-r from-violet-600 to-blue-600" />
            <div className="p-6 md:p-9"><div className="mb-3"><VisibilityBadge value={visibility} /></div><h2 className="font-display text-3xl font-bold">{title || "Гарчиггүй форм"}</h2><p className="mt-3 text-sm leading-relaxed text-slate-500">{description || "Формын тайлбар"}</p></div>
            <div className="space-y-4 bg-slate-50 p-5 md:p-8">{questions.map((question, index) => <FormQuestionPreview key={question.id} question={question} index={index} />)}</div>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm">
              <div className="h-3 bg-gradient-to-r from-violet-600 to-blue-600" />
              <div className="p-6 md:p-8">
                <label className="block text-xs font-bold text-slate-600">Формын гарчиг <span className="text-rose-600">*</span><input value={title} onChange={event => { setTitle(event.target.value); setError(""); }} placeholder="Жишээ: Оюутны сэтгэл ханамжийн судалгаа" aria-label="Формын гарчиг" className="mt-2 w-full border-b-2 border-slate-200 pb-3 font-display text-3xl font-bold outline-none transition focus:border-violet-600" /><span className="mt-1 block text-right text-[10px] font-normal text-slate-400">{title.trim().length}/3+ тэмдэгт</span></label>
                <label className="mt-4 block text-xs font-bold text-slate-600">Формын тайлбар <span className="text-rose-600">*</span><textarea value={description} onChange={event => { setDescription(event.target.value); setError(""); }} placeholder="Судалгааны зорилго, тайлбар" aria-label="Формын тайлбар" rows="2" className="mt-2 w-full resize-none border-b border-slate-200 pb-2 text-sm font-normal text-slate-600 outline-none focus:border-violet-600" /></label>
                <div className="mt-5 grid gap-3 sm:grid-cols-[180px_1fr] sm:items-center">
                  <label className="text-xs font-bold text-slate-700">Харагдах хүрээ
                    <NativeStyledSelect value={visibility} onChange={event => setVisibility(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10">
                      <option value="PRIVATE">PRIVATE</option>
                      <option value="PARTNERS">PARTNERS</option>
                      <option value="NETWORK">NETWORK</option>
                      <option value="PUBLIC">PUBLIC</option>
                    </NativeStyledSelect>
                  </label>
                  <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">{visibility === "PRIVATE" ? "Зөвхөн өөрийн сургуулийн оюутнууд харна." : visibility === "PARTNERS" ? "Өөрийн сургууль болон идэвхтэй түнш сургуулиуд харна." : visibility === "NETWORK" ? "UniNet сүлжээний бүх идэвхтэй оюутан харна." : "Бүх UniNet хэрэглэгчид харах нээлттэй хүрээ."}</p>
                </div>
              </div>
            </section>
            {questions.map((question, index) => (
              <section key={question.id} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition focus-within:border-violet-300 focus-within:shadow-lg md:p-7">
                <div className="mb-4 flex justify-center text-slate-300"><GripVertical className="h-5 w-5 rotate-90" /></div>
                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  <label><span className="sr-only">Асуулт {index + 1}</span><input value={question.title} onChange={event => { updateQuestion(question.id, { title: event.target.value }); setError(""); }} placeholder={`Асуулт ${index + 1}`} className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-violet-500/10" /></label>
                  <StyledSelect value={question.type} ariaLabel={`Асуулт ${index + 1}-ийн төрөл`} onChange={value => updateQuestion(question.id, { type: value })} options={formQuestionTypes.map(([value, label]) => ({ value, label }))} className="w-full" />
                </div>
                {usesOptions(question.type) && <div className="mt-5 space-y-2">{question.options.map((option, optionIndex) => <div key={`${question.id}-${optionIndex}`} className="flex items-center gap-3"><span className={`h-4 w-4 border border-slate-300 ${question.type === "MULTIPLE_CHOICE" ? "rounded-full" : "rounded"}`} /><input value={option} onChange={event => updateOption(question.id, optionIndex, event.target.value)} className="min-w-0 flex-1 border-b border-slate-200 py-2 text-sm outline-none focus:border-violet-500" /><button type="button" onClick={() => removeOption(question.id, optionIndex)} disabled={question.options.length <= 2} aria-label="Сонголт устгах" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => addOption(question.id)} className="ml-7 mt-2 text-xs font-bold text-violet-600">+ Сонголт нэмэх</button></div>}
                {question.type === "SHORT_TEXT" && <div className="mt-6 w-1/2 border-b border-dashed border-slate-300 pb-2 text-xs text-slate-400">Богино хариултын текст</div>}
                {question.type === "PARAGRAPH" && <div className="mt-6 w-full border-b border-dashed border-slate-300 pb-2 text-xs text-slate-400">Дэлгэрэнгүй хариултын текст</div>}
                {question.type === "RATING" && <div className="mt-6 flex gap-3">{[1, 2, 3, 4, 5].map(value => <span key={value} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-xs font-bold text-slate-500">{value}</span>)}</div>}
                <div className="mt-7 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => duplicateQuestion(question)} aria-label="Асуулт хувилах" className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100"><Copy className="h-4 w-4" /></button>
                  <button type="button" onClick={() => removeQuestion(question.id)} disabled={questions.length === 1} aria-label="Асуулт устгах" className="rounded-xl p-2.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                  <span className="mx-2 h-7 w-px bg-slate-200" />
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">Required<input type="checkbox" checked={question.required} onChange={event => updateQuestion(question.id, { required: event.target.checked })} className="h-4 w-4 accent-violet-600" /></label>
                </div>
              </section>
            ))}
            <button type="button" onClick={addQuestion} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 px-5 py-4 text-sm font-bold text-violet-700 transition hover:border-violet-400 hover:bg-violet-50"><Plus className="h-5 w-5" />Асуулт нэмэх</button>
          </div>
        )}
        <div className="sticky bottom-4 mt-6 flex flex-wrap justify-end gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
          {editingId && <span className="mr-auto self-center text-xs font-bold text-violet-700">Ноорог засаж байна</span>}
          <button type="button" disabled={saving} onClick={() => save("DRAFT")} className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold disabled:opacity-50">Ноорог хадгалах</button>
          <button type="button" disabled={saving} onClick={() => save("PUBLISHED")} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-violet-600/20 disabled:opacity-50"><Send className="h-4 w-4" />{saving ? "Хадгалж байна..." : "Оюутнуудад нийтлэх"}</button>
        </div>
        <section className="mt-10 border-t border-slate-200 pt-8">
          <div className="mb-5"><h2 className="font-display text-xl font-bold">Миний судалгаанууд</h2><p className="mt-1 text-sm text-slate-500">Backend search, status, visibility болон pagination ашиглан судалгаануудаа удирдана.</p></div>
          <form onSubmit={event => { event.preventDefault(); setSurveyPage(1); setSurveySearch(surveySearchDraft.trim()); }} className="mb-5 grid items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 2xl:grid-cols-[minmax(220px,1fr)_minmax(160px,.8fr)_minmax(160px,.8fr)_minmax(120px,.6fr)_minmax(110px,auto)]">
            <label className="text-xs font-bold text-slate-600">Хайлт<input type="search" value={surveySearchDraft} onChange={event => setSurveySearchDraft(event.target.value)} placeholder="Гарчиг эсвэл тайлбар" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-500" /></label>
            <StyledSelect label="Төлөв" value={surveyStatus} onChange={value => { setSurveyPage(1); setSurveyStatus(value); }} options={[{ value: "ALL", label: "Бүгд" }, ...["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"].map(value => ({ value, label: value }))]} />
            <StyledSelect label="Visibility" value={surveyVisibility} onChange={value => { setSurveyPage(1); setSurveyVisibility(value); }} options={[{ value: "ALL", label: "Бүгд" }, ...["PRIVATE", "PARTNERS", "NETWORK", "PUBLIC"].map(value => ({ value, label: value }))]} />
            <StyledSelect label="Мөр" value={String(surveyPageSize)} onChange={value => { setSurveyPage(1); setSurveyPageSize(Number(value)); }} options={[10, 20, 50].map(value => ({ value: String(value), label: `${value} мөр` }))} />
            <button type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">Хайх</button>
          </form>
          {loadingSurveys ? <LoadingSkeleton /> : !managedSurveys.length ? <EmptyState title="Шүүлтүүрт тохирох судалгаа алга." /> : <div className="space-y-3">{managedSurveys.map(survey => <article key={survey.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-bold">{survey.title}</h3><Badge value={survey.status} /><VisibilityBadge value={survey.visibility || "PRIVATE"} /></div><p className="mt-2 text-xs text-slate-500">{survey._count?.responses || 0} хариулт · schema v{survey.schemaVersion}</p></div>
              <div className="flex flex-wrap gap-2">{survey.status === "DRAFT" && <><button type="button" onClick={() => editSurvey(survey)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold">Засах</button><button type="button" onClick={() => changeStatus(survey, "PUBLISHED")} className="rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-bold text-white">Нийтлэх</button><button type="button" onClick={() => setPendingDelete(survey)} className="rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-600">Устгах</button></>}{survey.status === "PUBLISHED" && <button type="button" onClick={() => changeStatus(survey, "CLOSED")} className="rounded-lg border border-amber-200 px-3 py-2 text-[10px] font-bold text-amber-700">Хаах</button>}{survey.status === "CLOSED" && <><button type="button" onClick={() => changeStatus(survey, "PUBLISHED")} className="rounded-lg border border-emerald-200 px-3 py-2 text-[10px] font-bold text-emerald-700">Дахин нээх</button><button type="button" onClick={() => changeStatus(survey, "ARCHIVED")} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold">Архивлах</button></>}</div>
            </div>
          </article>)}</div>}
          {surveyPagination && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs"><span>Нийт <b>{surveyPagination.total}</b> · {surveyPagination.page}/{Math.max(1, surveyPagination.pageCount)} хуудас</span><div className="flex gap-2"><button type="button" disabled={surveyPagination.page <= 1} onClick={() => setSurveyPage(value => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Өмнөх</button><button type="button" disabled={surveyPagination.page >= surveyPagination.pageCount} onClick={() => setSurveyPage(value => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Дараах</button></div></div>}
        </section>
      </div>
      <section className="mt-10 border-t border-slate-200 pt-10"><div className="mb-5"><p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">Нэгтгэсэн workspace</p><h2 className="font-display mt-1 text-2xl font-bold">Бөглөсөн хүмүүс ба судалгааны хариулт</h2><p className="mt-2 text-sm text-slate-500">Survey builder-ээс гаралгүй respondent count, aggregate хариулт, CSV тайланг харна.</p></div><SurveyReportsPage embedded /></section>
      {pendingDelete && <ConfirmDialog title="Ноорог устгах уу?" description={`“${pendingDelete.title}” судалгааг буцаах боломжгүйгээр устгана.`} confirmLabel="Устгах" danger onClose={() => setPendingDelete(null)} onConfirm={deleteDraft} />}
    </>
  );
}

function FormQuestionPreview({ question, index }) {
  const label = <h3 className="font-display text-sm font-bold text-slate-900">{index + 1}. {question.title || "Гарчиггүй асуулт"}{question.required && <span className="ml-1 text-rose-600">*</span>}</h3>;
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">{label}<div className="mt-4">{question.type === "PARAGRAPH" ? <textarea disabled rows="3" placeholder="Таны хариулт" className="w-full rounded-xl border border-slate-200 p-3 text-sm" /> : question.type === "SHORT_TEXT" ? <input disabled placeholder="Таны хариулт" className="w-full border-b border-slate-200 py-2 text-sm" /> : question.type === "RATING" ? <div className="flex gap-2">{[1,2,3,4,5].map(value => <button disabled key={value} className="h-10 w-10 rounded-full border border-slate-200 text-xs font-bold">{value}</button>)}</div> : question.type === "DROPDOWN" ? <NativeStyledSelect disabled className="w-full rounded-xl border border-slate-200 p-3 text-sm"><option>Сонгох</option>{question.options.map(option => <option key={option}>{option}</option>)}</NativeStyledSelect> : <div className="space-y-3">{question.options.map(option => <label key={option} className="flex gap-3 text-sm text-slate-600"><input disabled type={question.type === "CHECKBOXES" ? "checkbox" : "radio"} />{option}</label>)}</div>}</div></section>;
}

function ApprovalPage({ data, admin, onAction }) {
  const rows = data.staffContent.filter(item => ["PENDING_APPROVAL", "CHANGES_REQUESTED", "APPROVED", "REJECTED"].includes(item.status));
  return (
    <>
      <PageHeader title={admin ? "Publish баталгаажуулалт" : "Баталгаажуулалтын төлөв"} description={admin ? "Гадагш хуваалцах контентыг preview, visibility болон audit мэдээлэлтэй нь шалгана." : "Илгээсэн контентын review comment болон approval timeline-ийг хянана."} />
      <DataTable rows={rows} actions={onAction} columns={[{ key: "title", label: "Контент", render: value => <b>{value}</b> }, { key: "creator", label: "Үүсгэсэн" }, { key: "visibility", label: "Visibility", render: value => <VisibilityBadge value={value} /> }, { key: "status", label: "Статус", render: value => <Badge value={value} /> }, { key: "created", label: "Илгээсэн" }]} />
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-display font-bold">Approval төлөвийн тойм</h2><div className="mt-5 grid gap-3 md:grid-cols-4">{["PENDING_APPROVAL", "CHANGES_REQUESTED", "APPROVED", "REJECTED"].map(status => <div key={status} className="rounded-xl bg-slate-50 p-4"><b className="font-display text-2xl">{rows.filter(item => item.status === status).length}</b><p className="mt-1 text-[10px] font-bold text-slate-400">{status}</p></div>)}</div></div>
    </>
  );
}

function SurveyReportsPage({ embedded = false }) {
  const [surveys, setSurveys] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    operationsService.listManagedSurveys().then(payload => {
      const items = payload.surveys || [];
      setSurveys(items);
      if (items.length) setSelectedId(items[0].id);
    }).catch(reason => setError(reason.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    operationsService.getSurveyReport(selectedId)
      .then(payload => { if (!cancelled) setReport(payload); })
      .catch(reason => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  if (error) return <ErrorState message={error} />;
  const totalResponses = surveys.reduce((sum, item) => sum + (item._count?.responses || 0), 0);
  return <>{!embedded && <PageHeader title="Судалгааны хариулт ба аналитик" description="Судалгааны бодит хариулт, асуулт бүрийн aggregate болон CSV тайлан." />}<div className="mb-6 grid gap-4 md:grid-cols-3"><StatCard value={surveys.length} label="Нийт судалгаа" /><StatCard value={totalResponses} label="Нийт хариулт" /><StatCard value={surveys.filter(item => item._count?.responses > 0).length} label="Хариулттай судалгаа" /></div>
    {!surveys.length ? <EmptyState title="Одоогоор судалгаа алга." /> : <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <nav aria-label="Судалгааны тайлан" className="space-y-2">{surveys.map(item => <button key={item.id} type="button" onClick={() => { setReport(null); setLoading(true); setSelectedId(item.id); }} className={`w-full rounded-xl border p-4 text-left transition ${selectedId === item.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}><span className="block font-display text-sm font-bold">{item.title}</span><span className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-400"><Badge value={item.status} />{item._count?.responses || 0} хариулт</span></button>)}</nav>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 md:p-7">{loading || !report ? <LoadingSkeleton /> : <><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-display text-xl font-bold">{report.survey.title}</h2><p className="mt-2 text-sm text-slate-500">{report.survey.description}</p></div><button type="button" onClick={() => operationsService.downloadSurveyResponses(report.survey.id, `${report.survey.title}.csv`).catch(reason => setError(reason.message))} className="rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">CSV татах</button></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2"><StatCard value={report.report.responseCount} label="Хариултын тоо" /><StatCard value={`v${report.survey.schemaVersion}`} label="Form schema" /></div>
        <div className="mt-7 space-y-4">{report.report.questions.map((question, index) => <article key={question.questionId} className="rounded-xl bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-display text-sm font-bold">{index + 1}. {question.title}</h3><span className="text-[10px] font-bold text-slate-400">{question.answeredCount} бөглөсөн · {question.skippedCount} алгассан</span></div>{Object.keys(question.optionCounts).length > 0 && <div className="mt-4 space-y-2">{Object.entries(question.optionCounts).map(([option, count]) => <div key={option} className="grid grid-cols-[minmax(80px,1fr)_3fr_36px] items-center gap-3 text-xs"><span className="truncate font-semibold">{option}</span><span className="h-2 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${question.answeredCount ? count / question.answeredCount * 100 : 0}%` }} /></span><b>{count}</b></div>)}</div>}</article>)}</div>
      </>}</section>
    </div>}
  </>;
}

function UserManagement({ data, route, onAction }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState(route.endsWith("/staff") ? "STAFF" : route.endsWith("/students") ? "STUDENT" : "ALL");
  const rows = data.users.filter(item => (role === "ALL" || item.role === role) && `${item.name} ${item.email}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader title={route.endsWith("/staff") ? "Ажилтны удирдлага" : route.endsWith("/students") ? "Оюутны удирдлага" : route.includes("/admins") ? "University Admin-ууд" : "Хэрэглэгчийн удирдлага"}
        description="Tenant хүрээнд хэрэглэгчийн төлөв, role, department болон зөвшөөрлийг удирдана." />
      <FilterBar search={search} onSearch={setSearch}><SelectFilter label="Role" value={role} onChange={setRole} options={["STUDENT", "STAFF", "UNIVERSITY_ADMIN"]} /></FilterBar>
      <DataTable rows={rows} actions={onAction} columns={[{ key: "name", label: "Хэрэглэгч", render: value => <b>{value}</b> }, { key: "email", label: "Имэйл" }, { key: "role", label: "Role", render: value => <Badge value={value} /> }, { key: "department", label: "Салбар / хэлтэс" }, { key: "status", label: "Төлөв", render: value => <Badge value={value} /> }, { key: "joined", label: "Нэгдсэн" }, { key: "lastActive", label: "Сүүлд идэвхтэй" }]} />
    </>
  );
}

function RolesPermissions() {
  const permissions = ["Контент үүсгэх", "Контент нийтлэх", "Контент батлах", "Бүртгэл удирдах", "Өргөдөл удирдах", "Судалгаа удирдах", "Аналитик харах", "Staff удирдах", "Оюутан удирдах", "Түншлэл удирдах", "Audit харах"];
  return (
    <>
      <PageHeader title="Role ба эрх" description="University Admin, Staff, Student role-ийн permission matrix. Platform Super Admin эрхийг эндээс олгох боломжгүй." />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[700px] text-xs"><thead className="bg-slate-50"><tr><th className="p-4 text-left">Permission</th><th>University Admin</th><th>Staff</th><th>Student</th></tr></thead><tbody className="divide-y divide-slate-100">{permissions.map((item, index) => <tr key={item}><td className="p-4 font-bold">{item}</td><td className="text-center">Тийм</td><td className="text-center">{index < 2 || index === 3 || index === 4 ? "Боломжтой" : "Admin олгоно"}</td><td className="text-center">{index === 3 ? "Өөрийн" : "Үгүй"}</td></tr>)}</tbody></table></div>
      <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800">Энэ хүснэгт role capability-г read-only харуулна. Хэрэглэгч тус бүрийн permission editor backend endpoint-той хамт дараагийн шатанд нэмэгдэнэ.</p>
    </>
  );
}

function PartnershipPage({ data, onAction }) {
  const [status, setStatus] = useState("ALL");
  const rows = (data.partnerships || []).filter(item => status === "ALL" || item.status === status);
  return (
    <>
      <PageHeader title="Түншлэлийн удирдлага" description="Идэвхтэй түншлэл болон ирсэн/илгээсэн урилгыг нэг дэлгэцээс бодитоор удирдана." />
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4"><StatCard value={(data.partnerships || []).length} label="Нийт" /><StatCard value={(data.partnerships || []).filter(item => item.status === "PENDING").length} label="Хүлээгдэж буй" /><StatCard value={(data.partnerships || []).filter(item => item.status === "ACTIVE").length} label="Идэвхтэй" /><StatCard value={(data.partnerships || []).reduce((sum,item)=>sum+Number(item.shared||0),0)} label="Хуваалцсан контент" /></div>
      <FilterBar><SelectFilter label="Төлөв" value={status} onChange={setStatus} options={["PENDING", "ACTIVE", "REJECTED", "ENDED"]} /></FilterBar>
      <DataTable rows={rows} actions={onAction} columns={[{ key: "university", label: "Сургууль", render: value => <b>{value}</b> }, { key: "status", label: "Төлөв", render: value => <Badge value={value} /> }, { key: "requestedBy", label: "Хүсэлт гаргасан" }, { key: "requested", label: "Хүсэлтийн огноо" }, { key: "activated", label: "Идэвхжсэн" }, { key: "shared", label: "Хуваалцсан контент" }]} />
    </>
  );
}

function ReportsPage({ global = false, onToast, data }) {
  const analytics = data?.analytics || {};
  const sum = object => Object.values(object || {}).reduce((total, value) => total + Number(value || 0), 0);
  const userTotal = sum(analytics.usersByRole);
  const contentTotal = sum(analytics.contentByStatus);
  const registrationTotal = sum(analytics.registrationsByStatus);
  const applicationTotal = sum(analytics.applicationsByStatus);
  const aggregateRows = [
    ...Object.entries(analytics.usersByRole || {}).map(([key,value]) => ({ category: "USER_ROLE", key, value })),
    ...Object.entries(analytics.contentByStatus || {}).map(([key,value]) => ({ category: "CONTENT_STATUS", key, value })),
    ...Object.entries(analytics.registrationsByStatus || {}).map(([key,value]) => ({ category: "REGISTRATION_STATUS", key, value })),
    ...Object.entries(analytics.applicationsByStatus || {}).map(([key,value]) => ({ category: "APPLICATION_STATUS", key, value })),
  ];
  const bars = Object.entries(analytics.contentByVisibility || {});
  const max = Math.max(1, ...bars.map(([,value]) => value));
  return (
    <>
      <PageHeader title={global ? "Global Analytics" : "Тайлан ба аналитик"} description="Эдгээр үзүүлэлт mock биш. PostgreSQL count/groupBy query-гээс хүсэлт бүрт бодитоор тооцогдоно."
        actions={<button type="button" onClick={() => { if (exportRowsCsv(aggregateRows, "uninet-live-analytics.csv")) onToast("Live aggregate CSV татлаа."); }} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">CSV export</button>} />
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800"><b>Source: {analytics.source || "POSTGRESQL"}</b> · Тооцоолсон: {analytics.generatedAt ? formatDateTime(analytics.generatedAt) : "—"}</div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4"><StatCard value={userTotal.toLocaleString()} label="Нийт хэрэглэгч" /><StatCard value={contentTotal.toLocaleString()} label="Нийт контент" /><StatCard value={registrationTotal.toLocaleString()} label="Нийт бүртгэл" /><StatCard value={applicationTotal.toLocaleString()} label="Нийт өргөдөл" /></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-display mb-5 font-bold">Контентын visibility</h2>{bars.length ? bars.map(([label,count]) => <div key={label} className="mb-4"><div className="mb-1 flex justify-between text-xs"><span>{label}</span><b>{count}</b></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${Number(count)/max*100}%` }} /></div></div>) : <EmptyState title="Контентын aggregate алга." />}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-display mb-5 font-bold">Судалгаа ба security</h2><dl className="grid grid-cols-2 gap-4 text-center"><div className="rounded-xl bg-slate-50 p-4"><dt className="text-[10px] text-slate-400">Судалгаа</dt><dd className="font-display mt-2 text-2xl font-bold">{analytics.surveyCount || 0}</dd></div><div className="rounded-xl bg-slate-50 p-4"><dt className="text-[10px] text-slate-400">Survey response</dt><dd className="font-display mt-2 text-2xl font-bold">{analytics.surveyResponseCount || 0}</dd></div><div className="rounded-xl bg-slate-50 p-4"><dt className="text-[10px] text-slate-400">Active session</dt><dd className="font-display mt-2 text-2xl font-bold">{analytics.security?.activeSessionCount || 0}</dd></div><div className="rounded-xl bg-rose-50 p-4"><dt className="text-[10px] text-rose-500">Blocked SQL input</dt><dd className="font-display mt-2 text-2xl font-bold text-rose-700">{analytics.security?.sqlInjectionBlockedCount || 0}</dd></div></dl></section>
      </div>
    </>
  );
}

function SeverityBadge({ value }) {
  const styles = value === "INFO" ? "bg-blue-50 text-blue-700"
    : ["WARN", "WARNING", "MEDIUM"].includes(value) ? "bg-amber-50 text-amber-700"
      : ["HIGH", "CRITICAL", "ERROR"].includes(value) ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${styles}`}>{value || "UNKNOWN"}</span>;
}

function prettyAuditValue(value) {
  if (value == null || value === "—") return "Өгөгдөл байхгүй";
  try { return JSON.stringify(JSON.parse(value), null, 2); }
  catch { return String(value); }
}

function AuditValue({ label, value, tone }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${tone === "next" ? "border-emerald-100 bg-emerald-50/60" : "border-slate-200 bg-slate-50"}`}>
      <div className={`mb-2 text-[10px] font-bold uppercase tracking-wider ${tone === "next" ? "text-emerald-700" : "text-slate-400"}`}>{label}</div>
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-slate-600">{prettyAuditValue(value)}</pre>
    </div>
  );
}

function AuditPage({ data, global }) {
  const rows = data.auditLogs || [];
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("ALL");
  const severityOptions = [...new Set(rows.map(row => row.severity).filter(Boolean))];
  const filtered = rows.filter(row => {
    const matchesSeverity = severity === "ALL" || row.severity === severity;
    const haystack = `${row.actor} ${row.role} ${row.university} ${row.action} ${row.resource} ${row.date}`.toLowerCase();
    return matchesSeverity && haystack.includes(search.trim().toLowerCase());
  });
  const criticalCount = rows.filter(row => ["HIGH", "CRITICAL", "ERROR"].includes(row.severity)).length;
  return (
    <>
      <PageHeader title={global ? "Global Audit Logs" : "Audit Log"} description="Audit бүртгэлийг хэвтээ scroll-гүй, үйлдэл тус бүрээр нь хураангуй болон дэлгэрэнгүй өөрчлөлттэй харуулна." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard value={rows.length.toLocaleString()} label="Нийт audit үйлдэл" />
        <StatCard value={criticalCount.toLocaleString()} label="Өндөр эрсдэлтэй" />
        <StatCard value={filtered.length.toLocaleString()} label="Шүүлтүүрийн үр дүн" />
      </div>
      <FilterBar search={search} onSearch={setSearch}>
        <SelectFilter label="Severity" value={severity} onChange={setSeverity} options={severityOptions} />
      </FilterBar>
      {!filtered.length ? <EmptyState title="Audit бүртгэл олдсонгүй." description="Хайлт эсвэл severity шүүлтүүрээ өөрчилнө үү." /> : (
        <div className="space-y-3">
          {filtered.map(row => (
            <details key={row.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 open:border-blue-200 open:shadow-lg open:shadow-blue-600/5">
              <summary className="cursor-pointer list-none p-4 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden md:p-5">
                <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)_minmax(0,.9fr)_auto] md:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><UserRound className="h-5 w-5" /></span>
                    <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{row.actor}</div><div className="truncate text-[10px] font-semibold text-slate-400">{row.role}</div></div>
                  </div>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="break-words text-xs text-slate-800">{row.action}</b><SeverityBadge value={row.severity} /></div><p className="mt-1 break-words text-[11px] text-slate-500">{row.resource}</p></div>
                  <div className="min-w-0 space-y-1 text-[10px] text-slate-500"><div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{row.university}</span></div><div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 shrink-0" /><span>{row.date}</span></div></div>
                  <ChevronDown className="h-5 w-5 justify-self-end text-slate-400 transition duration-200 group-open:rotate-180 group-open:text-blue-600" aria-hidden="true" />
                </div>
              </summary>
              <div className="border-t border-slate-100 bg-slate-50/40 p-4 md:p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500"><Database className="h-4 w-4 text-blue-600" /><span>Өөрчлөлтийн snapshot</span>{["HIGH", "CRITICAL", "ERROR"].includes(row.severity) && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-700"><ShieldAlert className="h-3.5 w-3.5" />Нягтлах шаардлагатай</span>}</div>
                <div className="grid min-w-0 gap-4 lg:grid-cols-2"><AuditValue label="Өмнөх утга" value={row.previous} /><AuditValue label="Шинэ утга" value={row.next} tone="next" /></div>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

function UniversityDomainConsole({ universityId, onClose, onToast, onChanged }) {
  const [payload, setPayload] = useState(null);
  const [newDomain, setNewDomain] = useState("");
  const [evidence, setEvidence] = useState("Local demo administrator approval");
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const [profileDraft, setProfileDraft] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await operationsService.getUniversity(universityId);
      setPayload(next);
      setProfileDraft(current => current || Object.fromEntries([
        "name","shortName","description","logoUrl","websiteUrl","address","contactEmail","contactPhone","primaryColor","secondaryColor","rectorName","establishedYear"
      ].map(key => [key, next.university?.[key] ?? ""])));
    }
    catch (reason) { setError(reason); }
  }, [universityId]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  const run = async (key, work, message) => {
    setBusy(key); setError(null);
    try {
      const result = await work();
      if (result?.verification?.challenge) setChallenge(result.verification);
      await load(); await onChanged?.(); onToast(message);
      return true;
    } catch (reason) { setError(reason); return false; }
    finally { setBusy(""); }
  };

  if (!payload && !error) return <Modal title="University domain management" onClose={onClose} wide><LoadingSkeleton /></Modal>;
  const status = errorScreenStatus(error);
  const university = payload?.university;
  return <Modal title={university ? `${university.shortName} · Domain management` : "University domain management"} onClose={onClose} wide>
    {error && (status
      ? <HttpErrorState status={status} error={error} onRetry={load} compact />
      : <ErrorState message={mongolianErrorMessage(error)} onRetry={load} />)}
    {university && <div className="space-y-5">
      <section className="grid gap-3 rounded-2xl bg-slate-50 p-5 text-xs md:grid-cols-4">
        <div><span className="text-slate-400">Төлөв</span><div className="mt-1"><Badge value={university.status} /></div></div>
        <div><span className="text-slate-400">Хэрэглэгч</span><b className="mt-1 block text-lg">{payload.stats.users}</b></div>
        <div><span className="text-slate-400">Roster</span><b className="mt-1 block text-lg">{payload.stats.rosterMembers}</b></div>
        <div><span className="text-slate-400">Контент / Survey</span><b className="mt-1 block text-lg">{payload.stats.contents} / {payload.stats.surveys}</b></div>
      </section>

      {profileDraft && <section className="rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display font-bold">Их сургуулийн үндсэн мэдээлэл</h3><p className="mt-1 text-xs text-slate-500">Нэр, лого, branding болон холбоо барих мэдээллийг бодитоор шинэчилнэ.</p></div>{profileDraft.logoUrl && <img src={profileDraft.logoUrl} alt="University logo" className="h-14 w-14 rounded-xl border object-contain" />}</div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">{[["name","Албан ёсны нэр"],["shortName","Товч нэр"],["logoUrl","Лого URL"],["websiteUrl","Вэбсайт"],["contactEmail","Холбоо барих имэйл"],["contactPhone","Утас"],["rectorName","Удирдлагын нэр"],["establishedYear","Байгуулагдсан он"],["address","Хаяг"]].map(([key,label]) => <label key={key} className="text-xs font-bold">{label}<input type={key === "establishedYear" ? "number" : key.toLowerCase().includes("email") ? "email" : "text"} value={profileDraft[key] ?? ""} onChange={event => setProfileDraft(current => ({ ...current, [key]: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal" /></label>)}<label className="text-xs font-bold">Үндсэн өнгө<input type="color" value={profileDraft.primaryColor || "#2563eb"} onChange={event => setProfileDraft(current => ({ ...current, primaryColor: event.target.value }))} className="mt-2 h-11 w-full rounded-lg border p-1" /></label><label className="text-xs font-bold">Хоёрдогч өнгө<input type="color" value={profileDraft.secondaryColor || "#7c3aed"} onChange={event => setProfileDraft(current => ({ ...current, secondaryColor: event.target.value }))} className="mt-2 h-11 w-full rounded-lg border p-1" /></label><label className="text-xs font-bold md:col-span-2">Тайлбар<textarea rows="4" value={profileDraft.description || ""} onChange={event => setProfileDraft(current => ({ ...current, description: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal" /></label></div>
        <button type="button" disabled={Boolean(busy)} onClick={() => run("profile", () => operationsService.updateUniversity(university.id, profileDraft), "Их сургуулийн профайл database-д шинэчлэгдлээ.")} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy === "profile" ? "Хадгалж байна..." : "Үндсэн мэдээлэл хадгалах"}</button>
      </section>}

      <section className="rounded-2xl border border-slate-200 p-5">
        <h3 className="font-display font-bold">Шинэ домэйн нэмэх</h3>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input value={newDomain} onChange={event => setNewDomain(event.target.value.trim().toLowerCase())} placeholder="example.edu.mn" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm" />
          <button type="button" disabled={busy || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(newDomain)} onClick={async () => { if (await run("add", () => operationsService.addUniversityDomain(university.id, newDomain), "Домэйн нэмэгдэж audit log үүслээ.")) setNewDomain(""); }} className="rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold text-white disabled:opacity-40">{busy === "add" ? "Нэмж байна..." : "Домэйн нэмэх"}</button>
        </div>
      </section>

      <section className="space-y-3">
        {(university.domains || []).map(domain => <article key={domain.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h4 className="font-display font-bold">{domain.domain}</h4><div className="mt-2 flex flex-wrap gap-2"><Badge value={domain.verificationStatus} />{domain.isPrimary && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">PRIMARY</span>}{!domain.isActive && <Badge value="INACTIVE" />}</div></div>
            <div className="flex flex-wrap justify-end gap-2">
              {!domain.isVerified && <button type="button" disabled={Boolean(busy)} onClick={() => run(`request-${domain.id}`, () => operationsService.requestDomainVerification(university.id, domain.id, "ADMIN_APPROVAL", evidence), "Administrative verification хүсэлт үүслээ.")} className="rounded-lg border border-amber-200 px-3 py-2 text-[10px] font-bold text-amber-700">Хүсэлт үүсгэх</button>}
              {domain.verificationStatus === "PENDING" && <button type="button" disabled={Boolean(busy) || evidence.trim().length < 3} onClick={() => run(`verify-${domain.id}`, () => operationsService.verifyUniversityDomain(university.id, domain.id, evidence.trim()), "Домэйн баталгаажиж audit log үүслээ.")} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-40">Admin approval</button>}
              {domain.isVerified && !domain.isPrimary && <button type="button" disabled={Boolean(busy)} onClick={() => run(`primary-${domain.id}`, () => operationsService.makePrimaryUniversityDomain(university.id, domain.id), "Primary domain шинэчлэгдлээ.")} className="rounded-lg border border-blue-200 px-3 py-2 text-[10px] font-bold text-blue-700">Primary болгох</button>}
              {!domain.isPrimary && domain.isActive && <button type="button" disabled={Boolean(busy)} onClick={() => run(`revoke-${domain.id}`, () => operationsService.revokeUniversityDomain(university.id, domain.id, "Demo domain revoke"), "Домэйн хүчингүй боллоо.")} className="rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-600">Revoke</button>}
            </div>
          </div>
          {domain.verificationStatus === "PENDING" && <label className="mt-4 block text-xs font-bold text-slate-600">Баталгаажуулалтын нотолгоо<input value={evidence} onChange={event => setEvidence(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal" /></label>}
        </article>)}
      </section>

      {challenge && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-xs text-blue-800"><b>DNS TXT challenge</b><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono">{JSON.stringify(challenge.dnsRecord, null, 2)}</pre></section>}

      <section className="rounded-2xl border border-slate-200 p-5">
        <h3 className="font-display font-bold">University төлөв</h3>
        <p className="mt-2 text-xs text-slate-500">ACTIVE болгохын өмнө дор хаяж нэг verified, active domain шаардлагатай. Suspend хийхэд тухайн сургуулийн session-ууд revoke хийгдэнэ.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {university.status !== "ACTIVE" && <button type="button" disabled={Boolean(busy)} onClick={() => run("activate", () => operationsService.updateUniversityStatus(university.id, "ACTIVE"), "Их сургууль идэвхжлээ.")} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">ACTIVE</button>}
          {university.status === "ACTIVE" && <button type="button" disabled={Boolean(busy)} onClick={() => run("suspend", () => operationsService.updateUniversityStatus(university.id, "SUSPENDED"), "Их сургууль түдгэлзэж session-ууд revoke хийгдлээ.")} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">SUSPEND</button>}
        </div>
      </section>
    </div>}
  </Modal>;
}

function UniversityManagement({ data, onToast, onChanged }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const rows = data.universities.filter(item => (status === "ALL" || item.status === status) && `${item.name} ${item.domain}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader title="Их сургуулийн удирдлага" description="Workspace, verified domain, status, tenant statistics болон audit-тай operational удирдлага." />
      <FilterBar search={search} onSearch={setSearch}><SelectFilter label="Төлөв" value={status} onChange={setStatus} options={["PENDING", "ACTIVE", "SUSPENDED", "INACTIVE"]} /></FilterBar>
      <DataTable rows={rows} actions={setSelected} columns={[{ key: "name", label: "Сургууль", render: value => <b>{value}</b> }, { key: "domain", label: "Verified domain" }, { key: "admin", label: "Admin" }, { key: "users", label: "Хэрэглэгч" }, { key: "content", label: "Контент" }, { key: "partnerships", label: "Түншлэл" }, { key: "status", label: "Төлөв", render: value => <Badge value={value} /> }, { key: "created", label: "Үүссэн" }]} />
      {selected && <UniversityDomainConsole universityId={selected.id} onClose={() => setSelected(null)} onToast={onToast} onChanged={onChanged} />}
    </>
  );
}

function UniversityOnboarding({ onToast, onCreated }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", shortName: "", slug: "", description: "", domain: "", status: "PENDING" });
  const [created, setCreated] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const next = () => {
    if (step === 1 && (!form.name.trim() || !form.shortName.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug))) {
      setError("Нэр, товч нэр болон зөв format-тай slug оруулна уу."); return;
    }
    if (step === 2 && !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(form.domain)) {
      setError("Албан ёсны email domain-ийг зөв оруулна уу."); return;
    }
    setError(""); setStep(value => Math.min(3, value + 1));
  };
  const createUniversity = async () => {
    setSaving(true); setError("");
    try {
      const result = await operationsService.createUniversity(form);
      setCreated(result.university);
      await onCreated?.();
      onToast("University workspace database-д амжилттай үүслээ.");
    } catch (reason) { setError(reason.message || "Сургууль үүсгэж чадсангүй."); }
    finally { setSaving(false); }
  };
  if (created) return <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center"><h1 className="font-display text-3xl font-bold text-emerald-900">Сургууль database-д үүслээ</h1><div className="mx-auto mt-6 grid max-w-2xl gap-3 md:grid-cols-3"><div className="rounded-xl bg-white p-4 text-xs font-bold text-emerald-700">{created.shortName}</div><div className="rounded-xl bg-white p-4 text-xs font-bold text-emerald-700">Төлөв: {created.status}</div><div className="rounded-xl bg-white p-4 text-xs font-bold text-amber-700">Домэйн баталгаажуулалт хүлээгдэж байна</div></div></div>;
  return (
    <>
      <PageHeader title="Шинэ сургууль нэмэх" description="University болон primary domain-ийг database-д үүсгэж onboarding-ийг эхлүүлнэ." />
      <div className="mb-6 flex gap-2 overflow-x-auto">{["Үндсэн мэдээлэл", "Домэйн", "Review"].map((item, index) => <span key={item} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${step === index + 1 ? "bg-blue-600 text-white" : "bg-white text-slate-400"}`}>{index + 1}. {item}</span>)}</div>
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">{error}</div>}
        {step === 1 && <div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-bold">Албан ёсны нэр<input value={form.name} onChange={event => update("name", event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label><label className="text-xs font-bold">Товч нэр<input value={form.shortName} onChange={event => update("shortName", event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label><label className="text-xs font-bold">Slug<input value={form.slug} onChange={event => update("slug", event.target.value.toLowerCase())} placeholder="university-name" className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label><label className="md:col-span-2 text-xs font-bold">Тайлбар<textarea value={form.description} onChange={event => update("description", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label></div>}
        {step === 2 && <div><label className="text-xs font-bold">Primary email domain<input value={form.domain} onChange={event => update("domain", event.target.value.trim().toLowerCase())} placeholder="university.edu.mn" className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label><p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">Domain эхлээд unverified төлөвтэй үүснэ. Ownership verification хийсний дараа student registration-д ашиглагдана.</p></div>}
        {step === 3 && <div className="space-y-4"><div className="rounded-xl bg-slate-50 p-6"><h2 className="font-display font-bold">Review</h2><dl className="mt-4 grid gap-3 text-sm md:grid-cols-2"><div><dt className="text-xs text-slate-400">Сургууль</dt><dd className="font-bold">{form.name} ({form.shortName})</dd></div><div><dt className="text-xs text-slate-400">Domain</dt><dd className="font-bold">{form.domain}</dd></div></dl></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800"><b>Анхны төлөв: PENDING</b><p className="mt-1 leading-relaxed">Backend баталгаажсан active domain байхгүй сургуулийг ACTIVE болгохгүй. Үүсгэсний дараа Domain management-аар баталгаажуулна.</p></div></div>}
        <div className="mt-8 flex justify-between border-t border-slate-100 pt-5"><button type="button" disabled={step === 1 || saving} onClick={() => setStep(value => value - 1)} className="rounded-lg border px-4 py-2 text-xs font-bold disabled:opacity-40">Өмнөх</button>{step < 3 ? <button type="button" onClick={next} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">Дараах</button> : <button type="button" disabled={saving} onClick={createUniversity} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "Үүсгэж байна..." : "University үүсгэх"}</button>}</div>
      </div>
    </>
  );
}

function UniversityProfilePage({ onToast }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await operationsService.getOwnUniversityProfile();
      setProfile(payload.university);
    } catch (reason) {
      setError(reason.message || "Сургуулийн профайлыг ачаалж чадсангүй.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadProfile, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);
  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  const selectLogoFile = file => {
    setLogoFile(file);
    setLogoPreview(file ? URL.createObjectURL(file) : "");
  };

  if (loading) return <LoadingSkeleton variant="profile" />;
  if (!profile) return <ErrorState message={error || "Сургуулийн профайлыг ачаалж чадсангүй."} onRetry={loadProfile} />;

  const update = (key, value) => setProfile(current => ({ ...current, [key]: value }));
  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const fields = ["name", "shortName", "description", "logoUrl", "websiteUrl", "address", "contactEmail", "contactPhone", "primaryColor", "secondaryColor", "rectorName", "establishedYear"];
      const body = Object.fromEntries(fields.map(key => [key, profile[key] ?? ""]));
      // Uploaded logos use a server-owned relative URL and are already persisted by
      // the upload endpoint. Do not send that URL through the external URL validator.
      if (String(body.logoUrl || "").startsWith("/api/public/")) delete body.logoUrl;
      const result = await operationsService.updateOwnUniversityProfile(body);
      setProfile(result.university);
      window.dispatchEvent(new CustomEvent("uninet:university-profile-updated", { detail: result.university }));
      onToast("Сургуулийн профайлыг database-д хадгаллаа.");
    } catch (reason) {
      setError(reason.message || "Профайлыг хадгалж чадсангүй.");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async () => {
    if (!logoFile || logoUploading) return;
    setLogoUploading(true);
    setError("");
    try {
      const result = await operationsService.uploadUniversityLogo(logoFile);
      const updatedProfile = { ...profile, logoUrl: result.logoUrl };
      setProfile(updatedProfile);
      window.dispatchEvent(new CustomEvent("uninet:university-profile-updated", { detail: updatedProfile }));
      selectLogoFile(null);
      onToast("Сургуулийн лого амжилттай upload хийгдлээ.");
    } catch (reason) {
      setError(reason.message || "Лого upload хийж чадсангүй.");
    } finally {
      setLogoUploading(false);
    }
  };

  const logoSource = logoPreview || resolveApiAssetUrl(profile.logoUrl);
  return <>
    <PageHeader title="Сургуулийн профайл" description="University Admin өөрийн сургуулийн branding, холбоо барих болон үндсэн мэдээллийг бодитоор шинэчилнэ." />
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mx-auto grid h-28 w-28 place-items-center overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
          {logoSource ? <img src={logoSource} alt="University logo" className="h-full w-full object-contain" /> : <Building2 className="h-10 w-10 text-slate-300" />}
        </div>
        <h2 className="font-display mt-5 text-center text-xl font-bold">{profile.shortName}</h2>
        <p className="mt-1 text-center text-xs text-slate-400">{profile.status}</p>
        <label className="mt-5 block text-xs font-bold">Лого URL
          <input type="url" value={String(profile.logoUrl || "").startsWith("/api/public/") ? "" : profile.logoUrl || ""} onChange={event => update("logoUrl", event.target.value)} placeholder="https://..." className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal" />
        </label>
        <div className="my-4 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-300"><span className="h-px flex-1 bg-slate-200" />эсвэл upload<span className="h-px flex-1 bg-slate-200" /></div>
        <label className="block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50">
          JPG, PNG эсвэл WebP сонгох
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => selectLogoFile(event.target.files?.[0] || null)} className="sr-only" />
        </label>
        {logoFile && <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="truncate text-[10px] text-slate-500">{logoFile.name}</p><button type="button" disabled={logoUploading} onClick={uploadLogo} className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{logoUploading ? "Upload хийж байна..." : "Сонгосон логог upload хийх"}</button></div>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-[10px] font-bold">Үндсэн өнгө<input type="color" value={profile.primaryColor || "#2563eb"} onChange={event => update("primaryColor", event.target.value)} className="mt-2 h-11 w-full rounded-lg border p-1" /></label>
          <label className="text-[10px] font-bold">Хоёрдогч өнгө<input type="color" value={profile.secondaryColor || "#7c3aed"} onChange={event => update("secondaryColor", event.target.value)} className="mt-2 h-11 w-full rounded-lg border p-1" /></label>
        </div>
      </aside>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
        {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><span>{error}</span><button type="button" onClick={loadProfile} className="rounded-lg bg-white px-3 py-2 font-bold shadow-sm">Дахин ачаалах</button></div>}
        <div className="grid gap-4 md:grid-cols-2">
          {[ ["name", "Албан ёсны нэр"], ["shortName", "Товч нэр"], ["websiteUrl", "Вэбсайт"], ["contactEmail", "Холбоо барих имэйл"], ["contactPhone", "Утас"], ["rectorName", "Удирдлагын нэр"], ["establishedYear", "Байгуулагдсан он"], ["address", "Хаяг"] ].map(([key, label]) => <label key={key} className="text-xs font-bold">{label}<input type={key === "establishedYear" ? "number" : key.toLowerCase().includes("email") ? "email" : key === "websiteUrl" ? "url" : "text"} value={profile[key] || ""} onChange={event => update(key, event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal" /></label>)}
          <label className="text-xs font-bold md:col-span-2">Тайлбар<textarea rows="5" value={profile.description || ""} onChange={event => update("description", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal" /></label>
        </div>
        <button disabled={saving || logoUploading} className="mt-6 rounded-xl bg-slate-900 px-6 py-3 text-xs font-bold text-white disabled:opacity-50">{saving ? "Хадгалж байна..." : "Профайл хадгалах"}</button>
      </section>
    </form>
  </>;
}

function FeedbackAdminPage({ onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [updatingId, setUpdatingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await operationsService.listFeedback({ search, status, pageSize: 50 });
      setItems(result.feedback || []);
    } catch (reason) {
      setError(reason.message || "Санал хүсэлтийн жагсаалтыг ачаалж чадсангүй.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [load]);

  const updateStatus = async (item, nextStatus) => {
    setUpdatingId(item.id);
    try {
      const result = await operationsService.updateFeedbackStatus(item.id, nextStatus);
      setItems(current => current.map(value => value.id === item.id ? result.feedback : value));
      onToast(`Санал хүсэлтийг ${nextStatus} төлөвт шилжүүллээ.`);
    } catch (reason) {
      onToast(reason.message || "Санал хүсэлтийн төлөвийг шинэчилж чадсангүй.");
    } finally {
      setUpdatingId("");
    }
  };

  return <>
    <PageHeader title="Санал хүсэлт" description="Хэрэглэгчдийн Settings → Send feedback хэсгээс ирсэн санал, алдаа болон шинэ боломжийн хүсэлтийг бодитоор удирдана." />
    <FilterBar search={search} onSearch={setSearch}>
      <SelectFilter label="Төлөв" value={status} onChange={setStatus} options={["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]} />
    </FilterBar>
    {loading ? <LoadingSkeleton variant="table" /> : error ? <ErrorState message={error} onRetry={load} /> : !items.length ? <EmptyState title="Энэ шүүлтүүрт санал хүсэлт алга байна." /> : <div className="space-y-4">
      {items.map(item => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge value={item.status} /><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{item.category}</span></div><h2 className="font-display mt-3 text-lg font-bold">{item.subject}</h2></div><time className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</time></div>
        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">{item.message}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><div className="text-xs text-slate-500"><b className="text-slate-800">{item.sender.name}</b> · {item.sender.email} · {item.sender.university} · {item.sender.role}</div><div className="flex flex-wrap gap-2">{["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"].filter(value => value !== item.status).map(value => <button key={value} type="button" disabled={updatingId === item.id} onClick={() => updateStatus(item, value)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-700 disabled:opacity-40">{value}</button>)}</div></div>
      </article>)}
    </div>}
  </>;
}

function OperationsNotificationsPage({ notifications = [], onOpen, onMarkAll }) {
  const unread = notifications.filter(item => !item.read).length;
  return <>
    <PageHeader eyebrow="Realtime notifications" title="Мэдэгдэл" description="Мэдэгдэл дээр дарахад холбогдох контент, бүртгэл эсвэл удирдлагын хэсэг шууд нээгдэнэ." actions={unread > 0 ? <button type="button" onClick={onMarkAll} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700"><CheckCheck className="h-4 w-4" />Бүгдийг уншсан</button> : null} />
    {!notifications.length ? <EmptyState title="Одоогоор мэдэгдэл алга байна." /> : <div className="space-y-3">{notifications.map(item => <button key={item.id} type="button" onClick={() => onOpen(item)} className={`block w-full rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg ${item.read ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50/70"}`}><div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${item.read ? "bg-slate-100 text-slate-500" : "bg-blue-600 text-white"}`}><Bell className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-slate-900">{item.title}</b><time className="text-[10px] text-slate-400">{item.time || item.createdAt || ""}</time></span><span className="mt-2 block text-xs leading-relaxed text-slate-500">{item.description}</span>{item.actionUrl && <span className="mt-3 inline-flex text-[10px] font-bold text-blue-600">Холбогдох хэсгийг нээх →</span>}</span></div></button>)}</div>}
  </>;
}

function MonitoringPage({ data }) {
  const analytics = data.analytics || {};
  return (
    <>
      <PageHeader title="System Monitoring ба Security" description="API, PostgreSQL, Redis, runtime memory болон security audit-ийн бодит telemetry." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{(data.systemHealth || []).map(item => <div key={item.service} className="card-effect rounded-2xl border border-slate-200 bg-white p-6"><div className="flex justify-between gap-3"><h2 className="font-display font-bold">{item.service}</h2><Badge value={item.status} /></div><dl className="mt-5 grid grid-cols-2 gap-3 text-center"><div><dt className="text-[9px] text-slate-400">Response</dt><dd className="mt-1 text-xs font-bold">{item.response}</dd></div><div><dt className="text-[9px] text-slate-400">Uptime/state</dt><dd className="mt-1 text-xs font-bold">{item.uptime}</dd></div></dl><p className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-relaxed text-slate-400">{item.detail}</p></div>)}</div>
      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-3"><ShieldAlert className="h-6 w-6 text-rose-600" /><div><h2 className="font-display font-bold">Security controls</h2><p className="text-xs text-slate-500">Prisma parameterized query + request SQL injection signature guard + audit trail</p></div></div><div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4"><StatCard value={analytics.security?.activeSessionCount || 0} label="Active sessions" /><StatCard value={analytics.security?.sqlInjectionBlockedCount || 0} label="SQL injection blocked" /><StatCard value={analytics.security?.criticalAuditCount || 0} label="Critical audit" /><StatCard value="ACTIVE" label="CSP / Helmet" /></div></section>
    </>
  );
}

function AttendanceScanner({ data, user, onToast, onScanned }) {
  const events = (data.staffContent || []).filter(item => item.type === "EVENT"
    && item.pricingType === "PAID"
    && ["PUBLISHED", "ACTIVE"].includes(item.status)
    && (user.role !== "STAFF" || item.createdById === user.id));
  const [eventId, setEventId] = useState("");
  const [ticket, setTicket] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);
  const processingRef = useRef(false);
  const selectedEventId = eventId || events[0]?.id || "";

  const recordAttendance = useCallback(async (eventIdToScan, rawTicket) => {
    const scannedTicket = rawTicket.trim();
    if (processingRef.current || !eventIdToScan || !scannedTicket) return;
    processingRef.current = true;
    setScanning(true);
    setResult(null);
    setCameraError("");
    setCameraOpen(false);
    try {
      const attendance = await operationsService.scanAttendance(eventIdToScan, scannedTicket);
      setResult(attendance);
      setTicket("");
      await onScanned();
      onToast(attendance.alreadyRecorded ? "Already approved — энэ QR тасалбар өмнө нь баталгаажсан байна." : "QR уншигдмагц ирц амжилттай бүртгэгдлээ.");
    } catch (reason) {
      const message = reason.message || "Энэ QR манай сайтаас үүссэн, төлбөр баталгаажсан тасалбар биш байна.";
      setCameraError(message);
      onToast(message);
    } finally {
      setScanning(false);
      processingRef.current = false;
    }
  }, [onScanned, onToast]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let active = true;
    let scanner;
    const start = async () => {
      try {
        scanner = await startQrCameraScanner(videoRef.current, value => {
          if (!active || processingRef.current) return;
          setTicket(value);
          recordAttendance(selectedEventId, value);
        });
        if (!active) scanner.stop();
      } catch (reason) {
        if (!active) return;
        setCameraError(reason.message || "Камер нээж чадсангүй.");
        setCameraOpen(false);
      }
    };
    start();
    return () => {
      active = false;
      scanner?.stop();
    };
  }, [cameraOpen, recordAttendance, selectedEventId]);

  const submit = async event => {
    event.preventDefault();
    if (!selectedEventId || !ticket.trim()) return;
    await recordAttendance(selectedEventId, ticket);
  };

  return <section className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Secure attendance</p><h2 className="font-display mt-1 text-lg font-bold text-slate-900">Төлбөртэй QR тасалбар уншуулах</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Камераар QR уншигдмагц сервер token-ийг hashлаад DB-д хадгалсан төлбөр баталгаажсан тасалбартай тулган, ирцийг шууд бүртгэнэ.</p></div>
      <div className="flex items-center gap-2">{result && <Badge value={result.approvalStatus || (result.alreadyRecorded ? "ALREADY_APPROVED" : "APPROVED")} />}{events.length > 0 && <button type="button" onClick={() => { setCameraError(""); setCameraOpen(value => !value); }} className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-bold text-blue-700">{cameraOpen ? "Камер хаах" : "Камераар scan хийх"}</button>}</div>
    </div>
    {cameraError && <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{cameraError}</div>}
    {cameraOpen && <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-3"><video ref={videoRef} muted playsInline className="mx-auto max-h-[420px] w-full rounded-xl object-cover" /><p className="mt-2 text-center text-[10px] text-slate-300">Student-ийн төлбөр баталгаажсан UniNet QR-г хүрээнд байрлуулна.</p></div>}
    {events.length ? <form onSubmit={submit} className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,0.4fr)_1fr_auto]">
      <StyledSelect label="Арга хэмжээ" value={selectedEventId} onChange={setEventId} options={events.map(item => ({ value: item.id, label: item.title }))} className="w-full" />
      <label className="text-xs font-bold text-slate-700">QR token<input value={ticket} onChange={event => setTicket(event.target.value)} autoComplete="off" spellCheck="false" placeholder="Scanner-аар уншуулна уу" className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" /></label>
      <button type="submit" disabled={scanning || !ticket.trim()} className="self-end rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{scanning ? "Шалгаж байна..." : "Ирц бүртгэх"}</button>
    </form> : <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500">Ирц scan хийх нийтлэгдсэн төлбөртэй арга хэмжээ одоогоор алга.</p>}
    {result && <div aria-live="polite" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800"><b>{result.student}</b> · {result.university} · {result.event}<span className="ml-2">{result.attendedAt ? formatDateTime(result.attendedAt) : ""}</span></div>}
  </section>;
}


function PaginationControls({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  return <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
    <span className="text-slate-500">Нийт {meta.total} · {meta.page}/{meta.totalPages} хуудас</span>
    <div className="flex gap-2">
      <button type="button" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-40">Өмнөх</button>
      <button type="button" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-40">Дараах</button>
    </div>
  </div>;
}

function RegistrationManagementPage({ data, user, onToast }) {
  const [query, setQuery] = useState({ page: 1, pageSize: 20, search: "", status: "ALL", eventId: "ALL" });
  const [result, setResult] = useState({ items: [], events: [], meta: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setResult(await operationsService.listRegistrations(query)); }
    catch (reason) { setError(reason.message || "Бүртгэлийн мэдээллийг ачаалж чадсангүй."); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { const timer = setTimeout(load, 200); return () => clearTimeout(timer); }, [load]);
  const update = (key, value) => setQuery(current => ({ ...current, [key]: value, page: key === "page" ? value : 1 }));
  const markAttended = async item => {
    setBusyId(item.id);
    try {
      const response = await operationsService.markRegistrationAttended(item.id);
      onToast(response.alreadyRecorded ? "Ирц өмнө нь бүртгэгдсэн байна." : "Ирц баталгаажиж, notification ба audit log үүслээ.");
      await load();
    } catch (reason) { onToast(reason.message || "Ирц баталгаажуулж чадсангүй."); }
    finally { setBusyId(""); }
  };
  const rows = result.items.map(item => ({
    ...item,
    studentName: item.student.name,
    email: item.student.email,
    studentId: item.student.studentId || "—",
    university: item.student.university,
    major: item.student.major || "—",
    eventTitle: item.event.title,
    created: formatDate(item.createdAt),
  }));
  return <>
    <PageHeader title="Бүртгэлийн удирдлага" description="Backend tenant, Staff ownership, waitlist болон attendance дүрмээр шүүсэн бодит бүртгэлүүд." />
    {data.capabilities?.canManageRegistrations && <AttendanceScanner data={data} user={user} onToast={onToast} onScanned={load} />}
    <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3">
      <label className="text-xs font-bold text-slate-600">Хайлт<input value={query.search} onChange={event => update("search", event.target.value)} placeholder="Нэр, email, student ID, event" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
      <StyledSelect label="Төлөв" value={query.status} onChange={value => update("status", value)} options={[{ value: "ALL", label: "Бүгд" }, ...["REGISTERED", "WAITLISTED", "CANCELLED", "ATTENDED", "NO_SHOW"].map(value => ({ value, label: value }))]} />
      <StyledSelect label="Арга хэмжээ" value={query.eventId} onChange={value => update("eventId", value)} options={[{ value: "ALL", label: "Бүх арга хэмжээ" }, ...result.events.map(event => ({ value: event.id, label: event.title }))]} />
    </div>
    {error && <ErrorState message={error} onRetry={load} />}
    {loading ? <LoadingSkeleton variant="table" /> : <DataTable rows={rows} columns={[
      { key: "studentName", label: "Оюутан", render: (value, row) => <div><b className="text-slate-800">{value}</b><p className="mt-1 text-[10px] text-slate-400">{row.email} · {row.studentId}</p></div> },
      { key: "university", label: "Сургууль" },
      { key: "major", label: "Мэргэжил" },
      { key: "eventTitle", label: "Арга хэмжээ" },
      { key: "status", label: "Төлөв", render: value => <Badge value={value} /> },
      { key: "waitlistPosition", label: "Waitlist", render: value => value ?? "—" },
      { key: "created", label: "Бүртгүүлсэн" },
      { key: "attendanceAction", label: "Ирц", render: (_value, row) => row.status === "REGISTERED" ? <button type="button" disabled={busyId === row.id} onClick={() => markAttended(row)} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busyId === row.id ? "..." : "Ирц батлах"}</button> : row.status === "ATTENDED" ? <span className="font-bold text-emerald-600">Баталсан</span> : <span className="text-slate-400">—</span> },
    ]} />}
    <PaginationControls meta={result.meta} onPage={page => update("page", page)} />
  </>;
}

const nextApplicationStatuses = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [], REJECTED: [], WITHDRAWN: [],
};

function ApplicationManagementPage({ onToast }) {
  const [query, setQuery] = useState({ page: 1, pageSize: 20, search: "", status: "ALL", contentId: "ALL" });
  const [result, setResult] = useState({ items: [], opportunities: [], meta: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setResult(await operationsService.listApplications(query)); }
    catch (failure) { setError(failure.message || "Өргөдлүүдийг ачаалж чадсангүй."); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { const timer = setTimeout(load, 200); return () => clearTimeout(timer); }, [load]);
  const update = (key, value) => setQuery(current => ({ ...current, [key]: value, page: key === "page" ? value : 1 }));
  const openDetail = async row => {
    setBusy(true);
    try { setDetail(await operationsService.getApplication(row.id)); }
    catch (failure) { onToast(failure.message || "Өргөдлийн дэлгэрэнгүйг авч чадсангүй."); }
    finally { setBusy(false); }
  };
  const changeStatus = async status => {
    setBusy(true);
    try {
      const updated = await operationsService.updateApplicationStatus(detail.id, status);
      const statusMessage = {
        ACCEPTED: "Өргөдөл амжилттай батлагдлаа.",
        REJECTED: "Өргөдлийг амжилттай татгалзлаа.",
        UNDER_REVIEW: "Өргөдлийг хянаж эхэллээ.",
        SHORTLISTED: "Өргөдлийг shortlist-д орууллаа.",
      }[updated.status] || `${updated.status} төлөв амжилттай хадгалагдлаа.`;
      onToast(statusMessage);
      setDetail(await operationsService.getApplication(detail.id));
      await load();
    } catch (failure) { onToast(failure.message || "Өргөдлийн төлөв өөрчилж чадсангүй."); }
    finally { setBusy(false); }
  };
  const rows = result.items.map(item => ({
    ...item,
    studentName: item.student.name,
    email: item.student.email,
    university: item.student.university,
    major: item.student.major || "—",
    opportunityTitle: item.opportunity.title,
    type: item.opportunity.type,
    date: formatDate(item.submittedAt),
  }));
  return <>
    <PageHeader title="Өргөдлийн удирдлага" description="Өргөдөл, CV, immutable status history, notification болон tenant/ownership хамгаалалт." />
    <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3">
      <label className="text-xs font-bold text-slate-600">Хайлт<input value={query.search} onChange={event => update("search", event.target.value)} placeholder="Нэр, email, student ID, боломж" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
      <StyledSelect label="Төлөв" value={query.status} onChange={value => update("status", value)} options={[{ value: "ALL", label: "Бүгд" }, ...["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "ACCEPTED", "REJECTED", "WITHDRAWN"].map(value => ({ value, label: value }))]} />
      <StyledSelect label="Боломж" value={query.contentId} onChange={value => update("contentId", value)} options={[{ value: "ALL", label: "Бүх боломж" }, ...result.opportunities.map(item => ({ value: item.id, label: item.title }))]} />
    </div>
    {error && <ErrorState message={error} onRetry={load} />}
    {loading ? <LoadingSkeleton variant="table" /> : <DataTable rows={rows} actions={openDetail} columns={[
      { key: "studentName", label: "Оюутан", render: (value, row) => <div><b className="text-slate-800">{value}</b><p className="mt-1 text-[10px] text-slate-400">{row.email}</p></div> },
      { key: "university", label: "Сургууль" },
      { key: "major", label: "Мэргэжил" },
      { key: "opportunityTitle", label: "Боломж" },
      { key: "type", label: "Төрөл" },
      { key: "date", label: "Илгээсэн" },
      { key: "status", label: "Төлөв", render: value => <Badge value={value} /> },
    ]} />}
    <PaginationControls meta={result.meta} onPage={page => update("page", page)} />
    {detail && <Modal title={`${detail.student.name} · ${detail.opportunity.title}`} onClose={() => setDetail(null)} wide>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl bg-slate-50 p-5 text-xs"><h3 className="font-display text-sm font-bold">Оюутны мэдээлэл</h3><dl className="mt-4 space-y-2"><div><dt className="text-slate-400">Email</dt><dd className="font-bold">{detail.student.email}</dd></div><div><dt className="text-slate-400">Student ID</dt><dd className="font-bold">{detail.student.studentId || "—"}</dd></div><div><dt className="text-slate-400">Мэргэжил</dt><dd className="font-bold">{detail.student.major || "—"}</dd></div><div><dt className="text-slate-400">Cover note</dt><dd className="mt-1 whitespace-pre-wrap">{detail.coverNote || "—"}</dd></div></dl>{detail.cv && <button type="button" onClick={() => operationsService.downloadApplicationCv(detail.cv).catch(failure => onToast(failure.message))} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-bold text-white">CV татах</button>}</section>
        <section className="rounded-xl border border-slate-200 p-5"><div className="flex items-center justify-between"><h3 className="font-display text-sm font-bold">Төлөвийн түүх</h3><Badge value={detail.status} /></div><ol className="mt-4 space-y-3">{detail.history.map(entry => <li key={entry.id} className="rounded-lg bg-slate-50 p-3 text-xs"><div className="flex flex-wrap items-center gap-2"><Badge value={entry.toStatus} /><span className="text-slate-500">{entry.fromStatus || "Үүсгэсэн"} → {entry.toStatus}</span></div><p className="mt-1 text-[10px] text-slate-400">{entry.actor} · {formatDateTime(entry.createdAt)}</p>{entry.reason && <p className="mt-2 text-slate-600">{entry.reason}</p>}</li>)}</ol></section>
      </div>
      {nextApplicationStatuses[detail.status]?.length > 0 && <section className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-5"><p className="text-xs text-blue-800">Approve, reject болон бусад төлөвийн өөрчлөлт шууд хийгдэж audit log-д автоматаар бүртгэгдэнэ.</p><div className="mt-4 flex flex-wrap gap-2">{nextApplicationStatuses[detail.status].map(status => <button key={status} type="button" disabled={busy} onClick={() => changeStatus(status)} className={`rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${status === "REJECTED" ? "bg-rose-600" : status === "ACCEPTED" ? "bg-emerald-600" : "bg-blue-600"}`}>{status}</button>)}</div></section>}
    </Modal>}
  </>;
}

function GenericManagement({ route, role, data, onAction, onToast }) {
  if (route.includes("reports") || route.includes("analytics")) return <ReportsPage global={role === "PLATFORM_SUPER_ADMIN"} onToast={onToast} data={data} />;
  if (route.includes("audit-logs")) return <AuditPage data={data} global={role === "PLATFORM_SUPER_ADMIN"} />;
  if (route.includes("partnerships")) return <PartnershipPage data={data} onAction={onAction} />;
  if (route.includes("roles") || route.includes("permissions")) return <RolesPermissions onAction={onAction} />;
  if (route.includes("users") || route.endsWith("/staff") || route.endsWith("/students") || route.includes("/admins")) return <UserManagement data={data} route={route} onAction={onAction} />;
  if (route === "/admin/university-profile") return <UniversityProfilePage onToast={onToast} />;
  if (route === "/admin/feedback" || route === "/platform/feedback") return <FeedbackAdminPage onToast={onToast} />;
  if (route.includes("profile") || route.includes("settings") || route.includes("notifications") || route.includes("university-profile")) return <><PageHeader title={route.includes("settings") ? "Тохиргоо" : route.includes("notifications") ? "Мэдэгдэл" : route.includes("university-profile") ? "Сургуулийн профайл" : "Профайл"} description="Role-д тохирох account, notification, branding, security болон workspace тохиргоо." /><div className="grid gap-5 lg:grid-cols-2">{["Үндсэн мэдээлэл", "Notification preference", "Security", "Идэвхтэй session"].map(item => <section key={item} className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-display font-bold">{item}</h2><p className="mt-2 text-sm text-slate-500">Энэ тохиргоо зөвхөн таны role болон workspace хүрээнд үйлчилнэ.</p><button type="button" onClick={() => onToast(`${item} хадгалагдлаа.`)} className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Тохируулах</button></section>)}</div></>;
  return <ContentManagement data={data} route={route} onManage={onAction} onToast={onToast} />;
}

export default function OperationsExperience({ user, onLogout, GlobalStyles }) {
  const config = roleConfig[user.role];
  const [route, setRoute] = useState(() => window.location.pathname.startsWith(config.base) ? window.location.pathname : config.base);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState("");
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await operationsService.bootstrap(user.role)); }
    catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [user.role]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!window.location.pathname.startsWith(config.base)) window.history.replaceState({}, "", config.base);
  }, [config.base]);
  useEffect(() => { const onPop = () => setRoute(window.location.pathname); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  const navigate = path => { window.history.pushState({}, "", path); setRoute(path); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const action = async item => {
    if (item?.title && ["EVENT", "INTERNSHIP", "JOB", "RESEARCH", "ANNOUNCEMENT"].includes(item.type)) {
      try { setDetail(await operationsService.getContent(item.id)); }
      catch (reason) { setToast(reason.message || "Контентын дэлгэрэнгүйг ачаалж чадсангүй."); }
      return;
    }
    setDetail(item);
  };
  const refreshData = async () => setData(await operationsService.bootstrap());
  const readNotification = async item => {
    const actionUrl = String(item.actionUrl || "");
    if (actionUrl.startsWith(config.base)) navigate(actionUrl);
    else if (actionUrl === "/settings" || actionUrl.startsWith("/settings/")) {
      const section = actionUrl.split("/").filter(Boolean)[1] || "security";
      window.sessionStorage.setItem("uninet-settings-section", section);
      window.dispatchEvent(new CustomEvent("uninet:settings-section", { detail: section }));
      navigate(`${config.base}/settings`);
    }
    if (item.read) return;
    setData(current => ({
      ...current,
      notifications: (current.notifications || []).map(notification => notification.id === item.id ? { ...notification, read: true } : notification),
    }));
    try {
      await operationsService.markNotificationRead(item.id);
    } catch (reason) {
      await refreshData();
      setToast(reason.message || "Мэдэгдлийн төлөвийг хадгалж чадсангүй.");
    }
  };
  const markAllNotificationsRead = async () => {
    const previous = data.notifications || [];
    setData(current => ({ ...current, notifications: (current.notifications || []).map(item => ({ ...item, read: true })) }));
    try { await operationsService.markAllNotificationsRead(); }
    catch (reason) {
      setData(current => ({ ...current, notifications: previous }));
      setToast(reason.message || "Мэдэгдлүүдийг шинэчилж чадсангүй.");
    }
  };
  const changeContentStatus = async (item, status, message) => {
    try {
      await operationsService.updateContentStatus(item.id, status);
      await refreshData();
      setDetail(null);
      setToast(message);
    } catch (reason) {
      setToast(reason.message || "Контентын төлөвийг шинэчилж чадсангүй.");
    }
  };
  const mutateResource = async (resourceType, item, actionName, message, value) => {
    try {
      await operationsService.mutate({ resourceType, id: item.id, action: actionName, ...(value ? { value } : {}) });
      await refreshData();
      setDetail(null);
      setToast(message);
    } catch (reason) {
      setToast(reason.message || "Өгөгдлийг шинэчилж чадсангүй.");
    }
  };
  const confirmAction = async () => {
    const selected = confirm;
    try {
      const contentStatuses = { archive: "ARCHIVED", reject: "REJECTED" };
      if (selected?.action === "delete-content" && selected.item?.id) {
        await operationsService.deleteContent(selected.item.id);
      } else if (selected?.item?.id && contentStatuses[selected.action]) {
        await operationsService.updateContentStatus(selected.item.id, contentStatuses[selected.action]);
      } else if (selected?.item?.id && selected.item.domain && ["suspend", "restore"].includes(selected.action)) {
        await operationsService.updateUniversityStatus(selected.item.id, selected.action === "restore" ? "ACTIVE" : "SUSPENDED");
      } else {
        await operationsService.mutate(selected);
      }
      await refreshData();
      setConfirm(null); setDetail(null);
      setToast("Үйлдэл амжилттай хийгдэж audit log үүслээ.");
    } catch (reason) {
      setConfirm(null);
      setToast(reason.message || "Үйлдлийг хийж чадсангүй.");
    }
  };
  if (loading) return <div className="min-h-screen bg-slate-50">{GlobalStyles && <GlobalStyles />}<LoadingSkeleton variant="shell" /></div>;
  if (error) {
    const status = errorScreenStatus(error);
    return <div className="min-h-screen bg-slate-50 p-8">{GlobalStyles && <GlobalStyles />}{status
      ? <HttpErrorState status={status} error={error} onRetry={load} onHome={() => navigate(config.base)} />
      : <ErrorState message={mongolianErrorMessage(error, "Мэдээллийг ачаалж чадсангүй.")} onRetry={load} />}</div>;
  }

  const knownRoutes = new Set([
    config.base,
    ...config.routes.map(item => item.path),
    `${config.base}/settings`, `${config.base}/profile`, `${config.base}/notifications`,
    "/staff/content/create",
  ]);
  let page;
  if (!knownRoutes.has(route)) page = <HttpErrorState status={404} error={{ status: 404, code: "ROUTE_NOT_FOUND" }} onHome={() => navigate(config.base)} compact />;
  else if (route === config.base) page = <DashboardPage role={user.role} data={data} navigate={navigate} user={user} />;
  else if (user.role === "STAFF" && route === "/staff/forms") page = <StaffFormsBuilder onToast={setToast} />;
  else if (user.role === "STAFF" && route === "/staff/content/create") page = <PermissionGuard user={user} permission="CREATE_CONTENT" fallback={<EmptyState title="Контент үүсгэх эрхгүй байна." />}><CreateContent onToast={setToast} user={user} partnerships={data.partnerships} onSaved={async ({ status }) => { await refreshData(); navigate(status === "DRAFT" ? "/staff/drafts" : status === "PUBLISHED" ? "/staff/published" : "/staff/approvals"); }} /></PermissionGuard>;
  else if (user.role === "STAFF" && ["/staff/content", "/staff/drafts", "/staff/published"].includes(route)) page = <ContentManagement data={data} route={route} onManage={action} onToast={setToast} />;
  else if (user.role === "STAFF" && route === "/staff/approvals") page = <ApprovalPage data={data} onAction={action} />;
  else if (["STAFF", "UNIVERSITY_ADMIN"].includes(user.role) && route.endsWith("/registrations")) page = <RegistrationManagementPage data={data} user={user} onToast={setToast} />;
  else if (["STAFF", "UNIVERSITY_ADMIN"].includes(user.role) && route.endsWith("/applications")) page = <ApplicationManagementPage onToast={setToast} />;
  else if (user.role === "UNIVERSITY_ADMIN" && route === "/admin/approvals") page = <ApprovalPage data={data} admin onAction={action} />;
  else if (user.role === "UNIVERSITY_ADMIN" && ["/admin/users", "/admin/staff", "/admin/students"].includes(route)) page = <UniversityMembershipPage key={route} route={route} onToast={setToast} onChanged={refreshData} />;
  else if (user.role === "PLATFORM_SUPER_ADMIN" && route === "/platform/universities") page = <UniversityManagement data={data} onToast={setToast} onChanged={refreshData} />;
  else if (user.role === "PLATFORM_SUPER_ADMIN" && route === "/platform/universities/create") page = <UniversityOnboarding onToast={setToast} onCreated={refreshData} />;
  else if (user.role === "PLATFORM_SUPER_ADMIN" && route === "/platform/admins") page = <PlatformAdminManagementPage universities={data.universities || []} onToast={setToast} onChanged={refreshData} />;
  else if (user.role === "PLATFORM_SUPER_ADMIN" && route === "/platform/monitoring") page = <MonitoringPage data={data} onAction={action} />;
  else if (route.endsWith("/notifications")) page = <OperationsNotificationsPage notifications={data.notifications || []} onOpen={readNotification} onMarkAll={markAllNotificationsRead} />;
  else if (route.endsWith("/settings")) page = <SettingsPage user={user} onLogout={onLogout} />;
  else page = <GenericManagement route={route} role={user.role} data={data} onAction={action} onToast={setToast} />;
  const routeRole = route.startsWith("/staff") ? "STAFF" : route.startsWith("/admin") ? "UNIVERSITY_ADMIN" : route.startsWith("/platform") ? "PLATFORM_SUPER_ADMIN" : user.role;

  return (
    <RoleGuard user={user} allowedRole={routeRole} navigate={navigate}>
      <DashboardLayout user={user} route={route} routes={config.routes} navigate={navigate} onLogout={onLogout} GlobalStyles={GlobalStyles}
        notifications={data.notifications || []} onNotificationClick={readNotification} onOpenNotifications={() => navigate(`${config.base}/notifications`)}>
        {page}
      </DashboardLayout>
      {detail && <Modal title={detail.title || detail.name || detail.university || "Дэлгэрэнгүй"} onClose={() => setDetail(null)} wide>{detail.statusHistory ? <div className="space-y-5"><ContentEditor content={detail} onError={setToast} onDelete={() => setConfirm({ action: "delete-content", item: detail })} onSaved={async () => { await refreshData(); setDetail(null); setToast("Контентын өөрчлөлтийг хадгаллаа."); }} /><ContentDescriptionPanel content={detail} user={user} canManageRegistrations={Boolean(data.capabilities?.canManageRegistrations)} onToast={setToast} /><section className="rounded-xl bg-slate-50 p-5"><h3 className="font-display text-sm font-bold">Lifecycle түүх</h3><ol className="mt-4 space-y-3">{detail.statusHistory.map(entry => <li key={entry.id} className="flex flex-wrap items-center gap-2 text-xs"><Badge value={entry.toStatus} /><span className="text-slate-500">{entry.fromStatus || "Үүсгэсэн"} → {entry.toStatus}</span><time className="ml-auto text-slate-400">{formatDateTime(entry.createdAt)}</time>{entry.reason && <p className="w-full text-slate-500">{entry.reason}</p>}</li>)}</ol></section></div> : <div className="grid gap-3 md:grid-cols-2">{Object.entries(detail).filter(([,value]) => value == null || ["string","number","boolean"].includes(typeof value)).map(([key,value]) => <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{key}</div><div className="mt-2 break-words text-sm font-semibold text-slate-700">{String(value ?? "—")}</div></div>)}</div>}<div className="mt-5 flex flex-wrap justify-end gap-2">
        {user.role === "STAFF" && detail.title && <>
          {detail.status === "DRAFT" && <button type="button" onClick={() => changeContentStatus(detail, "PENDING_APPROVAL", "Контент батлуулахаар амжилттай илгээгдлээ.")} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white">Батлуулахаар илгээх</button>}
          {detail.status === "PUBLISHED" && <button type="button" onClick={() => setConfirm({ action: "archive", item: detail })} className="rounded-lg border border-amber-200 px-4 py-2 text-xs font-bold text-amber-700">Archive</button>}
        </>}
        {user.role === "UNIVERSITY_ADMIN" && detail.status === "PENDING_APPROVAL" && <><button type="button" onClick={() => changeContentStatus(detail, "CHANGES_REQUESTED", "Өөрчлөлтийн хүсэлт илгээгдлээ.")} className="rounded-lg border border-amber-200 px-4 py-2 text-xs font-bold text-amber-700">Өөрчлөлт хүсэх</button><button type="button" onClick={() => changeContentStatus(detail, "REJECTED", "Контентыг татгалзлаа.")} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Татгалзах</button><button type="button" onClick={() => changeContentStatus(detail, detail.type === "EVENT" ? "PUBLISHED" : "APPROVED", detail.type === "EVENT" ? "Event амжилттай батлагдаж Student-д нийтлэгдлээ." : "Контентыг амжилттай баталлаа.")} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Батлах</button></>}
        {user.role === "UNIVERSITY_ADMIN" && detail.status === "APPROVED" && <button type="button" onClick={() => changeContentStatus(detail, "PUBLISHED", "Контент амжилттай нийтлэгдлээ.")} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white">Нийтлэх</button>}
        {["STAFF", "UNIVERSITY_ADMIN", "PLATFORM_SUPER_ADMIN"].includes(user.role) && detail.opportunity && <><button type="button" onClick={() => mutateResource("APPLICATION", detail, "REVIEW", "Өргөдлийг шалгаж эхэллээ.")} className="rounded-lg border border-blue-200 px-4 py-2 text-xs font-bold text-blue-700">Шалгах</button><button type="button" onClick={() => mutateResource("APPLICATION", detail, "ACCEPT", "Өргөдлийг зөвшөөрлөө.")} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Зөвшөөрөх</button><button type="button" onClick={() => mutateResource("APPLICATION", detail, "REJECT", "Өргөдлийг татгалзлаа.")} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Татгалзах</button></>}
        {["UNIVERSITY_ADMIN", "PLATFORM_SUPER_ADMIN"].includes(user.role) && detail.requestedBy && detail.status === "PENDING" && <><button type="button" onClick={() => mutateResource("PARTNERSHIP", detail, "ACCEPT", "Түншлэлийг идэвхжүүллээ.")} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Хүлээн авах</button><button type="button" onClick={() => mutateResource("PARTNERSHIP", detail, "REJECT", "Түншлэлийг татгалзлаа.")} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Татгалзах</button></>}
        {["UNIVERSITY_ADMIN", "PLATFORM_SUPER_ADMIN"].includes(user.role) && detail.requestedBy && detail.status === "ACTIVE" && <button type="button" onClick={() => mutateResource("PARTNERSHIP", detail, "END", "Түншлэлийг дуусгалаа.")} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Түншлэл дуусгах</button>}
        {["UNIVERSITY_ADMIN", "PLATFORM_SUPER_ADMIN"].includes(user.role) && detail.email && detail.id !== user.id && <button type="button" onClick={() => mutateResource("USER", detail, detail.status === "ACTIVE" ? "SUSPEND" : "ACTIVATE", detail.status === "ACTIVE" ? "Хэрэглэгчийг түдгэлзүүллээ." : "Хэрэглэгчийг идэвхжүүллээ.")} className="rounded-lg border border-amber-200 px-4 py-2 text-xs font-bold text-amber-700">{detail.status === "ACTIVE" ? "Түдгэлзүүлэх" : "Идэвхжүүлэх"}</button>}
        {user.role === "PLATFORM_SUPER_ADMIN" && detail.domain && <button type="button" onClick={() => setConfirm({ action: detail.status === "SUSPENDED" ? "restore" : "suspend", item: detail })} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">{detail.status === "SUSPENDED" ? "Restore" : "Suspend"}</button>}
      </div></Modal>}
      {confirm && <ConfirmDialog title="Үйлдлийг баталгаажуулах" description="Энэ өөрчлөлт audit log-д бүртгэгдэнэ. Tenant болон permission дүрмийг дахин шалгана уу." danger={["reject", "delete-content"].includes(confirm.action)} confirmLabel="Баталгаажуулах" onClose={() => setConfirm(null)} onConfirm={confirmAction} />}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </RoleGuard>
  );
}
