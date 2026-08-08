import { AlertTriangle, Ban, Home, RefreshCw, SearchX } from "lucide-react";
import { mongolianErrorMessage } from "./errorMessages.js";

const COPY = {
  403: { eyebrow: "403 · Эрх хүрэлцэхгүй", title: "Энэ хэсэгт хандах эрхгүй байна", icon: Ban, tone: "amber" },
  404: { eyebrow: "404 · Олдсонгүй", title: "Хүссэн мэдээлэл олдсонгүй", icon: SearchX, tone: "blue" },
  500: { eyebrow: "500 · Серверийн алдаа", title: "Систем түр хугацаанд хариу өгч чадсангүй", icon: AlertTriangle, tone: "rose" },
};
const tones = {
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function HttpErrorState({ status = 500, error, onRetry, onHome, compact = false }) {
  const copy = COPY[status] || COPY[500];
  const Icon = copy.icon;
  return (
    <section role="alert" aria-live="assertive" className={`grid place-items-center rounded-3xl border bg-white px-6 text-center shadow-sm ${compact ? "min-h-80 py-10" : "min-h-[65vh] py-16"}`}>
      <div className="max-w-lg">
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl border ${tones[copy.tone]}`}><Icon className="h-7 w-7" aria-hidden="true" /></span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{copy.eyebrow}</p>
        <h1 className="font-display mt-3 text-2xl font-bold text-slate-900 md:text-3xl">{copy.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{mongolianErrorMessage(error, "Түр хүлээгээд дахин оролдоно уу.")}</p>
        {error?.requestId && <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-400">Request ID: {error.requestId}</p>}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" />Дахин оролдох</button>}
          {onHome && <button type="button" onClick={onHome} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700"><Home className="h-4 w-4" />Нүүр хуудас</button>}
        </div>
      </div>
    </section>
  );
}
