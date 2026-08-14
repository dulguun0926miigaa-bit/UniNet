import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { ConfirmDialog, EmptyState, ErrorState, LoadingSkeleton, Modal, PageHeader } from "../student/StudentUI.jsx";
import { membershipService } from "./membershipService.js";
import StyledSelect from "../ui/StyledSelect.jsx";
import NativeStyledSelect from "../ui/NativeStyledSelect.jsx";

const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
const labelClass = "block text-xs font-bold text-slate-700";
const memberStatuses = {
  staff: ["ACTIVE", "SUSPENDED", "DEACTIVATED"],
  students: ["ACTIVE", "SUSPENDED", "DEACTIVATED"],
};
const memberFilterStatuses = {
  staff: ["ACTIVE", "SUSPENDED", "DEACTIVATED"],
  students: ["ACTIVE", "SUSPENDED", "DEACTIVATED"],
};
const statusLabels = {
  PENDING_REVIEW: "Хянаж байна",
  ACTIVE: "Идэвхтэй",
  SUSPENDED: "Түдгэлзсэн",
  DEACTIVATED: "Идэвхгүй",
  REJECTED: "Татгалзсан",
  PENDING: "Хүлээгдэж байна",
  ACCEPTED: "Хүлээн авсан",
  REVOKED: "Цуцалсан",
  EXPIRED: "Хугацаа дууссан",
};
const permissionFields = [
  ["canCreateContent", "Контент үүсгэх", "Ноорог болон нийтлэх хүсэлт үүсгэнэ."],
  ["canPublish", "Шууд нийтлэх", "Баталгаажуулалтгүй нийтлэх өндөр эрх."],
  ["canManageRegistrations", "Бүртгэл удирдах", "Event бүртгэл, waitlist болон ирц харна."],
  ["canManageApplications", "Өргөдөл удирдах", "Ажил, дадлагын өргөдөл хянана."],
  ["canManageSurveys", "Судалгаа удирдах", "Судалгаа үүсгэж, хариулт харна."],
  ["canViewReports", "Тайлан харах", "Workspace тайлан болон аналитик харна."],
];

function StatusBadge({ value }) {
  const positive = ["ACTIVE", "ACCEPTED"].includes(value);
  const warning = ["PENDING", "PENDING_REVIEW"].includes(value);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${positive ? "bg-emerald-50 text-emerald-700" : warning ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{statusLabels[value] || value}</span>;
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("mn-MN", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function memberProfile(member, kind) {
  return kind === "staff" ? member.staffProfile : member.studentProfile;
}

function memberName(member, kind) {
  const profile = memberProfile(member, kind);
  return [profile?.lastName, profile?.firstName].filter(Boolean).join(" ") || member.email;
}

function Pagination({ pagination, pageSize, onPage, onPageSize }) {
  if (!pagination) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <p className="text-xs text-slate-500" aria-live="polite">
        Нийт <b className="text-slate-800">{pagination.total}</b> · {pagination.page}/{Math.max(1, pagination.totalPages)} хуудас
      </p>
      <div className="flex items-center gap-2">
        <StyledSelect label="Мөр" value={String(pageSize)} onChange={value => onPageSize(Number(value))} options={[10, 20, 50].map(size => ({ value: String(size), label: `${size} мөр` }))} className="min-w-[120px]" />
        <button type="button" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Өмнөх</button>
        <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Дараах</button>
      </div>
    </div>
  );
}

function MemberToolbar({ kind, searchDraft, setSearchDraft, departmentDraft, setDepartmentDraft, onSearch, status, onStatus, sortBy, onSortBy, sortOrder, onSortOrder, onExport, exporting }) {
  return (
    <form onSubmit={onSearch} className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(220px,1fr)_minmax(180px,.7fr)_170px_160px_130px_auto]">
        <label className={labelClass}>Нэр, имэйл, ID
          <input type="search" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="Хайх утга..." className={`${fieldClass} mt-2`} />
        </label>
        <label className={labelClass}>Тэнхим / хэлтэс
          <input value={departmentDraft} onChange={event => setDepartmentDraft(event.target.value)} placeholder="Жишээ: МТЭС" className={`${fieldClass} mt-2`} />
        </label>
        <StyledSelect label="Төлөв" value={status} onChange={onStatus} options={[{ value: "ALL", label: "Бүх төлөв" }, ...memberFilterStatuses[kind].map(item => ({ value: item, label: statusLabels[item] }))]} />
        <StyledSelect label="Эрэмбэлэх" value={sortBy} onChange={onSortBy} options={[{ value: "createdAt", label: "Бүртгүүлсэн огноо" }, { value: "email", label: "Имэйл" }, { value: "status", label: "Төлөв" }, { value: "lastLoginAt", label: "Сүүлд нэвтэрсэн" }]} />
        <StyledSelect label="Чиглэл" value={sortOrder} onChange={onSortOrder} options={[{ value: "desc", label: "Шинээс хуучин" }, { value: "asc", label: "Хуучнаас шинэ" }]} />
        <div className="flex self-end gap-2 md:col-span-2 2xl:col-span-1">
          <button type="submit" className="flex-1 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-900/20">Хайх</button>
          <button type="button" onClick={onExport} disabled={exporting} title="Одоогийн шүүлтүүрээр CSV татах" aria-label="CSV экспорт" className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"><Download className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>
    </form>
  );
}

function MemberDialog({ kind, member, onClose, onUpdated, onToast }) {
  const profile = memberProfile(member, kind);
  const [nextStatus, setNextStatus] = useState(memberStatuses[kind].includes(member.status) ? member.status : "ACTIVE");
  const [permissions, setPermissions] = useState(() => Object.fromEntries(permissionFields.map(([field]) => [field, Boolean(profile?.[field])])));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const submitStatus = async event => {
    event.preventDefault();
    setBusy("status"); setError("");
    try {
      await membershipService.updateMemberStatus(kind, member.id, nextStatus);
      onToast(`${memberName(member, kind)} хэрэглэгчийн төлөв шинэчлэгдлээ.`);
      await onUpdated();
      onClose();
    } catch (failure) {
      setError(failure.message || "Хэрэглэгчийн төлөвийг шинэчилж чадсангүй.");
    } finally { setBusy(""); }
  };

  const submitPermissions = async event => {
    event.preventDefault();
    setBusy("permissions"); setError("");
    try {
      await membershipService.updateStaffPermissions(member.id, permissions);
      onToast(`${memberName(member, kind)} хэрэглэгчийн эрх хадгалагдлаа. Идэвхтэй session-ууд шинэчлэгдэнэ.`);
      await onUpdated();
      onClose();
    } catch (failure) {
      setError(failure.message || "Permission хадгалж чадсангүй.");
    } finally { setBusy(""); }
  };

  return (
    <Modal title={memberName(member, kind)} onClose={onClose} wide>
      <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div><span className="block text-slate-400">Имэйл</span><b className="mt-1 block break-all">{member.email}</b></div>
        <div><span className="block text-slate-400">Төлөв</span><span className="mt-1 block"><StatusBadge value={member.status} /></span></div>
        <div><span className="block text-slate-400">Тэнхим / хэлтэс</span><b className="mt-1 block">{profile?.department || "—"}</b></div>
        <div><span className="block text-slate-400">Сүүлд нэвтэрсэн</span><b className="mt-1 block">{formatDate(member.lastLoginAt, true)}</b></div>
      </div>

      {member._count && <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{Object.entries(member._count).map(([key, value]) => <div key={key} className="rounded-xl border border-slate-200 p-3 text-center"><dt className="text-[10px] text-slate-400">{{ sessions: "Session", eventRegistrations: "Бүртгэл", applications: "Өргөдөл", createdContent: "Контент", createdSurveys: "Судалгаа" }[key] || key}</dt><dd className="font-display mt-1 text-xl font-bold">{value}</dd></div>)}</dl>}

      {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <form onSubmit={submitStatus} className="mt-6 rounded-2xl border border-slate-200 p-5">
          <h3 className="font-display text-base font-bold">Хэрэглэгчийн төлөв</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Төлөв өөрчлөхөд идэвхтэй session-ууд хүчингүй болж, үйлдэл audit log-д автоматаар бүртгэгдэнэ.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto]">
            <StyledSelect label="Шинэ төлөв" value={nextStatus} onChange={setNextStatus} options={memberStatuses[kind].map(status => ({ value: status, label: statusLabels[status] }))} />
            <button type="submit" disabled={busy !== "" || nextStatus === member.status} className="self-end rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy === "status" ? "Хадгалж байна..." : "Төлөв хадгалах"}</button>
          </div>
        </form>

      {kind === "staff" && (
        <form onSubmit={submitPermissions} className="mt-5 rounded-2xl border border-slate-200 p-5">
          <h3 className="font-display text-base font-bold">Staff permission</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Хамгийн бага шаардлагатай эрхийг олгоно уу. Өөрчлөлт хадгалахад тухайн Staff дахин нэвтрэх шаардлагатай.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{permissionFields.map(([field, label, description]) => <label key={field} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-300"><input type="checkbox" checked={permissions[field]} onChange={event => setPermissions(current => ({ ...current, [field]: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span><b className="block text-xs text-slate-800">{label}</b><span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{description}</span></span></label>)}</div>
          <div className="mt-4 flex justify-end"><button type="submit" disabled={busy !== ""} className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy === "permissions" ? "Хадгалж байна..." : "Permission хадгалах"}</button></div>
        </form>
      )}
    </Modal>
  );
}

function MemberListPanel({ kind, onToast, onChanged }) {
  const [searchDraft, setSearchDraft] = useState("");
  const [departmentDraft, setDepartmentDraft] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(() => { setLoading(true); setError(""); setReload(value => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    membershipService.listMembers(kind, { page, pageSize, search, department, status, sortBy, sortOrder }, { signal: controller.signal })
      .then(payload => { if (active) setResult(payload); })
      .catch(failure => { if (active && failure.name !== "AbortError") setError(failure.message || "Хэрэглэгчдийн мэдээллийг ачаалж чадсангүй."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [department, kind, page, pageSize, reload, search, sortBy, sortOrder, status]);

  const submitSearch = event => {
    event.preventDefault();
    setLoading(true); setError(""); setPage(1); setSearch(searchDraft.trim()); setDepartment(departmentDraft.trim());
  };
  const filter = (setter, value) => { setLoading(true); setError(""); setPage(1); setter(value); };
  const exportMembers = async () => {
    setExporting(true);
    try {
      await membershipService.downloadMembers(kind, { search, department, status, sortBy, sortOrder });
      onToast(`${kind === "staff" ? "Staff" : "Оюутны"} жагсаалтыг CSV файлаар татлаа.`);
    } catch (failure) {
      onToast(failure.message || "CSV экспорт хийж чадсангүй.");
    } finally { setExporting(false); }
  };

  const openMember = async item => {
    setSelected(item); setDetailLoading(true);
    try {
      const payload = await membershipService.getMember(kind, item.id);
      setSelected(payload.member);
    } catch (failure) {
      onToast(failure.message || "Хэрэглэгчийн дэлгэрэнгүйг ачаалж чадсангүй.");
      setSelected(null);
    } finally { setDetailLoading(false); }
  };

  return (
    <>
      <MemberToolbar kind={kind} searchDraft={searchDraft} setSearchDraft={setSearchDraft} departmentDraft={departmentDraft} setDepartmentDraft={setDepartmentDraft} onSearch={submitSearch}
        status={status} onStatus={value => filter(setStatus, value)} sortBy={sortBy} onSortBy={value => filter(setSortBy, value)} sortOrder={sortOrder} onSortOrder={value => filter(setSortOrder, value)} onExport={exportMembers} exporting={exporting} />
      {error ? <ErrorState message={error} onRetry={refresh} /> : loading ? <LoadingSkeleton variant="table" /> : !result.items.length ? <EmptyState title="Хайлтад тохирох хэрэглэгч алга." description="Шүүлтүүрээ өөрчлөөд дахин хайна уу." /> : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <caption className="sr-only">{kind === "staff" ? "Staff хэрэглэгчдийн жагсаалт" : "Оюутнуудын жагсаалт"}</caption>
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Хэрэглэгч</th><th className="px-4 py-3">Тэнхим / хэлтэс</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Төлөв</th><th className="px-4 py-3">Сүүлд нэвтэрсэн</th><th className="px-4 py-3">Бүртгүүлсэн</th><th className="px-4 py-3">Үйлдэл</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{result.items.map(member => { const profile = memberProfile(member, kind); return <tr key={member.id} className="hover:bg-slate-50"><td className="px-4 py-4"><b className="block text-slate-800">{memberName(member, kind)}</b><span className="mt-1 block text-[10px] text-slate-400">{member.email}</span></td><td className="px-4 py-4 text-slate-600">{profile?.department || "—"}</td><td className="px-4 py-4 text-slate-600">{kind === "staff" ? profile?.employeeCode || "—" : profile?.studentId || "—"}</td><td className="px-4 py-4"><StatusBadge value={member.status} /></td><td className="px-4 py-4 text-slate-500">{formatDate(member.lastLoginAt, true)}</td><td className="px-4 py-4 text-slate-500">{formatDate(member.createdAt)}</td><td className="px-4 py-4"><button type="button" onClick={() => openMember(member)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold transition hover:border-blue-300 hover:text-blue-700">Удирдах</button></td></tr>; })}</tbody>
            </table>
          </div>
          <Pagination pagination={result.pagination} pageSize={pageSize} onPage={value => { setLoading(true); setPage(value); }} onPageSize={value => { setLoading(true); setPage(1); setPageSize(value); }} />
        </div>
      )}
      {selected && (detailLoading ? <Modal title="Хэрэглэгчийн мэдээлэл" onClose={() => setSelected(null)}><LoadingSkeleton /></Modal> : <MemberDialog key={selected.id} kind={kind} member={selected} onClose={() => setSelected(null)} onUpdated={async () => { refresh(); await Promise.resolve(onChanged?.()).catch(() => undefined); }} onToast={onToast} />)}
    </>
  );
}

function RosterPanel({ onToast, onChanged }) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [memberType, setMemberType] = useState("ALL");
  const [enrollmentStatus, setEnrollmentStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ items: [], pagination: null });
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState("");

  const refresh = useCallback(() => { setLoading(true); setError(""); setReload(value => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.all([
      membershipService.listRoster({ page, pageSize, search, memberType, enrollmentStatus, sortBy: "email", sortOrder: "asc" }, { signal: controller.signal }),
      membershipService.listRosterImports({ page: 1, pageSize: 5 }, { signal: controller.signal }),
    ]).then(([rosterPayload, importPayload]) => {
      if (!active) return;
      setResult(rosterPayload);
      setImports(importPayload.items || []);
    }).catch(failure => {
      if (active && failure.name !== "AbortError") setError(failure.message || "Roster мэдээллийг ачаалж чадсангүй.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [enrollmentStatus, memberType, page, pageSize, reload, search]);

  const submitSearch = event => {
    event.preventDefault();
    setLoading(true); setError(""); setPage(1); setSearch(searchDraft.trim());
  };
  const previewImport = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!file) return setError("Импортлох CSV файлаа сонгоно уу.");
    setBusy("preview"); setError("");
    try {
      const payload = await membershipService.previewRosterImport(file);
      const job = payload.job;
      onToast(`Roster preview бэлэн: ${job.validRows} зөв, ${job.invalidRows} алдаатай мөр.`);
      setFile(null);
      form.reset();
      refresh();
    } catch (failure) { setError(failure.message || "Roster preview хийж чадсангүй."); }
    finally { setBusy(""); }
  };
  const commitImport = async job => {
    setBusy(job.id); setError("");
    try {
      const payload = await membershipService.commitRosterImport(job.id);
      onToast(`Roster импорт амжилттай: ${payload.job.insertedRows} нэмсэн, ${payload.job.updatedRows} шинэчилсэн.`);
      await Promise.resolve(onChanged?.()).catch(() => undefined);
      refresh();
    } catch (failure) { setError(failure.message || "Roster импорт commit хийж чадсангүй."); }
    finally { setBusy(""); }
  };
  const exportRoster = async () => {
    setBusy("export"); setError("");
    try {
      await membershipService.downloadRoster({ search, memberType, enrollmentStatus, sortBy: "email", sortOrder: "asc" });
      onToast("Тухайн сургуулийн roster CSV татагдлаа.");
    } catch (failure) { setError(failure.message || "Roster CSV татаж чадсангүй."); }
    finally { setBusy(""); }
  };

  return <>
    <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="font-display text-base font-bold text-blue-950">Roster CSV импорт ба экспорт</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-blue-800">Template татаж бөглөөд preview хийнэ. Алдаагүй preview-г commit хийхэд бүх мөр transaction-аар хадгалагдаж audit log үүснэ.</p></div>
        <button type="button" onClick={() => membershipService.downloadRosterTemplate().catch(failure => setError(failure.message))} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-bold text-blue-800"><FileSpreadsheet className="h-4 w-4" />Template татах</button>
      </div>
      <form onSubmit={previewImport} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className={`${labelClass} min-w-0 flex-1`}>UTF-8 CSV файл<input type="file" accept=".csv,text/csv" onChange={event => setFile(event.target.files?.[0] || null)} className={`${fieldClass} mt-2 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold`} /></label>
        <button type="submit" disabled={busy === "preview"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50"><Upload className="h-4 w-4" />{busy === "preview" ? "Шалгаж байна..." : "Preview хийх"}</button>
      </form>
    </section>

    <form onSubmit={submitSearch} className="mb-5 grid items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 2xl:grid-cols-[minmax(240px,1fr)_minmax(170px,0.7fr)_minmax(190px,0.8fr)_minmax(110px,auto)_minmax(140px,auto)]">
      <label className={labelClass}>Имэйл, нэр, ID<input type="search" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} className={`${fieldClass} mt-2`} /></label>
      <label className={labelClass}>Төрөл<NativeStyledSelect value={memberType} onChange={event => { setLoading(true); setPage(1); setMemberType(event.target.value); }} className={`${fieldClass} mt-2`}><option value="ALL">Бүгд</option><option value="STUDENT">STUDENT</option><option value="STAFF">STAFF</option></NativeStyledSelect></label>
      <label className={labelClass}>Roster төлөв<NativeStyledSelect value={enrollmentStatus} onChange={event => { setLoading(true); setPage(1); setEnrollmentStatus(event.target.value); }} className={`${fieldClass} mt-2`}><option value="ALL">Бүгд</option>{["ACTIVE", "GRADUATED", "SUSPENDED", "WITHDRAWN", "UNKNOWN"].map(value => <option key={value}>{value}</option>)}</NativeStyledSelect></label>
      <button type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">Хайх</button>
      <button type="button" onClick={exportRoster} disabled={busy === "export"} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold"><Download className="h-4 w-4" />Roster CSV</button>
    </form>

    {error ? <ErrorState message={error} onRetry={refresh} /> : loading ? <LoadingSkeleton variant="table" /> : !result.items.length ? <EmptyState title="Roster мөр олдсонгүй." description="CSV template ашиглан roster импортлоно уу." /> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Хэрэглэгч</th><th className="px-4 py-3">Төрөл</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Тэнхим / мэргэжил</th><th className="px-4 py-3">Төлөв</th><th className="px-4 py-3">Хүчинтэй хугацаа</th></tr></thead><tbody className="divide-y divide-slate-100">{result.items.map(item => <tr key={item.id}><td className="px-4 py-4"><b>{[item.lastName, item.firstName].filter(Boolean).join(" ") || item.email}</b><span className="mt-1 block text-[10px] text-slate-400">{item.email}</span></td><td className="px-4 py-4">{item.memberType}</td><td className="px-4 py-4">{item.studentId || item.employeeCode || "—"}</td><td className="px-4 py-4">{[item.department, item.major].filter(Boolean).join(" · ") || "—"}</td><td className="px-4 py-4"><StatusBadge value={item.enrollmentStatus} /></td><td className="px-4 py-4 text-slate-500">{item.validFrom ? formatDate(item.validFrom) : "—"} → {item.validUntil ? formatDate(item.validUntil) : "—"}</td></tr>)}</tbody></table></div><Pagination pagination={result.pagination} pageSize={pageSize} onPage={value => { setLoading(true); setPage(value); }} onPageSize={value => { setLoading(true); setPage(1); setPageSize(value); }} /></div>}

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-display font-bold">Сүүлийн импортын ажлууд</h2><div className="mt-4 space-y-3">{!imports.length ? <p className="text-xs text-slate-500">Импортын түүх алга.</p> : imports.map(job => <article key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><b className="text-sm">{job.fileName}</b><p className="mt-1 text-[10px] text-slate-500">{job.status} · {job.validRows} зөв · {job.invalidRows} алдаатай · {formatDate(job.createdAt, true)}</p></div><div className="flex flex-wrap gap-2">{job.invalidRows > 0 && <button type="button" onClick={() => membershipService.downloadRosterImportErrors(job.id).catch(failure => setError(failure.message))} className="rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-700">Алдааны CSV</button>}{job.status === "PREVIEWED" && job.invalidRows === 0 && <button type="button" onClick={() => commitImport(job)} disabled={busy === job.id} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === job.id ? "Commit..." : "Commit хийх"}</button>}</div></article>)}</div></section>
  </>;
}

function InviteDialog({ role, universities, universityId, onClose, onCreated }) {
  const isPlatform = role === "UNIVERSITY_ADMIN";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const permissions = Object.fromEntries(permissionFields.map(([field]) => [field, form.get(field) === "on"]));
    const payload = {
      email: String(form.get("email") || "").trim().toLowerCase(),
      role,
      ...(isPlatform ? { universityId: String(form.get("universityId") || "") } : {
        employeeCode: String(form.get("employeeCode") || "").trim() || undefined,
        department: String(form.get("department") || "").trim() || undefined,
        jobTitle: String(form.get("jobTitle") || "").trim() || undefined,
        permissions,
      }),
    };
    setBusy(true); setError("");
    try {
      await membershipService.createInvitation(payload);
      await onCreated(payload.email);
    } catch (failure) {
      setError(failure.message || "Урилгыг илгээж чадсангүй.");
    } finally { setBusy(false); }
  };
  return (
    <Modal title={isPlatform ? "University Admin урих" : "Staff урих"} onClose={onClose} wide={!isPlatform}>
      <form onSubmit={submit}>
        <p className="mb-5 text-sm leading-relaxed text-slate-500">Урилга зөвхөн сонгосон сургуулийн баталгаажсан домэйнтэй имэйл рүү хүрнэ. Холбоос хугацаатай, нэг удаа ашиглагдана.</p>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          {isPlatform && <label className={`${labelClass} md:col-span-2`}>Их сургууль *
            <NativeStyledSelect name="universityId" required defaultValue={universityId} className={`${fieldClass} mt-2`}>
              <option value="" disabled>Сургууль сонгоно уу</option>
              {universities.map(university => <option key={university.id} value={university.id} disabled={university.status !== "ACTIVE"}>{university.name} — {university.domain}{university.status !== "ACTIVE" ? ` (${university.status})` : ""}</option>)}
            </NativeStyledSelect>
          </label>}
          <label className={`${labelClass} ${isPlatform ? "md:col-span-2" : ""}`}>Сургуулийн имэйл *
            <input name="email" type="email" required autoFocus placeholder={isPlatform ? "admin@university.edu.mn" : "staff@university.edu.mn"} className={`${fieldClass} mt-2`} />
          </label>
          {!isPlatform && <><label className={labelClass}>Ажилтны код<input name="employeeCode" maxLength={60} className={`${fieldClass} mt-2`} /></label><label className={labelClass}>Хэлтэс / тэнхим<input name="department" maxLength={160} className={`${fieldClass} mt-2`} /></label><label className={labelClass}>Албан тушаал<input name="jobTitle" maxLength={160} className={`${fieldClass} mt-2`} /></label></>}
        </div>
        {!isPlatform && <fieldset className="mt-5"><legend className="font-display text-sm font-bold">Эхний permission</legend><p className="mt-1 text-xs text-slate-500">Least privilege зарчмаар анхдагч утга бүгд хаалттай.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{permissionFields.map(([field, label, description]) => <label key={field} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" name={field} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span><b className="block text-xs">{label}</b><span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{description}</span></span></label>)}</div></fieldset>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold">Болих</button><button type="submit" disabled={busy} className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy ? "Илгээж байна..." : "Урилга илгээх"}</button></div>
      </form>
    </Modal>
  );
}

function InvitationPanel({ role, universities = [], onToast, onChanged }) {
  const isPlatform = role === "UNIVERSITY_ADMIN";
  const activeUniversity = universities.find(item => item.status === "ACTIVE") || universities[0];
  const [universityId, setUniversityId] = useState(activeUniversity?.id || "");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(() => !(isPlatform && !activeUniversity));
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [revoke, setRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const refresh = useCallback(() => { setLoading(true); setError(""); setReload(value => value + 1); }, []);

  useEffect(() => {
    if (isPlatform && !universityId) return undefined;
    const controller = new AbortController();
    let active = true;
    membershipService.listInvitations({ page, pageSize, search, status, sortBy, sortOrder, role, ...(isPlatform ? { universityId } : {}) }, { signal: controller.signal })
      .then(payload => { if (active) setResult(payload); })
      .catch(failure => { if (active && failure.name !== "AbortError") setError(failure.message || "Урилгын жагсаалтыг ачаалж чадсангүй."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [isPlatform, page, pageSize, reload, role, search, sortBy, sortOrder, status, universityId]);

  const created = async email => {
    setShowInvite(false); refresh();
    await Promise.resolve(onChanged?.()).catch(() => undefined);
    onToast(`${email} хаяг руу хугацаатай урилга илгээгдлээ.`);
  };
  const confirmRevoke = async () => {
    setRevoking(true); setError("");
    try {
      await membershipService.revokeInvitation(revoke.id, isPlatform ? { universityId: revoke.universityId } : {});
      setRevoke(null); refresh(); await Promise.resolve(onChanged?.()).catch(() => undefined); onToast(`${revoke.email} хаягийн урилгыг цуцаллаа.`);
    } catch (failure) {
      setRevoke(null); setError(failure.message || "Урилгыг цуцалж чадсангүй.");
    } finally { setRevoking(false); }
  };

  if (isPlatform && !universities.length) return <EmptyState title="Эхлээд их сургууль үүсгэнэ үү." description="University Admin урих идэвхтэй сургууль алга." />;
  return (
    <>
      <form onSubmit={event => { event.preventDefault(); setLoading(true); setError(""); setPage(1); setSearch(searchDraft.trim()); }} className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid items-end gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(240px,1fr)_minmax(170px,.8fr)_minmax(170px,.8fr)_minmax(140px,.7fr)_minmax(110px,auto)_minmax(150px,auto)]">
          {isPlatform && <label className={labelClass}>Их сургууль<NativeStyledSelect value={universityId} onChange={event => { setLoading(true); setError(""); setUniversityId(event.target.value); setPage(1); }} className={`${fieldClass} mt-2`}>{universities.map(item => <option key={item.id} value={item.id}>{item.name} · {item.domain}</option>)}</NativeStyledSelect></label>}
          <label className={labelClass}>Имэйл хайх<input type="search" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="name@domain.edu.mn" className={`${fieldClass} mt-2`} /></label>
          <label className={labelClass}>Төлөв<NativeStyledSelect value={status} onChange={event => { setLoading(true); setStatus(event.target.value); setPage(1); }} className={`${fieldClass} mt-2`}><option value="ALL">Бүх төлөв</option>{["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"].map(item => <option key={item} value={item}>{statusLabels[item]}</option>)}</NativeStyledSelect></label>
          <label className={labelClass}>Эрэмбэ<NativeStyledSelect value={sortBy} onChange={event => { setLoading(true); setSortBy(event.target.value); setPage(1); }} className={`${fieldClass} mt-2`}><option value="createdAt">Үүсгэсэн огноо</option><option value="expiresAt">Дуусах огноо</option><option value="email">Имэйл</option></NativeStyledSelect></label>
          <label className={labelClass}>Чиглэл<NativeStyledSelect value={sortOrder} onChange={event => { setLoading(true); setSortOrder(event.target.value); setPage(1); }} className={`${fieldClass} mt-2`}><option value="desc">Буурах</option><option value="asc">Өсөх</option></NativeStyledSelect></label>
          <button type="submit" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold">Хайх</button>
          <button type="button" onClick={() => setShowInvite(true)} disabled={isPlatform && activeUniversity?.status !== "ACTIVE" && universities.every(item => item.status !== "ACTIVE")} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">+ Урилга илгээх</button>
        </div>
      </form>
      {error ? <ErrorState message={error} onRetry={refresh} /> : loading ? <LoadingSkeleton variant="table" /> : !result.items.length ? <EmptyState title="Урилга олдсонгүй." description="Шүүлтүүрээ өөрчлөх эсвэл шинэ урилга илгээнэ үү." /> : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><caption className="sr-only">Membership урилгын жагсаалт</caption><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Имэйл</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Төлөв</th><th className="px-4 py-3">Урьсан</th><th className="px-4 py-3">Үүсгэсэн</th><th className="px-4 py-3">Дуусах</th><th className="px-4 py-3">Үйлдэл</th></tr></thead><tbody className="divide-y divide-slate-100">{result.items.map(item => <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-4"><b className="block text-slate-800">{item.email}</b>{item.acceptedUser && <span className="mt-1 block text-[10px] text-emerald-600">Account: {item.acceptedUser.status}</span>}</td><td className="px-4 py-4 text-slate-600">{item.role}</td><td className="px-4 py-4"><StatusBadge value={item.status} /></td><td className="px-4 py-4 text-slate-500">{[item.invitedBy?.staffProfile?.lastName, item.invitedBy?.staffProfile?.firstName].filter(Boolean).join(" ") || item.invitedBy?.email || "—"}</td><td className="px-4 py-4 text-slate-500">{formatDate(item.createdAt, true)}</td><td className="px-4 py-4 text-slate-500">{formatDate(item.expiresAt, true)}</td><td className="px-4 py-4">{item.status === "PENDING" ? <button type="button" onClick={() => setRevoke(item)} className="rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-700">Цуцлах</button> : <span className="text-[10px] text-slate-400">Үйлдэлгүй</span>}</td></tr>)}</tbody></table></div><Pagination pagination={result.pagination} pageSize={pageSize} onPage={value => { setLoading(true); setPage(value); }} onPageSize={value => { setLoading(true); setPage(1); setPageSize(value); }} /></div>
      )}
      {showInvite && <InviteDialog role={role} universities={universities} universityId={universityId} onClose={() => setShowInvite(false)} onCreated={created} />}
      {revoke && <ConfirmDialog title="Урилгыг цуцлах уу?" description={`${revoke.email} хаягт илгээсэн урилгын холбоос дахин ашиглагдахгүй. Үйлдэл audit log-д бүртгэгдэнэ.`} danger confirmLabel={revoking ? "Цуцалж байна..." : "Урилга цуцлах"} onClose={() => !revoking && setRevoke(null)} onConfirm={confirmRevoke} />}
    </>
  );
}

function PageTabs({ tabs, active, onChange, label }) {
  return <div role="tablist" aria-label={label} className="mb-6 flex gap-2 overflow-x-auto border-b border-slate-200">{tabs.map((tab, index) => <button key={tab.value} type="button" role="tab" aria-selected={active === tab.value} tabIndex={active === tab.value ? 0 : -1} onClick={() => onChange(tab.value)} onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus();
  }} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-bold ${active === tab.value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-400 hover:text-slate-700"}`}>{tab.label}</button>)}</div>;
}

export function UniversityMembershipPage({ route, onToast, onChanged }) {
  const fixedKind = route.endsWith("/staff") ? "staff" : route.endsWith("/students") ? "students" : null;
  const [kind, setKind] = useState(fixedKind || "students");
  const [staffView, setStaffView] = useState("members");
  const [studentView, setStudentView] = useState("members");
  const currentKind = fixedKind || kind;
  const title = fixedKind === "staff" ? "Ажилтны удирдлага" : fixedKind === "students" ? "Оюутны удирдлага" : "Хэрэглэгчийн удирдлага";
  return (
    <>
      <PageHeader eyebrow="Tenant-scoped membership" title={title} description="Таны их сургуулийн хэрэглэгчдийг backend pagination, хайлт, төлөв болон audit-тэйгээр удирдана. Баталгаажсан Student шинэ бүртгэл шууд ACTIVE болно." />
      {!fixedKind && <PageTabs label="Хэрэглэгчийн төрөл" active={kind} onChange={value => { setKind(value); setStaffView("members"); setStudentView("members"); }} tabs={[{ value: "students", label: "Оюутнууд" }, { value: "staff", label: "Staff" }]} />}
      {currentKind === "students" && <PageTabs label="Student membership" active={studentView} onChange={setStudentView} tabs={[{ value: "members", label: "Бүх оюутан" }, { value: "roster", label: "Roster импорт" }]} />}
      {currentKind === "staff" && <PageTabs label="Staff membership" active={staffView} onChange={setStaffView} tabs={[{ value: "members", label: "Ажилтнууд" }, { value: "invitations", label: "Урилгууд" }]} />}
      {currentKind === "students" && studentView === "roster"
        ? <RosterPanel onToast={onToast} onChanged={onChanged} />
        : currentKind === "staff" && staffView === "invitations"
          ? <InvitationPanel role="STAFF" onToast={onToast} onChanged={onChanged} />
          : <MemberListPanel key={currentKind} kind={currentKind} onToast={onToast} onChanged={onChanged} />}
    </>
  );
}

export function PlatformAdminManagementPage({ universities, onToast, onChanged }) {
  return (
    <>
      <PageHeader eyebrow="Platform membership" title="University Admin-ууд" description="Идэвхтэй их сургуульд University Admin урьж, урилгын төлөв, хугацаа болон хүлээн авалтыг хянана." />
      <InvitationPanel role="UNIVERSITY_ADMIN" universities={universities} onToast={onToast} onChanged={onChanged} />
    </>
  );
}
