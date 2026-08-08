    
import { Fragment, lazy, Suspense, useState, useEffect, useRef } from "react";
import {
  Shield, Lock, Handshake, Globe2, Calendar, Briefcase,
  GraduationCap, Users, BarChart3, Bell, Search, FileCheck2, QrCode,
  Building2, Clock, ClipboardList, Megaphone,
  LayoutDashboard, KeyRound, ScrollText, Network as NetworkIcon,
  Radar, Wand2, Bookmark, Send
} from "lucide-react";
import { authService, roleHome } from "./auth/authService";
import AppErrorBoundary from "./errors/AppErrorBoundary";
import { mongolianErrorMessage } from "./errors/errorMessages.js";
import { apiRequest } from "./api/apiClient.js";

const StudentExperience = lazy(() => import("./student/StudentExperience"));
const OperationsExperience = lazy(() => import("./operations/OperationsExperience"));
const InvitationAcceptancePage = lazy(() => import("./memberships/InvitationAcceptancePage"));
 
/* ============================================================
   DESIGN TOKENS (brief-driven)
   Display face: Space Grotesk (geometric, premium, techy)
   Body face: Inter
   Identity color per university — the "colorful" premium accent system
   ============================================================ */
const UNIVERSITIES = [
  {
    code: "МУИС",
    short: "NUM",
    full: "National University of Mongolia",
    name: "Монгол Улсын Их Сургууль",
    desc: "Монголын хамгийн эртний, тэргүүлэх их сургууль — олон салбарын боловсрол, судалгааны төв.",
    from: "from-blue-500", to: "to-blue-700", solid: "bg-blue-600",
    text: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-200",
    hex: "#2563EB", hex2: "#1D4ED8",
    students: "6,200+", opps: "34",
  },
  {
    code: "ШУТИС",
    short: "MUST",
    full: "Science & Technology",
    name: "Шинжлэх Ухаан Технологийн Их Сургууль",
    desc: "Инженерчлэл, мэдээллийн технологи, барилгын салбарын тэргүүлэгч их сургууль.",
    from: "from-violet-500", to: "to-violet-700", solid: "bg-violet-600",
    text: "text-violet-600", bg: "bg-violet-50", ring: "ring-violet-200",
    hex: "#7C3AED", hex2: "#5B21B6",
    students: "8,100+", opps: "41",
  },
  {
    code: "МУБИС",
    short: "MNUE",
    full: "National University of Education",
    name: "Монгол Улсын Боловсролын Их Сургууль",
    desc: "Багш бэлтгэх, боловсролын судалгааны улсын хэмжээний тэргүүлэх сургууль.",
    from: "from-emerald-500", to: "to-emerald-700", solid: "bg-emerald-600",
    text: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200",
    hex: "#059669", hex2: "#047857",
    students: "3,400+", opps: "19",
  },
  {
    code: "АШУҮИС",
    short: "MNUMS",
    full: "Medical Sciences",
    name: "Анагаахын Шинжлэх Ухааны Үндэсний Их Сургууль",
    desc: "Эрүүл мэнд, анагаах ухааны боловсрол, судалгааны тэргүүлэх төв.",
    from: "from-rose-500", to: "to-rose-700", solid: "bg-rose-600",
    text: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-200",
    hex: "#E11D48", hex2: "#9F1239",
    students: "2,900+", opps: "22",
  },
  {
    code: "ХААИС",
    short: "MULS",
    full: "Life Sciences",
    name: "Хөдөө Аж Ахуйн Их Сургууль",
    desc: "Хөдөө аж ахуй, амьдрах ухааны боловсрол, судалгааны тэргүүлэх сургууль.",
    from: "from-amber-500", to: "to-amber-700", solid: "bg-amber-600",
    text: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200",
    hex: "#D97706", hex2: "#92400E",
    students: "2,100+", opps: "14",
  },
];
 
const TABS = [
  { id: "all", label: "Бүгд" },
  { id: "events", label: "Арга хэмжээ" },
  { id: "internships", label: "Дадлага" },
  { id: "surveys", label: "Судалгаа" },
];

const FALLBACK_UNIVERSITY = {
  code: "UniNet",
  short: "UN",
  full: "University Network",
  name: "UniNet их сургуулийн сүлжээ",
  desc: "Их сургуулийн мэдээлэл серверээс ачаалагдаж байна.",
  from: "from-blue-500", to: "to-violet-600", solid: "bg-blue-600",
  text: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-200",
  hex: "#2563EB", hex2: "#7C3AED", students: "—", opps: "—",
};

const formatCount = value => new Intl.NumberFormat("mn-MN").format(Number(value) || 0);

const NAV_ITEMS = [
  { label: "Нүүр", href: "#home" },
  { label: "Боломжууд", href: "#opportunities", tab: "all" },
  { label: "Арга хэмжээ", href: "#opportunities", tab: "events" },
  { label: "Их сургуулиуд", href: "#universities" },
  { label: "UniNet тухай", href: "#about" },
];

const VISIBILITY = [
  { id: "private", icon: Lock, title: "Private", tone: "rose", desc: "Зөвхөн контент эзэмшигч их сургуулийн хэрэглэгчид харна.", detail: "Анхдагч төлөв. Бүх шинэ контент энэ төвшинд эхэлдэг бөгөөд тухайн сургуулийн гишүүд л харах эрхтэй." },
  { id: "partners", icon: Handshake, title: "Partners", tone: "amber", desc: "Зөвхөн сонгосон хамтрагч их сургуулиуд харна.", detail: "Хоёр буюу түүнээс дээш сургууль харилцан зөвшөөрсөн хамтрагчийн холбоос дундаа контент хуваалцана." },
  { id: "network", icon: NetworkIcon, title: "Network", tone: "blue", desc: "UniNet сүлжээн дэх бүх их сургууль харна.", detail: "Таван сургуулийн бүх гишүүд харах боломжтой, гэхдээ бүртгэлгүй зочид хараахан харахгүй." },
  { id: "public", icon: Globe2, title: "Public", tone: "emerald", desc: "Бүртгэлгүй хэрэглэгч ч гэсэн үзэх боломжтой.", detail: "Хамгийн нээлттэй төвшин — гадаад байгууллага, ирээдүйн оюутнууд бүртгэлгүйгээр үзнэ." },
];
 
const FEATURES = [
  { icon: Building2, title: "Multi-tenant архитектур", desc: "Их сургууль бүр өөрийн тусгаарлагдсан орчинтой." },
  { icon: KeyRound, title: "Эрхийн удирдлага", desc: "Роль тус бүрт тохирсон нарийн хандалтын хяналт." },
  { icon: FileCheck2, title: "Зөвшөөрлийн урсгал", desc: "Нийтлэхийн өмнө хянаж батлах алхам." },
  { icon: Handshake, title: "Хамтын ажиллагааны удирдлага", desc: "Хамтрагч сургуулиудыг уриж, удирдах." },
  { icon: Calendar, title: "Арга хэмжээний бүртгэл", desc: "Онлайн бүртгэл, хүсэлтийн удирдлага." },
  { icon: QrCode, title: "QR ирц бүртгэл", desc: "QR кодоор ирц шалгах хурдан систем." },
  { icon: Briefcase, title: "Дадлага, ажлын өргөдөл", desc: "Онлайнаар өргөдөл гаргах, хянах." },
  { icon: ClipboardList, title: "Судалгааны хэрэгсэл", desc: "Судалгаа зохион байгуулж, дүн шинжилнэ." },
  { icon: Bell, title: "Бодит цагийн мэдэгдэл", desc: "Шинэ мэдээлэл шууд, алдалгүй хүрнэ." },
  { icon: Search, title: "Ухаалаг хайлт, шүүлтүүр", desc: "Хамгийн тохирох боломжийг хурдан ол." },
  { icon: BarChart3, title: "Аналитик, тайлан", desc: "Гүнзгий тоон мэдээлэл, дүн шинжилгээ." },
  { icon: ScrollText, title: "Аудит лог", desc: "Бүх үйлдлийн бүрэн, өөрчлөгдөшгүй түүх." },
];
 
const ROLES = [
  { icon: GraduationCap, title: "Оюутан", desc: "Боломж олж, бүртгүүлж, өргөдөл гаргаж, явцаа хянана.", tone: "blue" },
  { icon: Users, title: "Ажилтан", desc: "Арга хэмжээ, дадлага, ажлын байр, судалгаа үүсгэнэ.", tone: "violet" },
  { icon: Building2, title: "Их сургуулийн админ", desc: "Хэрэглэгч, хамтын ажиллагаа, зөвшөөрлийг удирдана.", tone: "emerald" },
  { icon: LayoutDashboard, title: "Платформ админ", desc: "Их сургуулиуд болон нийт сүлжээг удирдана.", tone: "rose" },
];
 
const JOURNEY = [
  { title: "Их сургуулийн имэйлээрээ бүртгүүлэх", desc: "Оюутны албан ёсны имэйлээр баталгаажуулна." },
  { title: "Сүлжээний мэдээллийг судлах", desc: "Өөрийн болон бусад сургуулийн боломжуудыг үзнэ." },
  { title: "Бүртгүүлэх, өргөдөл гаргах", desc: "Сонирхсон боломждоо нэг товшилтоор бүртгүүлнэ." },
  { title: "Зөвшөөрлөө өгөх", desc: "Мэдээллээ хуваалцахаас өмнө тодорхой зөвшөөрөл шаардана." },
  { title: "Явцаа хянах", desc: "Хүсэлт бүрийн статусыг бодит цагаар харна." },
  { title: "Сануулга авах", desc: "Чухал мэдээллийг цаг алдалгүй мэдэгдлээр авна." },
];
 
function cx(...a) { return a.filter(Boolean).join(" "); }

function DashboardLoading() {
  return (
    <main className="font-body grid min-h-screen place-items-center bg-slate-50 px-5 text-slate-900" aria-live="polite" aria-busy="true">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-lg" role="status">
        <div className="mx-auto h-10 w-10 animate-pulse rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600" aria-hidden="true" />
        <p className="font-display mt-4 font-bold">Dashboard ачаалж байна</p>
        <p className="mt-1 text-sm text-slate-500">Таны workspace-г бэлтгэж байна…</p>
      </div>
    </main>
  );
}

const STUDENT_MENU = [
  "Нүүр", "Миний сургууль", "UniNet сүлжээ", "Арга хэмжээ", "Дадлага",
  "Ажлын байр", "Судалгаа", "Зарлал", "Хадгалсан", "Миний бүртгэлүүд",
  "Миний өргөдлүүд",
];

const STUDENT_FEED = [
  { school: "МУИС", scope: "school", type: "Арга хэмжээ", title: "AI Hackathon 2026", desc: "48 цагийн турш бодит асуудлыг технологийн шийдлээр боловсруулах оюутны тэмцээн.", meta: "2026.08.15 · МУИС" },
  { school: "МУИС", scope: "school", type: "Судалгаа", title: "Оюутны хөдөлмөр эрхлэлтийн судалгаа", desc: "Төгсөгчдийн хөдөлмөр эрхлэлтийн судалгаанд оролцож санал бодлоо хуваалцаарай.", meta: "2026.08.20 · Онлайн" },
  { school: "ШУТИС", scope: "network", type: "Дадлага", title: "Frontend Developer Internship", desc: "Вэб хөгжүүлэлтийн багт гурван сарын хугацаатай дадлага хийх боломж.", meta: "Материал авах: 2026.08.01" },
  { school: "АШУҮИС", scope: "network", type: "Арга хэмжээ", title: "Medical Research Seminar", desc: "Анагаахын судалгааны шинэ арга зүйн нээлттэй семинар.", meta: "2026.08.20 · Их танхим" },
];

// Legacy dashboard retained temporarily while the modular student experience is stabilized.
// eslint-disable-next-line no-unused-vars
function StudentDashboard({ user, onLogout }) {
  const [activeMenu, setActiveMenu] = useState("Нүүр");
  const [feedScope, setFeedScope] = useState("school");
  const [saved, setSaved] = useState(["Frontend Developer Internship"]);

  const visibleFeed = STUDENT_FEED.filter(item => feedScope === "school" ? item.scope === "school" : true);
  const showHome = activeMenu === "Нүүр";
  const showRegistrations = activeMenu === "Миний бүртгэлүүд";
  const showApplications = activeMenu === "Миний өргөдлүүд";

  return (
    <div className="font-body min-h-screen bg-slate-50 text-slate-900">
      <GlobalMotionStyles />
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="h-16 px-5 md:px-8 flex items-center justify-between">
          <div>
            <span className="font-display text-lg font-bold">UniNet</span>
            <span className="ml-3 text-xs font-semibold text-slate-400">Student Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-bold">{user.school} · {user.role}</div>
              <div className="text-[10px] text-slate-400">{user.email}</div>
            </div>
            <button type="button" onClick={onLogout} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">
              Гарах
            </button>
          </div>
        </div>
      </header>

      <div className="md:grid md:grid-cols-[250px_1fr]">
        <aside className="border-b border-slate-200 bg-white md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:border-b-0 md:border-r">
          <nav className="sidebar-scrollbar flex gap-2 overflow-x-auto p-3 md:block md:space-y-1 md:overflow-y-auto md:p-5">
            {STUDENT_MENU.map(item => (
              <button key={item} type="button" onClick={() => {
                setActiveMenu(item);
                if (item === "Миний сургууль") setFeedScope("school");
                if (item === "UniNet сүлжээ") setFeedScope("network");
              }} className={cx(
                "shrink-0 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition-colors md:w-full",
                activeMenu === item ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              )}>
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 p-5 md:p-8 lg:p-10">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-600">{activeMenu}</p>
                <h1 className="font-display text-3xl font-bold text-slate-900 md:text-4xl">
                  {showHome ? "Сайн байна уу, Дөлгөөн 👋" : activeMenu}
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  {showHome ? "Танд тохирох шинэ боломжууд" : "Таны UniNet мэдээлэл нэг дор"}
                </p>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">
                {user.school} workspace
              </div>
            </div>

            {showHome && (
              <>
                <section className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {[
                    ["3", "Удахгүй болох арга хэмжээ"],
                    ["1", "Идэвхтэй өргөдөл"],
                    [String(saved.length), "Хадгалсан боломж"],
                    ["4", "Уншаагүй мэдэгдэл"],
                  ].map(([value, label]) => (
                    <div key={label} className="card-effect rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="font-display text-3xl font-bold text-slate-900">{value}</div>
                      <div className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{label}</div>
                    </div>
                  ))}
                </section>

                <section className="mb-10">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-display text-2xl font-bold">Home Feed</h2>
                    <div className="flex rounded-xl bg-slate-200/70 p-1">
                      <button type="button" onClick={() => setFeedScope("school")} className={cx("rounded-lg px-4 py-2 text-xs font-bold", feedScope === "school" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Миний сургууль</button>
                      <button type="button" onClick={() => setFeedScope("network")} className={cx("rounded-lg px-4 py-2 text-xs font-bold", feedScope === "network" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Сүлжээ</button>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {visibleFeed.map(item => {
                      const isSaved = saved.includes(item.title);
                      return (
                        <article key={item.title} className="card-effect rounded-2xl border border-slate-200 bg-white p-6">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">{item.type}</span>
                            <span className="text-xs font-bold text-slate-400">{item.school}</span>
                          </div>
                          <h3 className="font-display text-base font-bold">{item.title}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.desc}</p>
                          <p className="mt-4 text-xs font-semibold text-slate-400">{item.meta}</p>
                          <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
                            <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                              {item.type === "Дадлага" ? "CV илгээх" : item.type === "Судалгаа" ? "Судалгаа бөглөх" : "Бүртгүүлэх"}
                            </button>
                            <button type="button" onClick={() => setSaved(current => isSaved ? current.filter(title => title !== item.title) : [...current, item.title])}
                              aria-pressed={isSaved} aria-label={`${item.title}: ${isSaved ? "хадгалснаас хасах" : "хадгалах"}`} title={isSaved ? "Хадгалснаас хасах" : "Хадгалах"}
                              className={`group grid h-9 w-9 place-items-center rounded-lg border transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${isSaved ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}`}>
                              <Bookmark aria-hidden="true" className={`h-[18px] w-[18px] transition group-hover:scale-110 ${isSaved ? "fill-current" : ""}`} strokeWidth={2.1} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {(showHome || showRegistrations) && (
              <section className="mb-8">
                <h2 className="font-display mb-4 text-xl font-bold">Миний бүртгэлүүд</h2>
                <div className="card-effect rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="grid gap-5 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center">
                    <div><div className="text-xs font-bold text-blue-600">Арга хэмжээ</div><h3 className="font-display mt-1 font-bold">AI Hackathon 2026</h3></div>
                    <div><div className="text-[10px] uppercase text-slate-400">Огноо</div><div className="mt-1 text-sm font-semibold">2026.08.15</div></div>
                    <div><div className="text-[10px] uppercase text-slate-400">Статус</div><div className="mt-1 text-sm font-bold text-emerald-600">Confirmed</div></div>
                    <button type="button" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">QR тасалбар харах</button>
                  </div>
                </div>
              </section>
            )}

            {(showHome || showApplications) && (
              <section className="mb-8">
                <h2 className="font-display mb-4 text-xl font-bold">Миний өргөдлүүд</h2>
                <div className="card-effect rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="grid gap-5 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:items-center">
                    <div><div className="text-xs font-bold text-violet-600">Дадлага</div><h3 className="font-display mt-1 font-bold">Frontend Developer Internship</h3></div>
                    <div><div className="text-[10px] uppercase text-slate-400">Сургууль</div><div className="mt-1 text-sm font-semibold">ШУТИС</div></div>
                    <div><div className="text-[10px] uppercase text-slate-400">Илгээсэн</div><div className="mt-1 text-sm font-semibold">2026.07.22</div></div>
                    <div><div className="text-[10px] uppercase text-slate-400">Статус</div><div className="mt-1 text-sm font-bold text-amber-600">Under Review</div></div>
                  </div>
                </div>
              </section>
            )}

            {!showHome && !showRegistrations && !showApplications && (
              <section>
                <div className="grid gap-4 lg:grid-cols-2">
                  {visibleFeed.map(item => (
                    <article key={item.title} className="card-effect rounded-2xl border border-slate-200 bg-white p-6">
                      <div className="text-xs font-bold text-blue-600">{item.type} · {item.school}</div>
                      <h3 className="font-display mt-2 font-bold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.desc}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
 
/* ============================================================
   STYLE INJECTION — keyframes Tailwind's static sheet can't cover
   ============================================================ */
function GlobalMotionStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
      html { scroll-behavior: smooth; }
      .font-display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.02em; }
      .font-body { font-family: 'Inter', sans-serif; }
 
      @keyframes blobDrift { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(24px,-18px) scale(1.06); } 66% { transform: translate(-16px,14px) scale(0.96); } }
      .blob-anim { animation: blobDrift 16s ease-in-out infinite; }
      .blob-anim-delay { animation: blobDrift 20s ease-in-out infinite reverse; }
 
      @keyframes floatY { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-14px); } }
      .float-anim { animation: floatY 5s ease-in-out infinite; }
 
      @keyframes floatCard1 { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-16px) rotate(1deg); } }
      @keyframes floatCard2 { 0%,100% { transform: translateY(0) rotate(2deg); } 50% { transform: translateY(-10px) rotate(-1deg); } }
      @keyframes floatCard3 { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-20px) rotate(2deg); } }
      .fc-1 { animation: floatCard1 6.5s ease-in-out infinite; }
      .fc-2 { animation: floatCard2 5.5s ease-in-out infinite; }
      .fc-3 { animation: floatCard3 7s ease-in-out infinite; }
 
      @keyframes dashFlow { to { stroke-dashoffset: -200; } }
      .dash-flow { stroke-dasharray: 6 8; animation: dashFlow 6s linear infinite; }
 
      @keyframes pulseNode { 0% { transform: scale(0.7); opacity: 0.9; } 100% { transform: scale(2.4); opacity: 0; } }
      .pulse-node::after { content:''; position:absolute; inset:-6px; border-radius:9999px; border:1.5px solid currentColor; animation: pulseNode 2.2s ease-out infinite; }
 
      @keyframes marqueeLeft { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      @keyframes marqueeRight { from { transform: translateX(-50%); } to { transform: translateX(0); } }
      .marquee-left { animation: marqueeLeft 32s linear infinite; }
      .marquee-right { animation: marqueeRight 38s linear infinite; }
      .marquee-row:hover .marquee-track { animation-play-state: paused; }

      .card-effect {
        position: relative;
        isolation: isolate;
        overflow: hidden;
        transition: translate .3s ease, box-shadow .3s ease, border-color .3s ease;
      }
      .card-effect::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        background: linear-gradient(120deg, transparent 20%, rgba(255,255,255,.72) 48%, transparent 76%);
        transform: translateX(-120%);
        transition: transform .65s ease;
      }
      .card-effect > * { position: relative; z-index: 2; }
      .card-effect:hover {
        translate: 0 -5px;
        box-shadow: 0 20px 45px -28px rgba(15,23,42,.5);
        border-color: rgba(99,102,241,.28);
      }
      .card-effect:hover::after { transform: translateX(120%); }

      @keyframes compareGlow {
        0%,100% { transform: translate3d(-8%, -8%, 0) scale(1); opacity: .45; }
        50% { transform: translate3d(8%, 8%, 0) scale(1.12); opacity: .72; }
      }
      @keyframes arrowPulse {
        0%,100% { transform: translateX(0); opacity: .65; }
        50% { transform: translateX(7px); opacity: 1; }
      }
      .compare-shell { position: relative; isolation: isolate; overflow: hidden; }
      .compare-shell::before {
        content: '';
        position: absolute;
        width: 28rem;
        height: 28rem;
        left: 50%;
        top: 50%;
        z-index: -1;
        border-radius: 9999px;
        background: radial-gradient(circle, rgba(99,102,241,.28), transparent 68%);
        filter: blur(12px);
        animation: compareGlow 7s ease-in-out infinite;
      }
      .compare-column {
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 1.25rem;
        padding: 1.5rem;
        background: rgba(255,255,255,.04);
        backdrop-filter: blur(10px);
        transition: transform .3s ease, background .3s ease, border-color .3s ease;
      }
      .compare-column:hover {
        transform: translateY(-4px);
        background: rgba(255,255,255,.075);
        border-color: rgba(255,255,255,.2);
      }
      .compare-arrow { animation: arrowPulse 1.8s ease-in-out infinite; }
 
      @keyframes fadeUp { from { opacity:0; transform: translateY(24px); } to { opacity:1; transform: translateY(0); } }
      .reveal { opacity:0; animation: fadeUp .7s cubic-bezier(.22,.68,0,1) forwards; }
 
      @keyframes stageFade { 0% { opacity:0; transform: scale(0.94) translateY(10px); } 12% { opacity:1; transform: scale(1) translateY(0); } 88% { opacity:1; transform: scale(1) translateY(0); } 100% { opacity:0; transform: scale(0.96) translateY(-6px); } }
 
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      .shimmer-text { background-size: 200% auto; animation: shimmer 5s linear infinite; }
 
      @media (prefers-reduced-motion: reduce) {
        .blob-anim, .blob-anim-delay, .float-anim, .fc-1, .fc-2, .fc-3, .dash-flow, .pulse-node::after, .marquee-left, .marquee-right, .reveal, .shimmer-text, .compare-shell::before, .compare-arrow { animation: none !important; opacity: 1 !important; transform: none !important; }
      }
    `}</style>
  );
}
 
/* ============================================================
   STYLIZED "3D" CAMPUS GLYPH — per-university SVG identity
   (elegant abstract silhouette, not a literal building copy)
   ============================================================ */
// eslint-disable-next-line no-unused-vars
function CampusGlyph({ uni, size = 220 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 220 220" fill="none" className="drop-shadow-xl">
      <defs>
        <linearGradient id={`grad-${uni.code}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={uni.hex} />
          <stop offset="100%" stopColor={uni.hex2} />
        </linearGradient>
        <radialGradient id={`glow-${uni.code}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={uni.hex} stopOpacity="0.35" />
          <stop offset="100%" stopColor={uni.hex} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="110" cy="100" r="95" fill={`url(#glow-${uni.code})`} />
      {/* platform */}
      <ellipse cx="110" cy="176" rx="70" ry="10" fill={uni.hex} opacity="0.12" />
      {/* isometric campus block */}
      <g>
        <path d="M60 150 L110 175 L160 150 L160 100 L110 75 L60 100 Z" fill={`url(#grad-${uni.code})`} opacity="0.92" />
        <path d="M60 100 L110 75 L160 100 L110 125 Z" fill="#fff" opacity="0.18" />
        <path d="M110 125 L160 100 L160 150 L110 175 Z" fill="#000" opacity="0.08" />
        {/* windows */}
        {[0,1,2].map(i => (
          <rect key={i} x={92 + i*13} y={128 + i*2} width="7" height="16" rx="1.5" fill="#fff" opacity="0.65" />
        ))}
      </g>
      {/* spire / signature mark */}
      <rect x="104" y="45" width="12" height="34" rx="3" fill={`url(#grad-${uni.code})`} />
      <circle cx="110" cy="40" r="9" fill="#fff" stroke={uni.hex} strokeWidth="3" />
      <text x="110" y="44" textAnchor="middle" fontSize="7" fontWeight="800" fill={uni.hex} fontFamily="Space Grotesk, sans-serif">{uni.short}</text>
    </svg>
  );
}
 
/* ============================================================
   NETWORK BACKGROUND — glowing nodes + animated connecting lines
   ============================================================ */
// eslint-disable-next-line no-unused-vars
function NetworkBackground({ activeIdx }) {
  const positions = [
    { x: 120, y: 90 }, { x: 340, y: 60 }, { x: 560, y: 110 },
    { x: 460, y: 260 }, { x: 220, y: 270 },
  ];
  const pairs = [[0,1],[1,2],[2,3],[3,4],[4,0],[0,2]];
  return (
    <svg viewBox="0 0 640 340" className="absolute inset-0 w-full h-full opacity-70" preserveAspectRatio="xMidYMid slice">
      {pairs.map(([a,b], i) => (
        <line key={i} x1={positions[a].x} y1={positions[a].y} x2={positions[b].x} y2={positions[b].y}
          stroke="#93C5FD" strokeWidth="1.2" className="dash-flow" opacity="0.5" />
      ))}
      {positions.map((p, i) => (
        <g key={i} className="pulse-node" style={{ color: UNIVERSITIES[i].hex, position: "relative" }}>
          <circle cx={p.x} cy={p.y} r={i === activeIdx ? 7 : 4.5} fill={UNIVERSITIES[i].hex}
            style={{ transition: "r .4s ease" }} />
          <circle cx={p.x} cy={p.y} r="14" fill={UNIVERSITIES[i].hex} opacity={i === activeIdx ? 0.18 : 0} style={{transition:"opacity .4s ease"}} />
        </g>
      ))}
    </svg>
  );
}
 
/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function UniNetLanding() {
  const [uniIdx, setUniIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [visOpen, setVisOpen] = useState(null);
  const [visSelected, setVisSelected] = useState(2);
  const [authView, setAuthView] = useState(null);
  const [signupEmail, setSignupEmail] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [mfaFlow, setMfaFlow] = useState(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordResetFlow, setPasswordResetFlow] = useState({ email: "", challengeToken: "", destination: "", resetToken: "" });
  const [publicBootstrap, setPublicBootstrap] = useState({ universities: [], content: [], oauth: { googleEnabled: false } });
  const [googleProfile, setGoogleProfile] = useState(null);
  const [googleOnboardingMode, setGoogleOnboardingMode] = useState("LINK_EXISTING");
  const [publicLoaded, setPublicLoaded] = useState(false);
  const [publicEventState, setPublicEventState] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => {
    return authService.getSession();
  });
  const timerRef = useRef(null);
  const displayUniversities = publicBootstrap.universities.length
    ? publicBootstrap.universities.map((live, index) => {
      const style = UNIVERSITIES.find((item) => item.code === live.shortName)
        || UNIVERSITIES[index % UNIVERSITIES.length];
      return {
        ...style,
        code: live.shortName || live.name,
        short: (live.slug || live.shortName || "UN").slice(0, 6).toUpperCase(),
        full: live.domain || live.name,
        name: live.name,
        desc: live.description || "UniNet-д бүртгэлтэй их сургууль.",
        students: formatCount(live.studentCount),
        opps: formatCount(live.opportunityCount),
      };
    })
    : [FALLBACK_UNIVERSITY];
  const liveOpportunities = publicBootstrap.content.map((item) => ({
    id: item.id,
    uni: displayUniversities.findIndex((university) => university.code === item.university),
    type: { EVENT: "Арга хэмжээ", INTERNSHIP: "Дадлага", JOB: "Ажлын байр", RESEARCH: "Судалгаа", ANNOUNCEMENT: "Зарлал" }[item.type] || item.type,
    cat: item.type === "EVENT" ? "events" : item.type === "INTERNSHIP" ? "internships" : item.type === "RESEARCH" ? "surveys" : "all",
    title: item.title,
    desc: item.shortDescription,
    date: item.startsAt ? new Date(item.startsAt).toLocaleDateString("mn-MN") : item.deadlineAt ? `Хугацаа: ${new Date(item.deadlineAt).toLocaleDateString("mn-MN")}` : "Нээлттэй",
    loc: item.location || item.mode || "Онлайн",
    vis: item.visibility === "PUBLIC" ? "Public" : "Network",
  }));
  const marqueeOpportunities = liveOpportunities.length
    ? Array.from({ length: Math.max(2, Math.ceil(10 / liveOpportunities.length)) }, () => liveOpportunities).flat()
    : [];
  const networkStats = [
    [publicLoaded ? formatCount(publicBootstrap.universities.length) : "—", "их сургууль"],
    [publicLoaded ? formatCount(publicBootstrap.universities.reduce((sum, item) => sum + (Number(item.studentCount) || 0), 0)) : "—", "идэвхтэй оюутан"],
    [publicLoaded ? formatCount(publicBootstrap.universities.reduce((sum, item) => sum + (Number(item.opportunityCount) || 0), 0)) : "—", "нийтэлсэн боломж"],
    [publicLoaded ? formatCount(publicBootstrap.content.filter(item => item.type === "EVENT").length) : "—", "нээлттэй арга хэмжээ"],
  ];

  const detectedUniversity = publicBootstrap.universities.find(({ domain }) =>
    domain && signupEmail.trim().toLowerCase().endsWith(`@${domain.toLowerCase()}`)
  );

  const openAuth = (view) => {
    setAuthView(view);
    setAuthMessage("");
    setMenuOpen(false);
  };


  const resolvePostAuthPath = (account, fallback) => {
    const isStudent = account?.role === "STUDENT" || account?.role === "Student";
    if (!isStudent) return fallback;
    const currentEvent = window.location.pathname.match(/^\/event\/([0-9a-f-]{36})\/?$/i);
    const stored = window.sessionStorage.getItem("uninet.authReturnTo");
    const target = stored || (currentEvent ? `/student/content/${currentEvent[1]}` : "");
    if (target?.startsWith("/student/")) {
      window.sessionStorage.removeItem("uninet.authReturnTo");
      return target;
    }
    return fallback;
  };

  const requestEventTicket = (eventId) => {
    const target = `/student/content/${eventId}`;
    window.sessionStorage.setItem("uninet.authReturnTo", target);
    if (currentUser?.role === "STUDENT") {
      window.sessionStorage.removeItem("uninet.authReturnTo");
      window.history.pushState({}, "", target);
      setPublicEventState(null);
      return;
    }
    openAuth("login");
    setAuthMessage("Нэвтэрсний дараа энэ арга хэмжээ рүү автоматаар буцаж тасалбар авна.");
  };

  const handleNav = (item) => {
    if (item.tab) setTab(item.tab);
    setMenuOpen(false);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    try {
      const result = await authService.login(email, password, rememberMe);
      if (result.mfaRequired) {
        setMfaFlow({ challengeToken: result.challengeToken, methods: result.methods });
        setAuthView("mfa-login");
        setAuthMessage("Authenticator эсвэл recovery code оруулна уу.");
        return;
      }
      if (result.mfaEnrollmentRequired) {
        const enrollment = await authService.startMfaBootstrap(result.enrollmentToken);
        setMfaFlow({ enrollmentToken: result.enrollmentToken, ...enrollment });
        setAuthView("mfa-enroll");
        setAuthMessage("Admin account-д MFA заавал идэвхжүүлнэ.");
        return;
      }
      const account = result.account;
      window.history.pushState({}, "", resolvePostAuthPath(account, roleHome[account.role]));
      setCurrentUser(account);
      setAuthView(null);
      setAuthMessage("");
    } catch (reason) {
      if (reason.code === "EMAIL_VERIFICATION_REQUIRED") {
        setPendingVerificationEmail(email);
        setAuthView("verify");
      } else if (reason.code === "ACCOUNT_PENDING_REVIEW") {
        setPendingVerificationEmail(email);
        setAuthView("pending");
      }
      setAuthMessage(reason.message);
    }
  };

  const handleMfaLogin = async (event) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim();
    try {
      const result = mfaFlow?.oauth
        ? await authService.verifyOAuthMfa(code)
        : await authService.verifyMfaLogin(mfaFlow?.challengeToken, code);
      window.history.pushState({}, "", resolvePostAuthPath(result.account, result.redirectTo || roleHome[result.account.role]));
      setCurrentUser(result.account);
      setMfaFlow(null);
      setAuthView(null);
      setAuthMessage("");
    } catch (reason) { setAuthMessage(reason.message); }
  };

  const handleMfaEnrollment = async (event) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim();
    try {
      const result = mfaFlow?.oauth
        ? await authService.confirmOAuthMfaBootstrap(mfaFlow?.setupToken, code)
        : await authService.confirmMfaBootstrap(mfaFlow?.enrollmentToken, mfaFlow?.setupToken, code);
      setMfaFlow({
        ...mfaFlow,
        recoveryCodes: result.recoveryCodes,
        account: result.account,
        redirectTo: result.redirectTo || roleHome[result.account.role],
      });
      setAuthMessage("MFA идэвхжлээ. Recovery code-уудаа аюулгүй хадгална уу.");
    } catch (reason) { setAuthMessage(reason.message); }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      const result = await authService.register({
        lastName: String(formData.get("lastName") || "").trim(),
        firstName: String(formData.get("firstName") || "").trim(),
        email: signupEmail,
        password: String(formData.get("password") || ""),
        confirmPassword: String(formData.get("confirmPassword") || ""),
        branchSchool: String(formData.get("branchSchool") || ""),
        major: String(formData.get("major") || ""),
        enrollmentYear: Number(formData.get("enrollmentYear")),
        acceptedTerms: formData.get("acceptedTerms") === "on",
      });
      setPendingVerificationEmail(signupEmail.trim().toLowerCase());
      if (result.accessToken) {
        authService.saveSession(result.account, result);
        window.history.pushState({}, "", resolvePostAuthPath(result.account, result.redirectTo || "/student"));
        setCurrentUser(result.account);
        setAuthView(null);
      } else {
        setAuthView(result.reviewRequired ? "pending" : "verify");
      }
      setAuthMessage(result.message || "");
    } catch (reason) {
      setAuthMessage(reason.message);
    }
  };

  const handleGoogleOnboarding = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      const schoolEmail = String(formData.get("schoolEmail") || "").trim();
      const payload = googleOnboardingMode === "LINK_EXISTING"
        ? {
            mode: "LINK_EXISTING",
            schoolEmail,
            password: String(formData.get("password") || ""),
          }
        : {
            mode: "REGISTER_NEW",
            schoolEmail,
            firstName: String(formData.get("firstName") || "").trim(),
            lastName: String(formData.get("lastName") || "").trim(),
            branchSchool: String(formData.get("branchSchool") || "").trim(),
            major: String(formData.get("major") || "").trim(),
            enrollmentYear: Number(formData.get("enrollmentYear")),
            password: String(formData.get("password") || ""),
            confirmPassword: String(formData.get("confirmPassword") || ""),
            acceptedTerms: formData.get("acceptedTerms") === "on",
          };
      const result = await authService.completeGoogleOnboarding(payload);
      if (result.mfaRequired) {
        setMfaFlow({ challengeToken: result.challengeToken, methods: result.methods });
        setAuthView("mfa-login");
      } else if (result.mfaEnrollmentRequired) {
        const enrollment = await authService.startMfaBootstrap(result.enrollmentToken);
        setMfaFlow({ enrollmentToken: result.enrollmentToken, ...enrollment });
        setAuthView("mfa-enroll");
      } else if (result.accessToken) {
        window.history.replaceState({}, "", resolvePostAuthPath(result.account, result.redirectTo || "/student"));
        setCurrentUser(result.account);
        setAuthView(null);
      } else if (result.verificationRequired) {
        setPendingVerificationEmail(result.account?.email || schoolEmail);
        setAuthView("verify");
      } else {
        setPendingVerificationEmail(result.account?.email || schoolEmail);
        setAuthView("pending");
      }
      setAuthMessage(result.message || "");
    } catch (reason) { setAuthMessage(reason.message); }
  };

  const handleVerifyEmail = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      const result = await authService.verifyEmail(
        pendingVerificationEmail,
        String(formData.get("code") || "").trim(),
      );
      if (result.accessToken) {
        authService.saveSession(result.account, result);
        window.history.pushState({}, "", resolvePostAuthPath(result.account, result.redirectTo || "/student"));
        setCurrentUser(result.account);
        setAuthView(null);
        setAuthMessage("");
      } else {
        setAuthView("pending");
        setAuthMessage(result.message || "");
      }
    } catch (reason) {
      setAuthMessage(reason.message);
    }
  };

  const handleResendVerification = async () => {
    try {
      const result = await authService.resendEmailVerification(pendingVerificationEmail);
      setAuthMessage(result.message);
    } catch (reason) {
      setAuthMessage(reason.message);
    }
  };


  const handlePasswordResetStart = async (event) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") || "").trim().toLowerCase();
    try {
      const result = await authService.requestPasswordReset(email);
      if (!result.challengeToken) { setAuthMessage(result.message || "OTP илгээх боломжтой бүртгэл олдсонгүй."); return; }
      setPasswordResetFlow({ email, challengeToken: result.challengeToken, destination: result.destination || "имэйл", resetToken: "" });
      setAuthView("forgot-otp");
      setAuthMessage(result.message || "6 оронтой OTP код илгээгдлээ.");
    } catch (reason) { setAuthMessage(reason.message); }
  };

  const handlePasswordResetOtpVerify = async (event) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim();
    try {
      const result = await authService.verifyPasswordResetOtp(passwordResetFlow.challengeToken, code);
      setPasswordResetFlow(current => ({ ...current, resetToken: result.resetToken }));
      setAuthView("forgot-new-password");
      setAuthMessage("OTP амжилттай баталгаажлаа. Шинэ нууц үгээ үүсгэнэ үү.");
    } catch (reason) { setAuthMessage(reason.message); }
  };

  const handlePasswordResetConfirm = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    if (password !== confirmPassword) { setAuthMessage("Нууц үг таарахгүй байна."); return; }
    try {
      const result = await authService.confirmPasswordReset(passwordResetFlow.resetToken, password, confirmPassword);
      setPasswordResetFlow({ email: "", challengeToken: "", destination: "", resetToken: "" });
      setAuthView("forgot-success");
      setAuthMessage(result.message || "Нууц үг амжилттай шинэчлэгдлээ.");
    } catch (reason) { setAuthMessage(reason.message); }
  };
 
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailChangeToken = params.get("emailChangeToken");
    if (emailChangeToken) {
      authService.confirmEmailChange(emailChangeToken).then(result => {
        setAuthMessage(result.message);
        setAuthView("login");
        window.history.replaceState({}, "", "/");
      }).catch(reason => { setAuthMessage(reason.message); setAuthView("login"); });
      return;
    }
    const oauth = params.get("oauth");
    if (!oauth) return;
    if (oauth === "success") {
      authService.restoreSession().then(account => {
        setCurrentUser(account);
        window.history.replaceState({}, "", resolvePostAuthPath(account, roleHome[account.role] || "/"));
      }).catch(reason => { setAuthMessage(reason.message); openAuth("login"); });
    }
    if (oauth === "mfa") {
      setMfaFlow({ oauth: true });
      setAuthView("mfa-login");
      setAuthMessage("Google нэвтрэлтийг дуусгахын тулд MFA код оруулна уу.");
      window.history.replaceState({}, "", "/");
    }
    if (oauth === "mfa-enroll") {
      authService.startOAuthMfaBootstrap().then(enrollment => {
        setMfaFlow({ oauth: true, ...enrollment });
        setAuthView("mfa-enroll");
        setAuthMessage("Admin account-д MFA заавал идэвхжүүлнэ.");
        window.history.replaceState({}, "", "/");
      }).catch(reason => { setAuthMessage(reason.message); setAuthView("login"); });
    }
    if (oauth === "onboarding") {
      authService.getGoogleOnboarding().then(payload => {
        setGoogleProfile(payload.profile);
        setGoogleOnboardingMode(payload.profile?.intent === "register" ? "REGISTER_NEW" : "LINK_EXISTING");
        setAuthView("google-onboarding");
        window.history.replaceState({}, "", "/");
      }).catch(reason => { setAuthMessage(reason.message); openAuth("signup"); });
    }
    if (oauth === "verify") {
      const verificationEmail = params.get("email") || "";
      setPendingVerificationEmail(verificationEmail);
      setAuthView("verify");
      setAuthMessage("Сургуулийн имэйлээр ирсэн 6 оронтой кодыг оруулж бүртгэлээ идэвхжүүлнэ үү.");
      window.history.replaceState({}, "", "/");
    }
    if (oauth === "error") {
      const code = params.get("code") || "GOOGLE_AUTH_FAILED";
      setAuthMessage(mongolianErrorMessage({ code }));
      setAuthView("login");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const onSessionExpired = () => { if (active) setCurrentUser(null); };
    window.addEventListener("uninet:session-expired", onSessionExpired);
    authService.restoreSession()
      .then((account) => { if (active && account) setCurrentUser(account); })
      .catch(() => { if (active) { authService.clearSession(); setCurrentUser(null); } });
    return () => { active = false; window.removeEventListener("uninet:session-expired", onSessionExpired); };
  }, []);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/event\/([0-9a-f-]{36})\/?$/i);
    if (!match) { setPublicEventState(null); return undefined; }
    const controller = new AbortController();
    setPublicEventState({ loading: true, event: null, error: "" });
    apiRequest(`/public/events/${match[1]}`, { auth: false, signal: controller.signal, cacheTtlMs: 15_000 })
      .then(payload => setPublicEventState({ loading: false, event: payload.event, error: "" }))
      .catch(reason => {
        if (reason.name !== "AbortError") setPublicEventState({ loading: false, event: null, error: reason.message || "Арга хэмжээ олдсонгүй." });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/public/bootstrap", { auth: false, signal: controller.signal, cacheTtlMs: 30000 })
      .then((payload) => {
        setPublicBootstrap({
          universities: Array.isArray(payload.universities) ? payload.universities : [],
          content: Array.isArray(payload.content) ? payload.content : [],
          oauth: payload.oauth || { googleEnabled: false },
        });
        setPublicLoaded(true);
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") {
          setPublicBootstrap({ universities: [], content: [], oauth: { googleEnabled: false } });
          setPublicLoaded(true);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    timerRef.current = setInterval(() => {
      setUniIdx((i) => (i + 1) % displayUniversities.length);
    }, 4200);
    return () => clearInterval(timerRef.current);
  }, [displayUniversities.length]);
 
  const goTo = (i) => {
    clearInterval(timerRef.current);
    setUniIdx(i);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      timerRef.current = setInterval(() => setUniIdx((k) => (k + 1) % displayUniversities.length), 4200);
    }
  };
 
  const activeUni = displayUniversities[uniIdx] || displayUniversities[0];
  const availableOpportunities = liveOpportunities;
  const filteredOpps = tab === "all" ? availableOpportunities : availableOpportunities.filter(o => o.cat === tab);
 
  const toneMap = {
    rose: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-200", solid: "bg-rose-600" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-200", solid: "bg-amber-600" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-200", solid: "bg-blue-600" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-200", solid: "bg-emerald-600" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-200", solid: "bg-violet-600" },
  };

  if (window.location.pathname === "/accept-invitation") {
    const goToLogin = async () => {
      if (currentUser) await authService.logout();
      window.history.replaceState({}, "", "/");
      setCurrentUser(null);
      openAuth("login");
    };
    return (
      <AppErrorBoundary resetKey="accept-invitation" onGoHome={goToLogin}>
        <Suspense fallback={<DashboardLoading />}>
          <InvitationAcceptancePage GlobalStyles={GlobalMotionStyles} onGoToLogin={goToLogin} />
        </Suspense>
      </AppErrorBoundary>
    );
  }

  if (currentUser) {
    const logout = async () => {
      await authService.logout();
      window.history.pushState({}, "", "/");
      setCurrentUser(null);
    };
    const isStudent = currentUser.role === "STUDENT" || currentUser.role === "Student";
    return (
      <AppErrorBoundary resetKey={currentUser.role} onGoHome={logout}>
        <Suspense fallback={<DashboardLoading />}>
          {isStudent
            ? <StudentExperience user={{ ...currentUser, school: currentUser.school || currentUser.university, role: "Student" }} onLogout={logout} GlobalStyles={GlobalMotionStyles} />
            : <OperationsExperience user={currentUser} onLogout={logout} GlobalStyles={GlobalMotionStyles} />}
        </Suspense>
      </AppErrorBoundary>
    );
  }
 
  return (
    <div className="font-body text-slate-900 bg-white antialiased">
      <GlobalMotionStyles />
 
      {/* ============ NAV ============ */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-white/75 border-b border-slate-200">
        <nav className="max-w-7xl mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-display font-bold text-lg">UniNet</span>
          </div>
          <ul className="hidden lg:flex items-center gap-1 text-sm font-semibold text-slate-600">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <a href={item.href} onClick={() => handleNav(item)}
                  className="px-3 py-2 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="hidden md:flex items-center gap-3">
            {currentUser ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-right">
                <div className="text-xs font-bold text-emerald-800">{currentUser.school} · {currentUser.role}</div>
                <div className="text-[10px] text-emerald-600">{currentUser.email}</div>
              </div>
            ) : (
              <>
                <button type="button" onClick={() => openAuth("login")} className="text-sm font-semibold px-3 py-2 rounded-lg hover:bg-slate-100">Нэвтрэх</button>
                <button type="button" onClick={() => openAuth("signup")} className="text-sm font-semibold px-4 py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
                  Бүртгүүлэх
                </button>
              </>
            )}
          </div>
          <button type="button" aria-label={menuOpen ? "Үндсэн цэс хаах" : "Үндсэн цэс нээх"} aria-expanded={menuOpen} aria-controls="landing-mobile-navigation" className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100" onClick={() => setMenuOpen(!menuOpen)}>
            <span aria-hidden="true" className="text-lg leading-none">{menuOpen ? "×" : "☰"}</span>
          </button>
        </nav>
        {menuOpen && (
          <div id="landing-mobile-navigation" className="lg:hidden border-t border-slate-200 px-6 py-4 flex flex-col gap-1 bg-white">
            {NAV_ITEMS.map((item) => (
              <a key={item.label} href={item.href} onClick={() => handleNav(item)}
                className="py-2.5 font-semibold text-slate-700 border-b border-slate-100">
                {item.label}
              </a>
            ))}
            <div className="flex gap-2 mt-4">
              {currentUser ? (
                <div className="w-full rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                  {currentUser.school} · {currentUser.role}
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => openAuth("login")} className="flex-1 text-center py-2.5 rounded-lg border border-slate-200 font-semibold text-sm">Нэвтрэх</button>
                  <button type="button" onClick={() => openAuth("signup")} className="flex-1 text-center py-2.5 rounded-lg bg-slate-900 text-white font-semibold text-sm">Бүртгүүлэх</button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {publicEventState && !authView && (
        <div className="fixed inset-0 z-[1290] overflow-y-auto bg-slate-950/70 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="public-event-title">
          <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl">
            {publicEventState.loading ? <div className="p-8"><div className="animate-pulse space-y-5"><div className="h-8 w-2/3 rounded-xl bg-slate-200" /><div className="h-4 w-full rounded bg-slate-200" /><div className="h-52 rounded-2xl bg-slate-200" /></div></div> : publicEventState.error ? <div className="p-8 text-center"><h2 id="public-event-title" className="font-display text-2xl font-bold">Арга хэмжээ нээж чадсангүй</h2><p className="mt-3 text-sm text-slate-500">{publicEventState.error}</p><button type="button" onClick={() => { window.history.replaceState({}, "", "/"); setPublicEventState(null); }} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">UniNet нүүр рүү буцах</button></div> : (() => {
              const event = publicEventState.event;
              return <>
                <div className="bg-gradient-to-br from-blue-600 to-violet-700 p-7 text-white md:p-9"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider">Event QR registration</span><button type="button" onClick={() => { window.history.replaceState({}, "", "/"); setPublicEventState(null); }} aria-label="Хаах" className="rounded-lg bg-white/10 px-3 py-1.5 text-xl">×</button></div><h2 id="public-event-title" className="font-display mt-6 text-3xl font-bold">{event.title}</h2><p className="mt-3 text-sm leading-relaxed text-blue-100">{event.shortDescription}</p></div>
                <div className="p-7 md:p-9"><div className="grid gap-3 rounded-2xl bg-slate-50 p-5 text-sm sm:grid-cols-2"><div><span className="text-xs text-slate-400">Сургууль</span><b className="mt-1 block">{event.university?.shortName || event.university?.name || "UniNet"}</b></div><div><span className="text-xs text-slate-400">Огноо</span><b className="mt-1 block">{event.startsAt ? new Intl.DateTimeFormat("mn-MN", { dateStyle: "long", timeStyle: "short" }).format(new Date(event.startsAt)) : "Тодорхойгүй"}</b></div><div><span className="text-xs text-slate-400">Байршил</span><b className="mt-1 block">{event.location || event.mode || "Онлайн"}</b></div><div><span className="text-xs text-slate-400">Суудал</span><b className="mt-1 block">{event.seatsRemaining == null ? "Хязгааргүй" : `${event.seatsRemaining} үлдсэн`}</b></div></div><p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-600">{event.description}</p><button type="button" onClick={() => requestEventTicket(event.id)} className="mt-7 w-full rounded-xl bg-slate-900 py-4 text-sm font-bold text-white shadow-lg shadow-slate-900/15">{currentUser?.role === "STUDENT" ? "Тасалбар авах" : "Нэвтрээд тасалбар авах"}</button><p className="mt-3 text-center text-[10px] text-slate-400">Нэвтэрсний дараа event detail рүү буцаж, “Тасалбар авах” товчоор баталгаажуулна.</p></div>
              </>;
            })()}
          </div>
        </div>
      )}

      {authView && (
        <div className="fixed inset-0 z-[1300] overflow-y-auto bg-slate-950/60 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div className={cx("mx-auto bg-white rounded-3xl border border-white/60 shadow-2xl", ["signup", "google-onboarding", "mfa-enroll"].includes(authView) ? "max-w-4xl" : "max-w-md")}>
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5 md:px-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">
                  {authView === "google-onboarding" ? "Google OAuth бүртгэл" : authView === "mfa-login" ? "Нэмэлт баталгаажуулалт" : authView === "mfa-enroll" ? "Admin MFA тохиргоо" : authView?.startsWith("forgot-") ? "Нууц үг сэргээх" : authView === "signup" ? "Оюутны бүртгэл" : authView === "verify" ? "Имэйл баталгаажуулалт" : authView === "pending" ? "Бүртгэлийн төлөв" : "UniNet бүртгэл"}
                </p>
                <h2 id="auth-title" className="font-display text-2xl font-bold text-slate-900">
                  {authView === "google-onboarding" ? "Сургуулийн имэйлээ нэг удаа холбоно уу" : authView === "mfa-login" ? "Authenticator код оруулах" : authView === "mfa-enroll" ? "Хоёр шатлалт хамгаалалт идэвхжүүлэх" : authView === "forgot-password" ? "Student account-аа олох" : authView === "forgot-otp" ? "OTP код баталгаажуулах" : authView === "forgot-new-password" ? "Шинэ нууц үг үүсгэх" : authView === "forgot-success" ? "Нууц үг шинэчлэгдлээ" : authView === "signup" ? "Сургуулийн эрхээ үүсгэх" : authView === "verify" ? "Имэйлээ баталгаажуулах" : authView === "pending" ? "Бүртгэлийн төлөв" : "Нэвтрэх"}
                </h2>
              </div>
              <button type="button" onClick={() => setAuthView(null)} aria-label="Хаах"
                className="rounded-lg px-3 py-1.5 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-900">×</button>
            </div>

            <div className="px-6 py-6 md:px-8">
              {(authView === "login" || authView === "signup") && (
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 mb-6">
                  <button type="button" onClick={() => openAuth("login")}
                    className={cx("rounded-lg py-2.5 text-sm font-bold transition-colors", authView === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>
                    Нэвтрэх
                  </button>
                  <button type="button" onClick={() => openAuth("signup")}
                    className={cx("rounded-lg py-2.5 text-sm font-bold transition-colors", authView === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>
                    Бүртгүүлэх
                  </button>
                </div>
              )}

              {authView === "login" && (
                <div>
                  <button type="button" disabled={!publicBootstrap.oauth?.googleEnabled} onClick={() => authService.startGoogleOAuth("login", rememberMe)}
                    className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-lg font-black text-blue-600 shadow-sm">G</span>
                    Google эрхээр нэвтрэх
                  </button>
                  {!publicBootstrap.oauth?.googleEnabled && <p className="mb-4 text-center text-[10px] text-slate-400">Google Cloud credentials тохируулсны дараа идэвхжинэ.</p>}
                  <div className="mb-4 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-300"><span className="h-px flex-1 bg-slate-200" />эсвэл<span className="h-px flex-1 bg-slate-200" /></div>
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-bold text-slate-700 mb-2">Сургуулийн имэйл</label>
                    <input id="login-email" name="email" type="email" required placeholder="student@num.edu.mn"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                  </div>
                  <div>
                    <label htmlFor="login-password" className="block text-xs font-bold text-slate-700 mb-2">Нууц үг</label>
                    <input id="login-password" name="password" type="password" required placeholder="••••••••"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                  </div>
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <label className="flex items-center gap-2 text-slate-600">
                      <input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} className="rounded border-slate-300" /> Намайг сана
                    </label>
                    <button type="button" onClick={() => { setPasswordResetFlow({ email: "", challengeToken: "", destination: "", resetToken: "" }); openAuth("forgot-password"); }} className="font-bold text-blue-600 hover:text-blue-700">Нууц үг мартсан?</button>
                  </div>
                  <button type="submit" className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800">Нэвтрэх</button>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Өөрийн бүртгүүлсэн имэйл болон нууц үгээр нэвтэрнэ.
                  </p>
                </form>
                </div>
              )}

              {authView === "signup" && (
                <div>
                  <button type="button" disabled={!publicBootstrap.oauth?.googleEnabled} onClick={() => authService.startGoogleOAuth("register")}
                    className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-lg font-black text-blue-600 shadow-sm">G</span>
                    Google эрхээр бүртгүүлэх
                  </button>
                  <div className="mb-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-300"><span className="h-px flex-1 bg-slate-200" />эсвэл нууц үгээр<span className="h-px flex-1 bg-slate-200" /></div>
                  <div className="mb-6 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                    {["Сургуулийн имэйл", "Профайл бөглөх", "Имэйл батлах", "Student Dashboard"].map((step, i) => (
                      <Fragment key={step}>
                        <span className={cx("rounded-full px-3 py-1.5", i === 0 ? "bg-blue-600 text-white" : "bg-slate-100")}>{i + 1}. {step}</span>
                        {i < 3 && <span className="text-slate-300">→</span>}
                      </Fragment>
                    ))}
                  </div>

                  <form onSubmit={handleSignup}>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="signup-last-name" className="block text-xs font-bold text-slate-700 mb-2">Овог</label>
                        <input id="signup-last-name" name="lastName" autoComplete="family-name" required maxLength={80}
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                      </div>
                      <div>
                        <label htmlFor="signup-first-name" className="block text-xs font-bold text-slate-700 mb-2">Нэр</label>
                        <input id="signup-first-name" name="firstName" autoComplete="given-name" required maxLength={80}
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                      </div>
                      <div className="md:col-span-2">
                        <label htmlFor="signup-email" className="block text-xs font-bold text-slate-700 mb-2">Сургуулийн имэйл</label>
                        <input id="signup-email" type="email" required value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)}
                          placeholder="student@num.edu.mn" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                      </div>
                      <div>
                        <label htmlFor="signup-password" className="block text-xs font-bold text-slate-700 mb-2">Нууц үг</label>
                        <input id="signup-password" name="password" type="password" required minLength={12} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                      </div>
                      <div>
                        <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-700 mb-2">Нууц үг давтах</label>
                        <input id="confirm-password" name="confirmPassword" type="password" required minLength={12} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-2">Сургууль</label>
                        <div className={cx("rounded-xl border px-4 py-3 text-sm font-semibold", detectedUniversity ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400")}>
                          {detectedUniversity?.shortName || "Имэйлийн домэйноор автоматаар танина"}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="branch" className="block text-xs font-bold text-slate-700 mb-2">Салбар сургууль</label>
                        <input id="branch" name="branchSchool" required placeholder="Жишээ: МТЭС" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                      </div>
                      <div>
                        <label htmlFor="major" className="block text-xs font-bold text-slate-700 mb-2">Мэргэжил</label>
                        <input id="major" name="major" required className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                      </div>
                      <div>
                        <label htmlFor="enrollment-year" className="block text-xs font-bold text-slate-700 mb-2">Элсэх он</label>
                        <select id="enrollment-year" name="enrollmentYear" required defaultValue="" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10">
                          <option value="" disabled>Оноо сонгоно уу</option>
                          {Array.from({ length: 16 }, (_, index) => new Date().getFullYear() - index).map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                        <p className="mt-1 text-[10px] text-slate-400">Ирээдүйн он сонгох боломжгүй.</p>
                      </div>
                    </div>

                    {signupEmail && (
                      <div className={cx("mt-4 rounded-xl border px-4 py-3 text-sm", detectedUniversity ? "border-blue-200 bg-blue-50 text-blue-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
                        {detectedUniversity
                          ? <>Таны сургууль: <b>{detectedUniversity.shortName}</b> · Имэйл баталгаажмагц Student account идэвхжинэ.</>
                          : "Энэ домэйн UniNet-д баталгаажаагүй байна. Бүртгэл үүсгэхийн тулд баталгаажсан сургуулийн домэйн шаардлагатай."}
                      </div>
                    )}

                    <label className="mt-5 flex items-start gap-3 text-xs leading-relaxed text-slate-600">
                      <input type="checkbox" name="acceptedTerms" required className="mt-0.5 rounded border-slate-300" />
                      Үйлчилгээний нөхцөл болон нууцлалын бодлогыг зөвшөөрч байна.
                    </label>
                    <button type="submit" className="mt-5 w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800">
                      Бүртгэл үүсгэх
                    </button>
                  </form>
                </div>
              )}

              {authView === "google-onboarding" && (
                <div>
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    Google account: <b>{googleProfile?.gmail}</b><br />
                    <span className="text-xs text-blue-700">Энэ Google account нэг Student account-той л холбогдоно. Дараагийн удаа Google-ээр шууд нэвтэрнэ.</span>
                  </div>

                  <div className="my-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                    <button type="button" onClick={() => { setGoogleOnboardingMode("LINK_EXISTING"); setAuthMessage(""); }}
                      className={cx("rounded-lg px-3 py-2.5 text-xs font-bold transition", googleOnboardingMode === "LINK_EXISTING" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                      Бүртгэлтэй account-аар нэвтрэх
                    </button>
                    <button type="button" onClick={() => { setGoogleOnboardingMode("REGISTER_NEW"); setAuthMessage(""); }}
                      className={cx("rounded-lg px-3 py-2.5 text-xs font-bold transition", googleOnboardingMode === "REGISTER_NEW" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                      Шинээр бүртгүүлэх
                    </button>
                  </div>

                  <form onSubmit={handleGoogleOnboarding} className="space-y-5">
                    {googleOnboardingMode === "LINK_EXISTING" ? (
                      <>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-800">
                          Өмнө нь үүсгэсэн Student account-ийн сургуулийн имэйл, нууц үгийг нэг удаа оруулж Google account-тай холбоно.
                        </div>
                        <label className="block text-xs font-bold text-slate-700">Сургуулийн имэйл
                          <input name="schoolEmail" type="email" required placeholder="өөрийн-нэр@num.edu.mn" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                          <span className="mt-1 block text-[10px] font-normal text-slate-400">student@ гэж заавал эхлэхгүй. Баталгаажсан сургуулийн домэйнтэй байхад болно.</span>
                        </label>
                        <label className="block text-xs font-bold text-slate-700">Одоогийн нууц үг
                          <input name="password" type="password" required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                        </label>
                        <button type="submit" className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800">Google account холбож нэвтрэх</button>
                      </>
                    ) : (
                      <>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="text-xs font-bold text-slate-700">Овог<input name="lastName" required defaultValue={googleProfile?.lastName || ""} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500" /></label>
                          <label className="text-xs font-bold text-slate-700">Нэр<input name="firstName" required defaultValue={googleProfile?.firstName || ""} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500" /></label>
                          <label className="text-xs font-bold text-slate-700 md:col-span-2">Сургуулийн имэйл<input name="schoolEmail" type="email" required placeholder="өөрийн-нэр@num.edu.mn" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500" /><span className="mt-1 block text-[10px] font-normal text-slate-400">Local хэсэг хүссэн нэр байж болно. Домэйнээр их сургуулийг автоматаар тодорхойлно.</span></label>
                          <label className="text-xs font-bold text-slate-700">Салбар сургууль<input name="branchSchool" required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500" /></label>
                          <label className="text-xs font-bold text-slate-700">Мэргэжил<input name="major" required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500" /></label>
                          <label className="text-xs font-bold text-slate-700">Элссэн он<select name="enrollmentYear" required defaultValue="" className="uninet-select mt-2 w-full"><option value="" disabled>Он сонгоно уу</option>{Array.from({ length: 16 }, (_, index) => new Date().getFullYear() - index).map(year => <option key={year}>{year}</option>)}</select></label>
                          <label className="text-xs font-bold text-slate-700">UniNet нууц үг<input name="password" type="password" required minLength={12} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500" /><span className="mt-1 block text-[10px] font-normal text-slate-400">12+ тэмдэгт, том/жижиг үсэг, тоо, тусгай тэмдэг.</span></label>
                          <label className="text-xs font-bold text-slate-700 md:col-span-2">Нууц үг давтах<input name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500" /></label>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">Сургуулийн имэйлээр ирэх 6 оронтой кодыг баталгаажуулсны дараа account шууд ACTIVE болно. University Admin approve хийхгүй.</div>
                        <label className="flex items-start gap-3 text-xs leading-relaxed text-slate-600"><input type="checkbox" name="acceptedTerms" required className="mt-0.5" />Үйлчилгээний нөхцөл болон нууцлалын бодлогыг зөвшөөрч байна.</label>
                        <button type="submit" className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700">Google-ээр шинэ Student бүртгэл үүсгэх</button>
                      </>
                    )}
                  </form>
                </div>
              )}


              {authView === "forgot-password" && (
                <form onSubmit={handlePasswordResetStart} className="space-y-5">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
                    Сургуулийн имэйлээ оруулна уу. Google account холбогдсон бол OTP код linked Gmail рүү, үгүй бол баталгаажсан сургуулийн имэйл рүү илгээгдэнэ.
                  </div>
                  <label className="block text-xs font-bold text-slate-700">Сургуулийн имэйл
                    <input name="email" type="email" required autoFocus autoComplete="email" placeholder="dulguun@num.edu.mn" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                  </label>
                  <button type="submit" className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white">6 оронтой OTP авах</button>
                  <button type="button" onClick={() => openAuth("login")} className="w-full text-xs font-bold text-slate-500 hover:text-slate-800">Нэвтрэх рүү буцах</button>
                </form>
              )}

              {authView === "forgot-otp" && (
                <form onSubmit={handlePasswordResetOtpVerify} className="space-y-5">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900">
                    <b>{passwordResetFlow.destination}</b> хаяг руу Resend-ээр илгээсэн 6 оронтой OTP кодыг оруулна уу.
                  </div>
                  <label className="block text-xs font-bold text-slate-700">6 оронтой OTP
                    <input name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="000000" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] outline-none focus:border-blue-500" />
                  </label>
                  <button type="submit" className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white">OTP баталгаажуулах</button>
                  <button type="button" onClick={() => openAuth("forgot-password")} className="w-full text-xs font-bold text-slate-500">Имэйлээ өөрчлөх / шинэ код авах</button>
                </form>
              )}

              {authView === "forgot-new-password" && (
                <form onSubmit={handlePasswordResetConfirm} className="space-y-5">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">OTP баталгаажлаа. Шинэ нууц үг өмнөх нууц үгүүдтэй давхцахгүй байна.</div>
                  <label className="block text-xs font-bold text-slate-700">Шинэ нууц үг<input name="password" type="password" required autoFocus minLength={12} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500" /></label>
                  <label className="block text-xs font-bold text-slate-700">Шинэ нууц үг давтах<input name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-blue-500" /></label>
                  <p className="text-[11px] leading-relaxed text-slate-500">12+ тэмдэгт, том/жижиг үсэг, тоо, тусгай тэмдэг. Амжилттай сольсны дараа хуучин бүх session болон remembered login хүчингүй болно.</p>
                  <button type="submit" className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white">Шинэ нууц үг хадгалах</button>
                </form>
              )}

              {authView === "forgot-success" && (
                <div className="text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
                  <p className="mt-5 text-sm leading-relaxed text-slate-600">Шинэ нууц үг хадгалагдаж, өмнөх бүх session болон remembered device session хүчингүй боллоо. Одоо сургуулийн имэйл болон шинэ нууц үгээрээ нэвтэрнэ.</p>
                  <button type="button" onClick={() => { setPasswordResetFlow({ email: "", challengeToken: "", destination: "", resetToken: "" }); openAuth("login"); }} className="mt-5 w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white">Нэвтрэх</button>
                </div>
              )}

              {authView === "mfa-login" && (
                <form onSubmit={handleMfaLogin} className="space-y-5">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    Google Authenticator, Microsoft Authenticator эсвэл хадгалсан recovery code-оо оруулна уу.
                  </div>
                  <label className="block text-xs font-bold text-slate-700">6 оронтой код эсвэл recovery code
                    <input name="code" required autoFocus autoComplete="one-time-code" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono text-xl tracking-widest outline-none focus:border-blue-500" />
                  </label>
                  <button type="submit" className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white">Баталгаажуулж нэвтрэх</button>
                </form>
              )}

              {authView === "mfa-enroll" && (
                <div className="space-y-5">
                  {mfaFlow?.recoveryCodes ? (
                    <>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">MFA амжилттай идэвхжлээ. Доорх код бүр нэг удаа ашиглагдана.</div>
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-4 font-mono text-xs text-white">{mfaFlow.recoveryCodes.map(code => <code key={code}>{code}</code>)}</div>
                      <button type="button" onClick={() => {
                        const account = mfaFlow?.account;
                        if (account) {
                          window.history.pushState({}, "", resolvePostAuthPath(account, mfaFlow?.redirectTo || roleHome[account.role]));
                          setCurrentUser(account);
                        }
                        setMfaFlow(null);
                        setAuthView(null);
                        setAuthMessage("");
                      }} className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white">Recovery code хадгалсан, Dashboard руу орох</button>
                    </>
                  ) : (
                    <form onSubmit={handleMfaEnrollment} className="grid gap-5 md:grid-cols-[260px_1fr]">
                      <div className="rounded-2xl border border-slate-200 bg-white p-3"><img src={mfaFlow?.qrDataUrl} alt="Authenticator QR code" className="mx-auto h-60 w-60" /></div>
                      <div className="space-y-4">
                        <p className="text-sm leading-relaxed text-slate-600">Authenticator app-аар QR кодыг уншуул. QR ажиллахгүй бол secret-ийг гараар оруулна.</p>
                        <code className="block break-all rounded-xl bg-slate-100 p-3 text-xs font-bold text-slate-800">{mfaFlow?.secret}</code>
                        <label className="block text-xs font-bold text-slate-700">App дээр гарсан 6 оронтой код<input name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono text-xl tracking-widest outline-none focus:border-blue-500" /></label>
                        <button type="submit" className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white">MFA идэвхжүүлэх</button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {authView === "verify" && (
                <div>
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
                    <b>{pendingVerificationEmail || signupEmail}</b> хаяг руу 6 оронтой код илгээлээ. Код 10 минут хүчинтэй.
                  </div>
                  <form onSubmit={handleVerifyEmail} className="mt-5 space-y-4">
                    <div>
                      <label htmlFor="verification-code" className="block text-xs font-bold text-slate-700 mb-2">Баталгаажуулах код</label>
                      <input id="verification-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} pattern="[0-9]{6}" placeholder="000000"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                    </div>
                    <button type="submit" className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800">Имэйл баталгаажуулах</button>
                  </form>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                    <button type="button" onClick={handleResendVerification} className="font-bold text-blue-600 hover:text-blue-700">Код дахин илгээх</button>
                    <button type="button" onClick={() => openAuth("login")} className="font-bold text-slate-500 hover:text-slate-800">Нэвтрэх рүү буцах</button>
                  </div>
                </div>
              )}

              {authView === "pending" && (
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl">⏳</div>
                  <p className="mt-5 text-sm leading-relaxed text-slate-600">
                    <b>{pendingVerificationEmail}</b> бүртгэл үүслээ. Таны бүртгэл хуучин pending төлөвтэй байна. Системийн migration ажилласны дараа дахин нэвтэрнэ үү.
                  </p>
                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Шинэ Student бүртгэлүүд имэйл баталгаажмагц автоматаар <b>ACTIVE</b> болно.
                  </div>
                  <button type="button" onClick={() => openAuth("login")} className="mt-5 w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800">Нэвтрэх хуудас руу буцах</button>
                </div>
              )}

              {authMessage && (
                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800" role="status">
                  {authMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ HERO ============ */}
      <section id="home" className="landing-hero scroll-mt-20 relative overflow-hidden bg-gradient-to-b from-slate-50 via-blue-50/60 to-white">
        <div className="landing-grid absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="absolute inset-0"><NetworkBackground activeIdx={uniIdx} /></div>
        <div className="absolute -top-40 -left-32 w-[480px] h-[480px] rounded-full bg-blue-300/30 blur-3xl blob-anim" />
        <div className="absolute -bottom-32 -right-24 w-[440px] h-[440px] rounded-full bg-violet-300/25 blur-3xl blob-anim-delay" />
 
        <div className="relative max-w-7xl mx-auto px-6 md:px-8 pt-16 md:pt-24 pb-20 grid lg:grid-cols-2 gap-14 items-center">
          <div className="reveal" style={{ animationDelay: "0.05s" }}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-3.5 py-1.5 rounded-full mb-6">
              <span className="relative w-2 h-2 rounded-full bg-blue-600 pulse-node" />
              {displayUniversities.length} их сургуулийн албан ёсны сүлжээ
            </span>
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.08] mb-4 text-slate-900">
              Монголын их сургуулиудын боломжийг{" "}
              <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-rose-500 bg-clip-text text-transparent shimmer-text">
                нэг сүлжээнд
              </span>
            </h1>
            <p className="text-lg font-semibold text-slate-500 mb-4">Connecting universities, students, and opportunities</p>
            <p className="text-base text-slate-500 max-w-lg mb-9 leading-relaxed">
              UniNet нь оюутнуудыг их сургуулиудын арга хэмжээ, дадлага, ажлын байр, судалгаа болон бусад боломжуудтай аюулгүй, нэгдсэн платформоор холбодог.
            </p>
            <div className="flex flex-wrap gap-3 mb-10">
              <a href="#opportunities" className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 text-white font-semibold shadow-lg shadow-slate-300 hover:bg-slate-800 hover:-translate-y-0.5 transition-all">
                Боломжуудыг үзэх
              </a>
              <button type="button" onClick={() => openAuth("login")} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-slate-300 bg-white/70 backdrop-blur font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors">
                Их сургуулиар нэвтрэх
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2.5">
                {displayUniversities.map((u) => (
                  <div key={u.code} className={cx("w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white", u.solid)}>
                    {u.short.slice(0,2)}
                  </div>
                ))}
              </div>
              <span className="text-xs font-semibold text-slate-500">МУИС · ШУТИС · МУБИС · АШУҮИС · ХААИС — нэгдсэн сүлжээнд</span>
            </div>
          </div>
 
          {/* Rotating campus stage + network bg + floating glass cards */}
          <div className="relative reveal" style={{ animationDelay: "0.2s" }}>
            <div className="relative aspect-square max-w-[440px] mx-auto">
              <div className="absolute inset-0 flex items-center justify-center">
                <div key={uniIdx} className="relative flex flex-col items-center" style={{ animation: "stageFade 4.2s ease" }}>
                  <div className={cx("mt-1 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm", activeUni.bg, activeUni.text)}>
                    {activeUni.code} — {activeUni.full}
                  </div>
                </div>
              </div>
 
              {/* floating glass UI cards */}
              <div className="absolute top-2 -left-4 fc-1">
                <div className="card-effect flex items-center gap-2 bg-white/80 backdrop-blur-md border border-white shadow-xl rounded-xl px-3.5 py-2.5">
                  <span className="text-xs font-bold text-slate-700">Шинэ дадлага нийтлэгдлээ</span>
                </div>
              </div>
              <div className="absolute bottom-16 -right-6 fc-2">
                <div className="card-effect flex items-center gap-2 bg-white/80 backdrop-blur-md border border-white shadow-xl rounded-xl px-3.5 py-2.5">
                  <span className="text-xs font-bold text-slate-700">Арга хэмжээнд бүртгэгдлээ</span>
                </div>
              </div>
              <div className="absolute bottom-0 left-6 fc-3">
                <div className="card-effect flex items-center gap-2 bg-white/80 backdrop-blur-md border border-white shadow-xl rounded-xl px-3.5 py-2.5">
                  <span className="text-xs font-bold text-slate-700">Их сургуулиудыг холбосон хамтын ажиллагааны сүлжээ</span>
                </div>
              </div>
            </div>
 
            {/* stage dots */}
            <div className="flex justify-center gap-2 mt-6">
              {displayUniversities.map((u, i) => (
                <button key={u.code} onClick={() => goTo(i)} aria-label={u.name}
                  className={cx("h-1.5 rounded-full transition-all duration-300", i === uniIdx ? cx("w-7", u.solid) : "w-1.5 bg-slate-300")} />
              ))}
            </div>
          </div>
        </div>
      </section>
 
      {/* ============ TRUSTED UNIVERSITIES ============ */}
      <section id="universities" className="scroll-mt-20 py-20 md:py-24 border-y border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 reveal">
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-3">Нэг сүлжээ. {displayUniversities.length} их сургууль. Илүү олон боломж.</h2>
            <p className="text-slate-500 max-w-xl mx-auto leading-relaxed">Сүлжээ бүрдэх их сургуулиуд өөрийн өвөрмөц өнгө, онцлогтойгоор танилцуулагдана.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {displayUniversities.map((u, i) => (
              <div key={u.code}
                className="card-effect reveal group relative overflow-hidden rounded-2xl border border-slate-200 border-t-4 bg-white px-6 pb-6 pt-3 text-center"
                style={{ animationDelay: `${i * 0.08}s`, borderTopColor: u.hex }}>
                <div className="font-display mb-0.5 text-sm font-bold leading-tight">{u.code}</div>
                <div className="mb-4 text-[11px] leading-tight text-slate-400">{u.full}</div>
                <div className="flex justify-between text-xs border-t border-slate-100 pt-3">
                  <div><b className="block font-display text-sm">{u.students}</b><span className="text-slate-400">оюутан</span></div>
                  <div><b className="block font-display text-sm">{u.opps}</b><span className="text-slate-400">боломж</span></div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-14 text-center">
            {networkStats.map(([n,l]) => (
              <div key={l} className="reveal">
                <div className="font-display font-bold text-3xl bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">{n}</div>
                <div className="text-xs font-semibold text-slate-500 mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
 
      {/* ============ MARQUEE OPPORTUNITY SHOWCASE ============ */}
      <section className="py-20 md:py-24 overflow-hidden bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-8 mb-12 text-center reveal">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-3.5 py-1.5 rounded-full mb-4">Амьд экосистем</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl mb-3">Боломжууд тасралтгүй урсаж байна</h2>
          <p className="text-slate-500 max-w-xl mx-auto leading-relaxed">Сүлжээний шинэ контент нийтлэгдсэн даруйдаа энд харагдана.</p>
        </div>
        {marqueeOpportunities.length ? <div className="marquee-row relative">
            <div className="marquee-track marquee-left flex gap-5 w-max">
              {marqueeOpportunities.map((opportunity, i) => {
                const uni = displayUniversities[opportunity.uni] || FALLBACK_UNIVERSITY;
                return (
                  <div key={`${opportunity.id}-${i}`} className="card-effect w-72 shrink-0 bg-white/90 backdrop-blur border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-end mb-3">
                      <span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full", uni.bg, uni.text)}>{uni.code}</span>
                    </div>
                    <div className="font-display font-bold text-sm mb-1">{opportunity.title}</div>
                    <div className="line-clamp-2 text-xs leading-relaxed text-slate-400">{opportunity.desc}</div>
                  </div>
                );
              })}
            </div>
          </div> : <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
            {publicLoaded ? "Одоогоор нийтэд нээлттэй боломж алга байна." : "Боломжуудыг серверээс ачаалж байна…"}
          </div>}
      </section>
 
      {/* ============ PROBLEM / BEFORE-AFTER ============ */}
      <section className="py-20 md:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 reveal">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-3.5 py-1.5 rounded-full mb-4">Асуудал</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-3">Одоогийн мэдээлэл тархай, боломжууд оюутнуудад хүрдэггүй</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
            {[
              { icon: Megaphone, t: "Мэдээлэл тархай байршилтай", d: "Боломжууд Facebook, имэйл, вэбсайтад тусад нь тархсан байдаг." },
              { icon: Clock, t: "Боломж алдагдана", d: "Оюутнууд арга хэмжээ, дадлагын мэдээллийг цаг алдан мэддэг." },
              { icon: ClipboardList, t: "Гар аргаар зохицуулдаг", d: "Их сургуулиуд хамтын ажиллагааг гараар, имэйлээр удирддаг." },
              { icon: Users, t: "Тус тусад нь холбогддог", d: "Байгууллагууд сургууль бүртэй тусад нь холбогдох шаардлагатай." },
            ].map((c, i) => (
              <div key={i} className="card-effect reveal bg-white rounded-2xl border border-slate-200 p-6" style={{ animationDelay: `${i*0.08}s` }}>
                <h4 className="font-display font-bold text-sm mb-2">{c.t}</h4>
                <p className="text-sm text-slate-500 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
          <div className="reveal overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-200/60">
            <div className="grid lg:grid-cols-[1fr_180px_1fr]">
              <div className="p-7 md:p-10">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"><span className="h-2 w-2 rounded-full bg-rose-500" />Тархай ажиллагаа</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {["Facebook пост", "Тархай имэйл", "Google Forms", "Тусдаа вэбсайтууд", "Excel файлууд"].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-sm font-semibold text-slate-600"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-xs font-black text-rose-500">{index + 1}</span>{item}</div>)}
                </div>
              </div>
              <div className="relative grid min-h-40 place-items-center overflow-hidden bg-slate-950 p-6 text-center text-white">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-600/30 to-violet-600/30" />
                <div className="relative"><NetworkIcon className="mx-auto h-10 w-10 text-blue-300" /><b className="mt-3 block font-display">UniNet нэгдсэн урсгал</b><span className="mt-1 block text-xs text-slate-300">Нэг хүсэлт · нэг төлөв · нэг аудит</span></div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-blue-50 p-7 md:p-10">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-500" />Нэгдсэн экосистем</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {["Нэг аюулгүй платформ", "Хайлттай боломжууд", "Онлайн бүртгэл", "Хүсэлтийн явц хянах", "Мэдэгдэл, сануулга"].map(item => <div key={item} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white/80 p-3 text-sm font-bold text-slate-800 shadow-sm"><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white">✓</span>{item}</div>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
 
      {/* ============ SOLUTION STEPS ============ */}
      <section className="py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 reveal">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3.5 py-1.5 rounded-full mb-4">Хэрхэн ажилладаг вэ</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl">Дөрвөн энгийн алхамаар холбогдоно</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            <div className="hidden lg:block absolute top-6 left-[12%] right-[12%] h-px bg-gradient-to-r from-blue-200 via-violet-200 to-rose-200" />
            {[
              { icon: Building2, t: "Ажлын орчин үүсгэнэ", d: "Их сургууль өөрийн аюулгүй, тусгаарлагдсан орчинтой болно." },
              { icon: Wand2, t: "Контент бүтээнэ", d: "Ажилтнууд арга хэмжээ, ажлын байр, дадлага, судалгаа нийтэлнэ." },
              { icon: Shield, t: "Зөвшөөрөгдсөнөөр хуваалцана", d: "Батлагдсан контентыг сонгосон хамрах хүрээнд түгээнэ." },
              { icon: Radar, t: "Оюутан олж, бүртгүүлнэ", d: "Оюутнууд боломжуудыг олж, бүртгүүлж, өргөдөл гаргана." },
            ].map((s, i) => (
              <div key={i} className="reveal relative text-center" style={{ animationDelay: `${i*0.1}s` }}>
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-900 text-white flex items-center justify-center mb-5 ring-8 ring-white relative z-10 font-bold">{i + 1}</div>
                <h4 className="font-display font-bold text-sm mb-2">{s.t}</h4>
                <p className="text-sm text-slate-500 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
 
      {/* ============ VISIBILITY — interactive ============ */}
      <section className="py-20 md:py-24 bg-gradient-to-b from-blue-50/70 to-white">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 reveal">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-3.5 py-1.5 rounded-full mb-4">Хамгийн чухал онцлог</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-3">Хэн юуг харах вэ — та бүрэн хянана</h2>
            <p className="text-slate-500 max-w-xl mx-auto leading-relaxed">Дарж дэлгэрэнгүйг үзнэ үү.</p>
          </div>
          <div className="mb-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VISIBILITY.map((v, i) => {
              const t = toneMap[v.tone];
              const open = visOpen === v.id;
              return (
                <button key={v.id} type="button" onClick={() => setVisOpen(open ? null : v.id)} aria-pressed={open}
                  className={cx("card-effect reveal min-h-44 rounded-2xl border p-6 text-left transition-all duration-300", open ? "-translate-y-1 border-slate-300 bg-white shadow-xl" : "border-slate-200 bg-white hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg")}
                  style={{ animationDelay: `${i * 0.08}s` }}>
                  <span className={cx("mb-5 grid h-11 w-11 place-items-center rounded-xl transition-colors", open ? cx(t.bg, t.text) : "bg-slate-100 text-slate-500")}><v.icon className="h-5 w-5" /></span>
                  <h4 className="font-display text-base font-bold">{v.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{v.desc}</p>
                </button>
              );
            })}
          </div>
          {visOpen && (() => { const selected = VISIBILITY.find(item => item.id === visOpen); const t = toneMap[selected.tone]; return <div className={cx("mx-auto mb-14 max-w-3xl rounded-2xl border p-6 text-center transition-all", t.bg, t.text)}><b className="font-display">{selected.title}</b><p className="mt-2 text-sm font-medium leading-relaxed">{selected.detail}</p></div>; })()}

          <div className="card-effect mx-auto max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4"><span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Контент нийтлэх preview</span></div>
            <div className="p-6 md:p-8">
              <label className="block text-xs font-bold text-slate-500">Гарчиг<div className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">AI Hackathon 2026 — бүртгэл нээгдлээ</div></label>
              <div className="mt-6"><span className="text-xs font-bold text-slate-500">Харагдах байдал</span><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{VISIBILITY.map((v, i) => { const t=toneMap[v.tone]; const selected=visSelected===i; return <button key={v.id} type="button" onClick={() => setVisSelected(i)} className={cx("rounded-xl border px-3 py-3 text-xs font-bold transition-all", selected ? cx(t.bg,t.text,"border-current shadow-sm") : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")}>{v.title}</button>; })}</div></div>
              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600"><b>{VISIBILITY[visSelected].title}:</b> {VISIBILITY[visSelected].desc}</div>
              <button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700"><Send className="h-4 w-4" />Нийтлэх</button>
            </div>
          </div>
          <p className="text-center font-bold text-slate-800 max-w-lg mx-auto mt-8">
            Мэдээлэл анхнаасаа <span className="text-rose-600">private</span> байна. Зөвшөөрөгдсөн контент л сургуулиас гадагш нийтлэгдэнэ.
          </p>
        </div>
      </section>
 
      {/* ============ OPPORTUNITIES TABS ============ */}
      <section id="opportunities" className="scroll-mt-20 py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10 reveal">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-3.5 py-1.5 rounded-full mb-4">Боломжууд</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl">Их сургуулиудийн боломжийг нэг дороос</h2>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cx("px-4 py-2 rounded-full text-sm font-bold border transition-colors",
                  tab === t.id ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500 hover:border-slate-300")}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredOpps.map((o, i) => {
              const uni = displayUniversities[o.uni] || { code: "UN", solid: "bg-slate-700", bg: "bg-slate-100", text: "text-slate-600", full: "UniNet Network" };
              const visColor = o.vis === "Public" ? "bg-emerald-50 text-emerald-600" : o.vis === "Partners" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600";
              return (
                <div key={o.id || i} className="card-effect group bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className={cx("w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white", uni.solid)}>{uni.code.slice(0,2)}</span>
                      <span className="text-xs font-semibold text-slate-400">{uni.code}</span>
                    </div>
                  </div>
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 mb-3">{o.type}</span>
                  <h4 className="font-display font-bold text-base mb-2">{o.title}</h4>
                  <p className="text-sm text-slate-500 mb-4 leading-relaxed">{o.desc}</p>
                  <div className="text-xs text-slate-400 space-y-1.5 mb-4">
                    <div>{o.date}</div>
                    <div>{o.loc}</div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className={cx("text-[10px] font-bold px-2 py-1 rounded-full", visColor)}>{o.vis}</span>
                    <button type="button" onClick={() => openAuth("login")} className="text-xs font-bold text-blue-600">Нэвтэрч үзэх</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-12">
            <button type="button" onClick={() => openAuth("login")} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-slate-300 font-semibold hover:border-slate-400 transition-colors">
              Бүх боломжийг харах
            </button>
          </div>
        </div>
      </section>
 
      {/* ============ STUDENT / UNIVERSITY BENEFITS ============ */}
      {[
        { eyebrow: "Оюутанд зориулав", tone: "blue", title: "Оюутанд ямар ашигтай вэ?",
          items: ["Олон сургуулийн боломжийг нэг дороос олж мэдэх","Арга хэмжээнд онлайнаар бүртгүүлэх","Дадлага, ажлын байранд өргөдөл гаргах","CV-гээ байршуулж дахин ашиглах","Өргөдлийн явцыг хянах","Сануулга, мэдэгдэл хүлээн авах","Сонирхсон боломжуудаа хадгалах","QR тасалбараар бүртгүүлэх"],
          reverse: false },
        { eyebrow: "Их сургуульд зориулав", tone: "violet", title: "Их сургуульд ямар ашигтай вэ?",
          items: ["Аюулгүй, тусгаарлагдсан ажлын орчин","Контент хуваалцах бүрэн хяналт","Нийтлэлийн зөвшөөрлийн урсгал","Хамтрагч их сургуулийн удирдлага","Оюутны бүртгэлийн удирдлага","Өргөдлийн хяналт","Аналитик, тайлан","Бүрэн аудитын түүх"],
          reverse: true },
      ].map((sec, idx) => {
        const t = toneMap[sec.tone];
        const previewRows = idx === 0
          ? liveOpportunities.slice(0, 3).map((item, rowIndex) => [String(rowIndex + 1), item.type, item.title])
          : [
            [networkStats[2][0], "Нийтэлсэн боломж", "Контентын сан"],
            [networkStats[1][0], "Идэвхтэй оюутан", "UniNet хэрэглэгч"],
            [networkStats[0][0], "Идэвхтэй", "Их сургууль"],
          ];
        return (
          <section key={idx} className={cx("py-16 md:py-20", idx % 2 === 0 ? "bg-slate-50" : "bg-white")}>
            <div className="max-w-7xl mx-auto px-6 md:px-8">
              <div className={cx("grid lg:grid-cols-2 gap-14 items-center", sec.reverse && "lg:[&>*:first-child]:order-2")}>
                <div className="reveal">
                  <span className={cx("inline-block text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-5", t.bg, t.text)}>{sec.eyebrow}</span>
                  <h2 className="font-display font-bold text-2xl md:text-3xl mb-6">{sec.title}</h2>
                  <ul className="grid sm:grid-cols-2 gap-3">
                    {sec.items.map((it) => (
                      <li key={it} className="flex items-start gap-2.5 text-sm text-slate-600">
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="reveal">
                  <div className="card-effect bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-display font-bold text-sm">{idx === 0 ? "Миний бүртгэлүүд" : "Админ хяналтын самбар"}</span>
                      <span className={cx("text-[10px] font-bold px-2.5 py-1 rounded-full", t.bg, t.text)}>{idx === 0 ? `${liveOpportunities.length} боломж` : `${publicBootstrap.universities.length} сургууль`}</span>
                    </div>
                    {previewRows.map(([mark, meta, title], j) => (
                      <div key={j} className="card-effect flex items-center gap-3 p-3 rounded-xl border border-slate-100 mb-2.5 last:mb-0">
                        <span className={cx("w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", t.bg, t.text)}>{mark}</span>
                        <div><div className="text-[11px] text-slate-400">{meta}</div><div className="text-sm font-semibold">{title}</div></div>
                      </div>
                    ))}
                    {!previewRows.length && <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">Нийтлэгдсэн боломж алга байна.</div>}
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })}
 
      {/* ============ FEATURES GRID ============ */}
      <section className="py-20 md:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 reveal">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3.5 py-1.5 rounded-full mb-4">Боломжууд</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl">Платформын гол онцлогууд</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f, i) => (
              <div key={i} className="card-effect reveal bg-white rounded-2xl border border-slate-200 p-5" style={{ animationDelay: `${(i%6)*0.06}s` }}>
                <h4 className="font-display font-bold text-sm mb-1.5">{f.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
 
      {/* ============ ROLES ============ */}
      <section className="py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 reveal">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3.5 py-1.5 rounded-full mb-4">Хэн ашигладаг вэ</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl">Платформын дөрвөн үндсэн эрх</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ROLES.map((r, i) => {
              return (
                <div key={i} className="card-effect reveal text-center bg-white rounded-2xl border border-slate-200 p-7" style={{ animationDelay: `${i*0.08}s` }}>
                  <h4 className="font-display font-bold text-base mb-2">{r.title}</h4>
                  <p className="text-sm text-slate-500">{r.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
 
      {/* ============ JOURNEY ============ */}
      <section className="py-20 md:py-24 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <div className="text-center mb-14 reveal">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-3.5 py-1.5 rounded-full mb-4">Оюутны замнал</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl">Оюутнууд UniNet-ийг хэрхэн ашигладаг вэ</h2>
          </div>
          <div className="space-y-0">
            {JOURNEY.map((j, i) => (
              <div key={i} className="reveal flex gap-5 pb-9 relative" style={{ animationDelay: `${i*0.06}s` }}>
                {i !== JOURNEY.length - 1 && <div className="absolute left-[27px] top-14 bottom-0 w-px bg-slate-200" />}
                <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 font-display font-bold flex items-center justify-center shrink-0 relative z-10">{i+1}</div>
                <div className="pt-3.5">
                  <h4 className="font-display font-bold text-base mb-1">{j.title}</h4>
                  <p className="text-sm text-slate-500 leading-relaxed">{j.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
 
      {/* ============ SECURITY ============ */}
      <section id="about" className="scroll-mt-20 py-20 md:py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl blob-anim" />
        <div className="max-w-7xl mx-auto px-6 md:px-8 relative">
          <div className="text-center max-w-2xl mx-auto mb-14 reveal">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-300 bg-blue-500/15 px-3.5 py-1.5 rounded-full mb-4">Аюулгүй байдал</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl">Хамтын ажиллагаа нээлттэй, дотоод мэдээлэл хамгаалагдсан</h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <ul className="space-y-1">
              {[
                { t: "Их сургуулийн мэдээллийн тусгаарлалт", d: "Сургууль бүрийн дотоод мэдээлэл бусдад харагдахгүй." },
                { t: "Роль дээр суурилсан хандалт", d: "Хэрэглэгч бүр зөвхөн өөрт зөвшөөрөгдсөнийг харна." },
                { t: "Нийтлэлийн зөвшөөрөл", d: "Гадагш гарах контент батлагдсаны дараа л түгээгдэнэ." },
                { t: "Зөвшөөрөлд суурилсан мэдээлэл хуваалцалт", d: "Оюутны мэдээллийг зөвхөн зөвшөөрснөөр хуваалцана." },
                { t: "Аудит бүртгэл", d: "Бүх үйлдлийн түүхийг бүрэн хадгална." },
              ].map((s, i) => (
                <li key={i} className="reveal flex gap-4 py-4 border-b border-white/10" style={{ animationDelay: `${i*0.07}s` }}>
                  <div><h5 className="font-display font-bold text-sm mb-0.5">{s.t}</h5><p className="text-xs text-slate-400 leading-relaxed">{s.d}</p></div>
                </li>
              ))}
            </ul>
            <div className="card-effect reveal bg-white/5 border border-white/10 rounded-2xl p-8">
              <div className="grid grid-cols-5 gap-2 mb-4">
                {displayUniversities.map(u => (
                  <div key={u.code} className="bg-white/5 border border-white/10 rounded-lg py-2.5 text-center text-[9px] font-bold text-slate-300">{u.code}</div>
                ))}
              </div>
              <div className="text-center text-[11px] font-bold text-blue-300 tracking-widest my-3">— ЗӨВШӨӨРЛИЙН ХАШЛАГА —</div>
              <div className="flex items-center justify-center gap-2 bg-blue-500/10 border border-blue-400/30 rounded-xl py-4 text-blue-200 font-bold text-sm">
                UniNet тусгаарлагдсан сүлжээ
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="bg-slate-900 text-slate-400 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10 mb-12">
            <div className="lg:col-span-1 sm:col-span-2">
              <div className="flex items-center gap-2 text-white font-display font-bold text-lg mb-3">
                UniNet
              </div>
              <p className="text-sm max-w-xs">Монголын их сургуулиудын хамтын ажиллагааны аюулгүй платформ.</p>
            </div>
            <div><h5 className="font-display mb-4 text-xs font-bold uppercase tracking-wide text-white">Түгээмэл асуулт</h5><ul className="space-y-2.5 text-sm"><li>Сургуулийн имэйлээр хэрхэн бүртгүүлэх вэ?</li><li>Private ба Network ямар ялгаатай вэ?</li><li>Өргөдлийн явцаа хаанаас харах вэ?</li></ul></div>
            <div><h5 className="font-display mb-4 text-xs font-bold uppercase tracking-wide text-white">Тусламж ба аюулгүй байдал</h5><ul className="space-y-2.5 text-sm"><li>Тусламжийн төв</li><li>Нууцлал ба зөвшөөрөл</li><li>Системийн төлөв</li><li>support@uninet.mn</li></ul></div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs">© {new Date().getFullYear()} UniNet. Монголын их сургуулиудын хамтын ажиллагааны платформ.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
