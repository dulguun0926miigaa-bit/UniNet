import { Bookmark } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import StyledSelect from "../ui/StyledSelect.jsx";

export function PageHeader({ eyebrow, title, description, actions, breadcrumb }) {
  return (
    <header className="mb-8">
      {breadcrumb && <p className="mb-2 text-xs font-semibold text-slate-400">{breadcrumb}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-600">{eyebrow}</p>}
          <h1 className="font-display text-3xl font-bold text-slate-900 md:text-4xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function SearchInput({ value, onChange, placeholder = "Хайх..." }) {
  return (
    <label className="group relative block min-w-[220px] flex-1">
      <span className="sr-only">Хайлт</span>
      <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition group-focus-within:text-blue-600">⌕</span>
      <input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 py-3 pl-11 pr-4 text-sm shadow-[0_5px_18px_rgba(15,23,42,0.04)] outline-none transition hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10" />
    </label>
  );
}

export function FilterBar({ search, onSearch, children, view, onView }) {
  return (
    <div className="relative z-50 mb-6 flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-blue-50/40 p-3.5 shadow-[0_12px_35px_rgba(15,23,42,0.07)] ring-1 ring-white backdrop-blur overflow-visible">
      <SearchInput value={search} onChange={onSearch} />
      {children}
      {onView && (
        <div className="flex rounded-2xl border border-slate-200 bg-slate-100/80 p-1 shadow-inner" role="group" aria-label="Харагдац сонгох">
          {["grid", "list"].map(mode => (
            <button key={mode} type="button" onClick={() => onView(mode)}
              aria-pressed={view === mode}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${view === mode ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-white hover:text-slate-900"}`}>
              {mode === "grid" ? "Grid" : "List"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SelectFilter({ label, value, onChange, options }) {
  const normalizedOptions = [
    { value: "ALL", label: "Бүгд" },
    ...options.map(option => typeof option === "object" ? option : { value: option, label: option }),
  ];
  return (
    <StyledSelect
      label={label}
      value={value}
      onChange={onChange}
      options={normalizedOptions}
      className="min-w-[165px]"
    />
  );
}


export function StatCard({ value, label, detail }) {
  return (
    <div className="card-effect rounded-2xl border border-slate-200 bg-white p-5">
      <div className="font-display text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-2 text-xs font-semibold text-slate-500">{label}</div>
      {detail && <div className="mt-1 text-[10px] text-slate-400">{detail}</div>}
    </div>
  );
}

const visibilityStyles = {
  PRIVATE: "bg-rose-50 text-rose-700",
  PARTNERS: "bg-amber-50 text-amber-700",
  NETWORK: "bg-blue-50 text-blue-700",
  PUBLIC: "bg-emerald-50 text-emerald-700",
};

export function VisibilityBadge({ value }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${visibilityStyles[value] || "bg-slate-100 text-slate-600"}`}>{value}</span>;
}

const statusLabel = {
  ACTIVE: "Идэвхтэй", EXPIRED: "Хугацаа дууссан", CONFIRMED: "Баталгаажсан", WAITLISTED: "Хүлээлгийн жагсаалт",
  CANCELLED: "Цуцлагдсан", ATTENDED: "Оролцсон", NOT_ATTENDED: "Оролцоогүй", SUBMITTED: "Илгээсэн",
  UNDER_REVIEW: "Шалгаж байна", REVIEWED: "Шалгасан", ACCEPTED: "Тэнцсэн", REJECTED: "Татгалзсан", WITHDRAWN: "Буцаан татсан",
};

export function StatusBadge({ value }) {
  const positive = ["ACTIVE", "CONFIRMED", "ACCEPTED", "ATTENDED"].includes(value);
  const warning = ["WAITLISTED", "UNDER_REVIEW", "SUBMITTED", "REVIEWED"].includes(value);
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${positive ? "bg-emerald-50 text-emerald-700" : warning ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
      {statusLabel[value] || value}
    </span>
  );
}

export function UniversityBadge({ name }) {
  return <span className="text-xs font-bold text-slate-400">{name}</span>;
}

export function BookmarkButton({ saved, onClick, label = "контент" }) {
  const actionLabel = `${label}: ${saved ? "хадгалснаас хасах" : "хадгалах"}`;
  return (
    <button type="button" onClick={onClick} aria-pressed={saved} aria-label={actionLabel} title={actionLabel}
      className={`group grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${saved ? "border-blue-200 bg-blue-50 text-blue-700 shadow-blue-600/10" : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}`}>
      <Bookmark aria-hidden="true" className={`h-[18px] w-[18px] transition duration-200 group-hover:scale-110 ${saved ? "fill-current" : ""}`} strokeWidth={2.1} />
    </button>
  );
}

export function OpportunityCard({ item, saved, onSave, onView, onAction, list = false }) {
  const actionLabel = item.type === "EVENT" ? (item.remainingSeats === 0 ? "Waitlist-д орох" : item.pricingType === "PAID" ? "Тасалбар авах · Төлөх" : "Бүртгүүлэх")
    : ["INTERNSHIP", "JOB"].includes(item.type) ? "Өргөдөл илгээх"
      : item.type === "SURVEY" ? "Судалгаа эхлэх"
        : item.type === "RESEARCH" ? "Хүсэлт илгээх" : "Дэлгэрэнгүй";
  return (
    <article className={`card-effect rounded-2xl border border-slate-200 bg-white p-5 ${list ? "md:flex md:items-center md:gap-5" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{item.type}</span>
          <div className="flex items-center gap-2"><UniversityBadge name={item.university} /><VisibilityBadge value={item.visibility} /></div>
        </div>
        <h3 className="font-display text-base font-bold text-slate-900">{item.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.shortDescription}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-400">
          <span>{item.date || item.deadline || item.publishedAt}</span>
          <span>{item.location || item.organization || item.field}</span>
          {item.type === "EVENT" && <span className={item.pricingType === "PAID" ? "font-bold text-blue-600" : "font-bold text-emerald-600"}>{item.pricingType === "PAID" ? `${Number(item.priceAmount || 0).toLocaleString()} ₮` : "FREE"}</span>}
          {item.status === "EXPIRED" && <StatusBadge value="EXPIRED" />}
        </div>
      </div>
      <div className={`mt-5 flex flex-wrap gap-2 ${list ? "md:mt-0 md:w-48 md:justify-end" : "border-t border-slate-100 pt-4"}`}>
        <button type="button" onClick={() => onAction(item)} disabled={item.status === "EXPIRED"} aria-label={`${item.title}: ${actionLabel}`}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{actionLabel}</button>
        <button type="button" onClick={() => onView(item)} aria-label={`${item.title}: дэлгэрэнгүй үзэх`} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Үзэх</button>
        {item.type !== "SURVEY" && <BookmarkButton saved={saved} onClick={() => onSave(item.id)} label={item.title} />}
      </div>
    </article>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Контентын ангилал">
      {tabs.map((tab, index) => (
        <button key={tab.value} type="button" role="tab" aria-selected={active === tab.value} tabIndex={active === tab.value ? 0 : -1} onClick={() => onChange(tab.value)}
          onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
              : event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
            onChange(tabs[nextIndex].value);
            event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
          }}
          className={`shrink-0 border-b-2 px-3 py-3 text-sm font-bold ${active === tab.value ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400"}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function LoadingSkeleton({ variant = "cards" }) {
  const pulse = "animate-pulse rounded-2xl bg-slate-200";
  if (variant === "shell") return <div role="status" aria-live="polite" className="min-h-screen bg-slate-50 md:grid md:grid-cols-[250px_1fr]"><span className="sr-only">Dashboard layout ачаалж байна.</span><aside aria-hidden="true" className="hidden border-r border-slate-200 bg-white p-5 md:block"><div className={`${pulse} h-10 w-32`} /><div className="mt-9 space-y-3">{[1,2,3,4,5,6,7].map(item => <div key={item} className={`${pulse} h-11`} />)}</div></aside><main className="min-w-0"><div aria-hidden="true" className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5"><div className={`${pulse} h-9 w-48`} /><div className="flex gap-3"><div className={`${pulse} h-9 w-28`} /><div className={`${pulse} h-9 w-36`} /></div></div><div className="mx-auto max-w-7xl p-5 md:p-8"><LoadingSkeleton variant="dashboard" /></div></main></div>;
  if (variant === "dashboard") return <div role="status" aria-live="polite" className="space-y-6"><span className="sr-only">Dashboard ачаалж байна.</span><div aria-hidden="true" className="flex items-center justify-between gap-4"><div className="space-y-3"><div className={`${pulse} h-8 w-64`} /><div className={`${pulse} h-4 w-96 max-w-full`} /></div><div className={`${pulse} h-11 w-32`} /></div><div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map(item => <div key={item} className={`${pulse} h-28`} />)}</div><div aria-hidden="true" className="grid gap-5 xl:grid-cols-[1.35fr_1fr]"><div className={`${pulse} h-80`} /><div className={`${pulse} h-80`} /></div></div>;
  if (variant === "profile") return <div role="status" aria-live="polite" className="grid gap-6 xl:grid-cols-[320px_1fr]"><span className="sr-only">Профайл ачаалж байна.</span><div aria-hidden="true" className={`${pulse} h-[520px]`} /><div aria-hidden="true" className="rounded-2xl bg-white p-7"><div className="grid gap-4 md:grid-cols-2">{[1,2,3,4,5,6,7,8].map(item => <div key={item} className={`${pulse} h-16`} />)}<div className={`${pulse} h-32 md:col-span-2`} /></div><div className={`${pulse} mt-6 h-12 w-40`} /></div></div>;
  if (variant === "table") return <div role="status" aria-live="polite" className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><span className="sr-only">Хүснэгт ачаалж байна.</span><div aria-hidden="true" className={`${pulse} m-4 h-12`} />{[1,2,3,4,5].map(item => <div key={item} aria-hidden="true" className="grid grid-cols-4 gap-4 border-t border-slate-100 p-4"><div className={`${pulse} h-5`} /><div className={`${pulse} h-5`} /><div className={`${pulse} h-5`} /><div className={`${pulse} h-5`} /></div>)}</div>;
  if (variant === "settings") return <div role="status" aria-live="polite" className="space-y-6"><span className="sr-only">Тохиргоо ачаалж байна.</span><div aria-hidden="true" className="space-y-3"><div className={`${pulse} h-8 w-48`} /><div className={`${pulse} h-4 w-96 max-w-full`} /></div><div aria-hidden="true" className="grid gap-6 lg:grid-cols-[230px_1fr]"><div className="space-y-2">{[1,2,3,4,5].map(item => <div key={item} className={`${pulse} h-12`} />)}</div><div className="rounded-2xl bg-white p-6"><div className="grid gap-4 md:grid-cols-2">{[1,2,3,4,5,6].map(item => <div key={item} className={`${pulse} h-16`} />)}</div><div className={`${pulse} mt-6 h-12 w-36`} /></div></div></div>;
  if (variant === "ticket") return <div role="status" aria-live="polite" className="mx-auto max-w-md"><span className="sr-only">QR тасалбар ачаалж байна.</span><div aria-hidden="true" className={`${pulse} mx-auto h-64 w-64`} /><div aria-hidden="true" className="mt-6 space-y-3 rounded-xl bg-slate-50 p-4">{[1,2,3,4,5].map(item => <div key={item} className={`${pulse} h-5`} />)}</div><div aria-hidden="true" className={`${pulse} mt-4 h-12 w-full`} /></div>;
  return <div className="grid gap-4 md:grid-cols-2" role="status" aria-live="polite"><span className="sr-only">Мэдээлэл ачаалж байна.</span>{[1, 2, 3, 4].map(item => <div key={item} aria-hidden="true" className={`${pulse} h-48`} />)}</div>;
}

export function EmptyState({ title = "Одоогоор мэдээлэл олдсонгүй.", description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <h3 className="font-display font-bold text-slate-800">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message = "Мэдээллийг ачаалж чадсангүй.", onRetry }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
      <h3 className="font-display font-bold text-rose-800">{message}</h3>
      {onRetry && <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white">Дахин оролдох</button>}
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false, descriptionId }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const focusable = () => [...(panelRef.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
    (focusable()[0] || panelRef.current)?.focus();
    const onKey = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[1300] overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex="-1" className={`mx-auto my-6 rounded-3xl bg-white shadow-2xl outline-none ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <h2 id={titleId} className="font-display text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Хаах" className="rounded-lg px-3 py-1 text-xl text-slate-400 hover:bg-slate-100">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, description, confirmLabel = "Батлах", onConfirm, onClose, danger = false }) {
  const descriptionId = useId();
  return (
    <Modal title={title} onClose={onClose} descriptionId={descriptionId}>
      <p id={descriptionId} className="text-sm leading-relaxed text-slate-500">{description}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Болих</button>
        <button type="button" onClick={onConfirm} className={`rounded-lg px-4 py-2 text-xs font-bold text-white ${danger ? "bg-rose-600" : "bg-slate-900"}`}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="fixed bottom-5 right-5 z-[120] max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800 shadow-xl" role="status">
      {message}
    </div>
  );
}
