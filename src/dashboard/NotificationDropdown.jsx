import { Bell, CheckCheck, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { API_URL, apiRequest } from "../api/apiClient.js";

export default function NotificationDropdown({ open, onToggle, onClose, notifications = [], onOpenAll, onNotificationClick }) {
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const panelId = useId();
  const titleId = useId();
  const [polledNotifications, setPolledNotifications] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const displayedNotifications = polledNotifications || notifications;
  const unread = displayedNotifications.filter(item => !item.read).length;
  const keepOpen = () => {
    window.clearTimeout(closeTimerRef.current);
    if (!open) onToggle();
  };
  const scheduleClose = () => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(onClose, 450);
  };
  useEffect(() => {
    let timer;
    if (open) { setMounted(true); setClosing(false); }
    else if (mounted) { setClosing(true); timer = window.setTimeout(() => { setMounted(false); setClosing(false); }, 180); }
    return () => window.clearTimeout(timer);
  }, [open, mounted]);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose, open]);
  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.querySelector("button")?.focus();
    const close = event => {
      if (event.key !== "Escape") return;
      onClose();
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, open]);
  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);
  useEffect(() => {
    let active = true;
    let timer;
    let source;
    const poll = async () => {
      try {
        const payload = await apiRequest("/notifications?limit=20");
        if (active) setPolledNotifications(payload.notifications || []);
      } catch { /* bootstrap data remains visible */ }
    };
    const connect = async () => {
      try {
        const { token } = await apiRequest("/notifications/stream-token", { method: "POST" });
        source = new EventSource(`${API_URL}/notifications/stream?token=${encodeURIComponent(token)}`, { withCredentials: true });
        source.addEventListener("notification", () => poll());
        source.onerror = () => { source?.close(); source = null; };
      } catch { /* polling fallback below */ }
    };
    poll();
    connect();
    timer = window.setInterval(poll, 45_000);
    const onVisibility = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      source?.close();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const openNotification = async item => {
    setPolledNotifications(current => current?.map(notification => notification.id === item.id ? { ...notification, read: true } : notification) || current);
    if (!item.read) {
      try { await apiRequest(`/notifications/${encodeURIComponent(item.id)}/read`, { method: "PATCH" }); }
      catch { await (async () => { try { const payload = await apiRequest("/notifications?limit=20"); setPolledNotifications(payload.notifications || []); } catch { /* keep current UI */ } })(); }
    }
    onNotificationClick?.({ ...item, read: true });
    onClose();
  };
  const markAllRead = async () => {
    if (!unread || markingAll) return;
    setMarkingAll(true);
    const previous = displayedNotifications;
    setPolledNotifications(previous.map(item => ({ ...item, read: true })));
    try { await apiRequest("/notifications/read-all", { method: "PATCH" }); }
    catch { setPolledNotifications(previous); }
    finally { setMarkingAll(false); }
  };
  return (
    <div className="relative" onMouseEnter={keepOpen} onMouseLeave={scheduleClose}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        aria-label={`Мэдэгдэл: ${unread} уншаагүй`}
        className={`topbar-action group relative inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${open ? "border-blue-300 bg-blue-50 text-blue-700 shadow-lg shadow-blue-600/10" : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:shadow-lg hover:shadow-blue-600/10"}`}
      >
        <span className="relative grid h-6 w-6 place-items-center rounded-lg bg-slate-100 transition duration-200 group-hover:rotate-[-8deg] group-hover:bg-white">
          <Bell aria-hidden="true" className={`h-4 w-4 ${unread > 0 ? "notification-bell-active" : ""}`} strokeWidth={2.2} />
          {unread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500 shadow-sm" />}
        </span>
        <span className="hidden sm:inline">Мэдэгдэл</span>
        {unread > 0 && <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[9px] text-white shadow-sm">{unread}</span>}
      </button>
      {mounted && (
        <div id={panelId} ref={panelRef} role="dialog" aria-labelledby={titleId} className={`${closing ? "uninet-popover-out" : "uninet-popover"} fixed inset-x-3 top-[4.5rem] z-[1100] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[390px]`}>
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/95 p-4 backdrop-blur">
            <div><h2 id={titleId} className="font-display font-bold">Мэдэгдэл</h2><p className="text-[10px] text-slate-400">{unread} уншаагүй</p></div>
            <div className="flex items-center gap-1">
              {unread > 0 && <button type="button" disabled={markingAll} onClick={markAllRead} className="rounded-lg px-2.5 py-2 text-[10px] font-bold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50">{markingAll ? "Тэмдэглэж байна..." : "Бүгдийг уншсан"}</button>}
              <button type="button" onClick={onClose} aria-label="Мэдэгдэл хаах" className="rounded-lg p-2 text-slate-400 transition hover:rotate-90 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {!displayedNotifications.length && <div className="p-8 text-center"><CheckCheck className="mx-auto h-7 w-7 text-emerald-500" /><p className="mt-3 text-xs text-slate-500">Одоогоор мэдэгдэл алга байна.</p></div>}
            {displayedNotifications.slice(0, 6).map(item => (
              <button key={item.id} type="button" onClick={() => openNotification(item)} className={`group block w-full p-4 text-left transition hover:bg-slate-50 ${item.read ? "" : "bg-blue-50/50"}`}>
                <div className="flex justify-between gap-4"><b className="text-xs transition group-hover:text-blue-700">{item.title}</b><span className="shrink-0 text-[9px] text-slate-400">{item.time}</span></div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p>
                {item.actionUrl && <span className="mt-2 inline-flex text-[10px] font-bold text-blue-600">Холбогдох хэсэг рүү нээх →</span>}
              </button>
            ))}
          </div>
          {onOpenAll && <button type="button" onClick={onOpenAll} className="sticky bottom-0 w-full border-t border-slate-100 bg-white p-4 text-xs font-bold text-blue-600 transition hover:bg-blue-50">Бүх мэдэгдлийг харах</button>}
        </div>
      )}
    </div>
  );
}
