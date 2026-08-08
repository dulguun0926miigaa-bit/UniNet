export default function SidebarToggleButton({ expanded, mobile = false, onClick, controls, className = "" }) {
  const label = mobile
    ? (expanded ? "Navigation drawer хаах" : "Navigation drawer нээх")
    : (expanded ? "Sidebar хураах" : "Sidebar дэлгэх");
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-expanded={expanded} aria-controls={controls}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${className}`}>
      <span aria-hidden="true">☰</span>
    </button>
  );
}
