import { Building2, Globe2 } from "lucide-react";
import { useState } from "react";
import { normalizeUniversityName, resolveUniversityLogoUrl } from "./universityBranding.js";

export default function UniversityLogo({ university, className = "inline-grid h-12 w-12" }) {
  const [failedSource, setFailedSource] = useState(null);
  const normalizedName = normalizeUniversityName(university);
  const src = resolveUniversityLogoUrl(university);
  const Icon = normalizedName === "UniNet" ? Globe2 : Building2;

  return (
    <span
      className={`shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm ring-1 ring-slate-100 ${className}`}
      aria-label={`${normalizedName} лого`}
      style={university?.primaryColor ? { borderColor: university.primaryColor } : undefined}
    >
      {src && failedSource !== src ? (
        <img
          src={src}
          alt={`${normalizedName} лого`}
          loading="eager"
          onError={() => setFailedSource(src)}
          className="h-full w-full rounded-xl object-contain"
        />
      ) : (
        <Icon aria-hidden="true" className="h-6 w-6 text-slate-500" strokeWidth={1.8} />
      )}
    </span>
  );
}
