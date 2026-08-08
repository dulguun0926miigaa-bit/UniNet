import { Building2, Globe2 } from "lucide-react";
import { useMemo, useState } from "react";

const UNIVERSITY_LOGOS = {
  "МУИС": "https://www.bing.com/th/id/OIP.YQdlrWwhh2IqlF113U5UDgHaHa?w=193&h=193&c=8&rs=1&qlt=90&r=0&o=6&dpr=1.3&pid=ImgAns&rm=2",
  "ШУТИС": "https://th.bing.com/th/id/OIP.Ga6nWon6jcnQlXtNqJfaVwHaHd?w=186&h=187&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3",
  "МУБИС": "https://th.bing.com/th/id/OIP.d5Ql-5mt0SNkTcWSsQhdFQHaHZ?w=168&h=180&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3",
  "АШУҮИС": "https://th.bing.com/th/id/OIP.PuYtuDQQluKwhyu0OkNlfwHaHa?w=157&h=180&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3",
  "ХААИС": "https://th.bing.com/th/id/OIP.LCAg2sFBpR2F4Ylr6u9hqAHaHa?w=165&h=180&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3",
};

function normalizeUniversityName(value) {
  if (typeof value === "string") return value.trim();
  return value?.shortName || value?.name || value?.code || "UniNet";
}

function logoKey(value) {
  const name = normalizeUniversityName(value).toUpperCase();
  return Object.keys(UNIVERSITY_LOGOS).find(key => name.includes(key)) || null;
}

export default function UniversityLogo({ university, className = "inline-grid h-12 w-12" }) {
  const [failed, setFailed] = useState(false);
  const normalizedName = normalizeUniversityName(university);
  const key = useMemo(() => logoKey(normalizedName), [normalizedName]);
  const src = key ? UNIVERSITY_LOGOS[key] : null;
  const Icon = normalizedName === "UniNet" ? Globe2 : Building2;

  return (
    <span
      className={`shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm ring-1 ring-slate-100 ${className}`}
      aria-label={`${normalizedName} лого`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`${normalizedName} лого`}
          referrerPolicy="no-referrer"
          loading="eager"
          onError={() => setFailed(true)}
          className="h-full w-full rounded-xl object-contain"
        />
      ) : (
        <Icon aria-hidden="true" className="h-6 w-6 text-slate-500" strokeWidth={1.8} />
      )}
    </span>
  );
}

export { UNIVERSITY_LOGOS, normalizeUniversityName };
