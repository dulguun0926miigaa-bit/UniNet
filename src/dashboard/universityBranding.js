import { API_URL } from "../api/apiClient.js";

export function normalizeUniversityName(value) {
  if (typeof value === "string") return value.trim();
  return value?.shortName || value?.name || value?.code || "UniNet";
}

export function resolveUniversityLogoUrl(value) {
  const logoUrl = typeof value === "string" ? null : value?.logoUrl;
  if (!logoUrl) return null;
  if (/^(?:https?:|blob:|data:)/i.test(logoUrl)) return logoUrl;
  const base = API_URL.startsWith("http")
    ? API_URL.replace(/\/api\/?$/, "")
    : globalThis.location?.origin || "http://localhost";
  return new URL(logoUrl, `${base}/`).toString();
}
