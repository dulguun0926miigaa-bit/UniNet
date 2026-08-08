import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, CircleHelp, LogOut, MessageSquareText, Settings, UserRound } from "lucide-react";
import SidebarToggleButton from "./SidebarToggleButton";
import NotificationDropdown from "./NotificationDropdown";
import SidebarNavIcon from "./SidebarNavIcon";
import UniversityLogo, { normalizeUniversityName } from "./UniversityLogo";

export default function DashboardLayout({ user, route, routes, navigate, onLogout, children, GlobalStyles, notifications = [], onNotificationClick, onOpenNotifications }) {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMounted, setProfileMounted] = useState(false);
  const [profileClosing, setProfileClosing] = useState(false);
  const drawerRef = useRef(null);
  const toggleRef = useRef(null);
  const profileTriggerRef = useRef(null);
  const profileMenuRef = useRef(null);
  const profileCloseTimerRef = useRef(null);
  const profileMenuId = useId();
  const roleLabel = user.role === "STAFF" ? "Staff" : user.role === "UNIVERSITY_ADMIN" ? "University Admin" : "Platform Super Admin";
  const universityName = normalizeUniversityName(user.university);
  const closeDrawer = useCallback(() => {
    setDrawer(false);
    window.setTimeout(() => toggleRef.current?.querySelector("button")?.focus(), 0);
  }, []);
  const go = path => { navigate(path); closeDrawer(); setProfileOpen(false); setNotificationsOpen(false); };
  const openSettingsSection = section => {
    window.sessionStorage.setItem("uninet-settings-section", section);
    window.dispatchEvent(new CustomEvent("uninet:settings-section", { detail: section }));
    go(`${routes[0].path}/settings`);
  };
  const openProfile = () => {
    window.clearTimeout(profileCloseTimerRef.current);
    setProfileOpen(true);
    setNotificationsOpen(false);
  };
  const scheduleProfileClose = () => {
    window.clearTimeout(profileCloseTimerRef.current);
    profileCloseTimerRef.current = window.setTimeout(() => setProfileOpen(false), 450);
  };
  useEffect(() => () => window.clearTimeout(profileCloseTimerRef.current), []);
  useEffect(() => {
    let timer;
    if (profileOpen) { setProfileMounted(true); setProfileClosing(false); }
    else if (profileMounted) { setProfileClosing(true); timer = window.setTimeout(() => { setProfileMounted(false); setProfileClosing(false); }, 180); }
    return () => window.clearTimeout(timer);
  }, [profileOpen, profileMounted]);
  useEffect(() => {
    if (!profileOpen) return undefined;
    const onPointerDown = event => {
      if (profileMenuRef.current?.contains(event.target) || profileTriggerRef.current?.contains(event.target)) return;
      setProfileOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [profileOpen]);
  useEffect(() => {
    if (!profileOpen) return undefined;
    const onKey = event => {
      if (event.key === "Escape") {
        setProfileOpen(false);
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
  }, [profileOpen]);
  useEffect(() => {
    if (!drawer) return undefined;
    drawerRef.current?.querySelector("button")?.focus();
    const onKey = event => {
      if (event.key === "Escape") closeDrawer();
      if (event.key === "Tab" && drawerRef.current) {
        const focusable = [...drawerRef.current.querySelectorAll("button")];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDrawer, drawer]);
  const activeIsHidden = routes.slice(8).some(item => route === item.path || route.startsWith(`${item.path}/`));
  const visibleRoutes = showAll || activeIsHidden ? routes : routes.slice(0, 8);
  const routeIsActive = item => {
    if (route === item.path) return true;
    const moreSpecific = routes.some(other => other.path !== item.path && other.path.startsWith(`${item.path}/`) && (route === other.path || route.startsWith(`${other.path}/`)));
    return !moreSpecific && item.path !== routes[0].path && route.startsWith(`${item.path}/`);
  };
  return (
    <div className="font-body min-h-screen bg-slate-50 text-slate-900">
      {GlobalStyles && <GlobalStyles />}
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 md:px-7">
          <span ref={toggleRef}><SidebarToggleButton mobile expanded={drawer} onClick={() => setDrawer(true)} controls="role-sidebar" className="md:hidden" /></span>
          <span className="-ml-7 hidden h-16 w-[84px] shrink-0 items-center justify-center md:flex"><SidebarToggleButton expanded={!collapsed} onClick={() => setCollapsed(value => !value)} controls="role-sidebar" /></span>
          <button type="button" onClick={() => go(routes[0].path)} className="font-display text-lg font-bold">UniNet</button>
          <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-700 sm:inline">{roleLabel}</span>
          <label className="mx-auto hidden max-w-xl flex-1 md:block">
            <span className="sr-only">Хайлт</span>
            <input type="search" placeholder={user.role === "PLATFORM_SUPER_ADMIN" ? "Сургууль, хэрэглэгч, audit хайх..." : "Контент, хэрэглэгч, бүртгэл хайх..."}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
          </label>
          <NotificationDropdown open={notificationsOpen} onToggle={() => { setNotificationsOpen(value => !value); setProfileOpen(false); }} onClose={() => setNotificationsOpen(false)}
            notifications={notifications} onNotificationClick={onNotificationClick} onOpenAll={() => { onOpenNotifications?.(); setNotificationsOpen(false); }} />
          <div className="relative" onMouseEnter={openProfile} onMouseLeave={scheduleProfileClose}>
            <button ref={profileTriggerRef} type="button" onClick={() => { setProfileOpen(value => !value); setNotificationsOpen(false); }} aria-expanded={profileOpen} aria-haspopup="menu" aria-controls={profileMenuId}
              className={`topbar-action group inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition duration-200 ${profileOpen ? "border-slate-700 bg-slate-900 text-white shadow-xl shadow-slate-900/20" : "border-slate-800 bg-slate-900 text-white hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/20"}`}>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 transition group-hover:scale-105 group-hover:bg-white/15"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
              <span className="hidden min-w-0 sm:block"><span className="block max-w-28 truncate text-xs font-bold">{user.name}</span><span className="block max-w-28 truncate text-[9px] text-slate-300">{universityName}</span></span>
              <ChevronDown aria-hidden="true" className={`hidden h-4 w-4 text-slate-300 transition duration-200 sm:block ${profileOpen ? "rotate-180" : "group-hover:translate-y-0.5"}`} />
            </button>
            {profileMounted && (
              <div id={profileMenuId} ref={profileMenuRef} role="menu" className={`${profileClosing ? "uninet-popover-out" : "uninet-popover"} absolute right-0 z-[1100] mt-3 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl`}>
                <div className="border-b border-slate-100 px-3 py-3"><div className="text-xs font-bold">{roleLabel}</div><div className="mt-1 break-all text-[10px] text-slate-400">{user.email}</div></div>
                <button role="menuitem" type="button" onClick={() => go(`${routes[0].path}/profile`)} className="profile-menu-item"><UserRound className="h-4 w-4" />Профайл</button>
                <button role="menuitem" type="button" onClick={() => go(`${routes[0].path}/settings`)} className="profile-menu-item"><Settings className="h-4 w-4" />Тохиргоо</button>
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
      <div className="md:grid transition-[grid-template-columns] duration-300" style={{ gridTemplateColumns: collapsed ? "84px minmax(0,1fr)" : "260px minmax(0,1fr)" }}>
        <aside id="role-sidebar" ref={drawerRef} className={`fixed inset-y-0 left-0 z-50 w-[285px] border-r border-slate-200 bg-white transition-[transform,width] duration-300 md:sticky md:top-16 md:z-30 md:h-[calc(100vh-4rem)] ${collapsed ? "md:w-[84px]" : "md:w-[260px]"} ${drawer ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
          <div className="flex items-center justify-between border-b border-slate-100 p-5 md:hidden"><b className="font-display">{roleLabel}</b><button type="button" onClick={closeDrawer} aria-label="Drawer хаах" className="px-3 py-2">×</button></div>
          <div className={`flex min-h-28 border-b border-slate-100 ${collapsed ? "items-center justify-center px-3" : "items-start px-8 py-5"}`}>
            {collapsed ? (
              <>
                <UniversityLogo university={universityName} className="hidden h-12 w-12 md:inline-grid" />
                <div className="md:hidden"><div className="font-display text-sm font-bold">{universityName}</div><div className="mt-1 text-[10px] text-slate-400">{user.department || "UniNet Operations"}</div></div>
              </>
            ) : (
              <div className="min-w-0"><div className="font-display truncate text-sm font-bold">{universityName}</div><div className="mt-1 truncate text-[10px] text-slate-400">{user.department || "UniNet Operations"}</div><div className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-700">Workspace active</div></div>
            )}
          </div>
          <nav className="sidebar-scrollbar h-[calc(100%-7rem)] space-y-1 overflow-y-auto p-4" aria-label={`${roleLabel} navigation`}>
            {visibleRoutes.map(item => <button key={item.path} type="button" onClick={() => go(item.path)} aria-label={item.label}
              className={`group relative block w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold ${collapsed ? "md:px-2 md:text-center" : ""} ${routeIsActive(item) ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
              <span className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
                <SidebarNavIcon path={item.path} />
                <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
              </span>
            </button>)}
            {routes.length > 8 && <button type="button" onClick={() => setShowAll(value => !value)} aria-label={showAll ? "See less" : "See more"}
              className={`block w-full rounded-xl border border-dashed border-slate-200 px-4 py-2.5 text-left text-xs font-bold text-blue-600 hover:bg-blue-50 ${collapsed ? "md:px-2 md:text-center" : ""}`}>
              {collapsed ? <><span className="hidden md:inline">•••</span><span className="md:hidden">{showAll ? "See less" : "See more"}</span></> : showAll ? "See less" : "See more"}
            </button>}
          </nav>
        </aside>
        <main className="min-w-0 p-5 md:p-8 lg:p-10"><div className="mx-auto max-w-7xl">{children}</div></main>
      </div>
    </div>
  );
}
