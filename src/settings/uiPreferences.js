const storageKey = "uninet-ui-preferences";

export const defaultUiPreferences = {
  appearance: { theme: "system", density: "comfortable", reducedMotion: false },
  locale: { language: "Монгол", timezone: "Asia/Ulaanbaatar", dateFormat: "YYYY.MM.DD", hourFormat: "24" },
  accessibility: { fontSize: "normal", highContrast: false, reducedMotion: false, focusIndicator: true, underlineLinks: false },
};

let activePreferences = structuredClone(defaultUiPreferences);
let mediaListenerInstalled = false;

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function normalizeUiPreferences(value = {}) {
  return {
    appearance: { ...defaultUiPreferences.appearance, ...objectValue(value.appearance) },
    locale: { ...defaultUiPreferences.locale, ...objectValue(value.locale), language: "Монгол" },
    accessibility: { ...defaultUiPreferences.accessibility, ...objectValue(value.accessibility) },
  };
}

export function readUiPreferences() {
  try {
    return normalizeUiPreferences(JSON.parse(window.localStorage.getItem(storageKey) || "{}"));
  } catch {
    return normalizeUiPreferences();
  }
}

function resolvedTheme(preference) {
  if (preference === "dark" || preference === "light") return preference;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyUiPreferences(value, { persist = false, announce = true } = {}) {
  if (typeof document === "undefined") return normalizeUiPreferences(value);
  activePreferences = normalizeUiPreferences(value);
  const root = document.documentElement;
  const theme = resolvedTheme(activePreferences.appearance.theme);
  root.dataset.theme = theme;
  root.dataset.themePreference = activePreferences.appearance.theme;
  root.dataset.density = activePreferences.appearance.density;
  root.dataset.fontSize = activePreferences.accessibility.fontSize;
  root.dataset.highContrast = String(Boolean(activePreferences.accessibility.highContrast));
  root.dataset.underlineLinks = String(Boolean(activePreferences.accessibility.underlineLinks));
  root.dataset.focusIndicator = String(activePreferences.accessibility.focusIndicator !== false);
  root.dataset.reducedMotion = String(Boolean(activePreferences.appearance.reducedMotion || activePreferences.accessibility.reducedMotion));
  root.lang = "mn";
  root.style.colorScheme = theme;
  if (persist) window.localStorage.setItem(storageKey, JSON.stringify(activePreferences));
  if (announce) window.dispatchEvent(new CustomEvent("uninet:preferences-changed", { detail: activePreferences }));
  return activePreferences;
}

export function initializeUiPreferences() {
  if (typeof window === "undefined") return;
  applyUiPreferences(readUiPreferences(), { announce: false });
  if (!mediaListenerInstalled && window.matchMedia) {
    mediaListenerInstalled = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (activePreferences.appearance.theme === "system") applyUiPreferences(activePreferences, { announce: true });
    });
  }
}

function formatterLocale() {
  return "mn-MN";
}

function dateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: activePreferences.locale.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function formatDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (!options.dateStyle && activePreferences.locale.dateFormat === "YYYY.MM.DD") {
    const parts = dateParts(date);
    return `${parts.year}.${parts.month}.${parts.day}`;
  }
  if (!options.dateStyle && activePreferences.locale.dateFormat === "DD/MM/YYYY") {
    const parts = dateParts(date);
    return `${parts.day}/${parts.month}/${parts.year}`;
  }
  return new Intl.DateTimeFormat(formatterLocale(), {
    timeZone: activePreferences.locale.timezone,
    dateStyle: options.dateStyle || "medium",
  }).format(date);
}

export function formatDateTime(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(formatterLocale(), {
    timeZone: activePreferences.locale.timezone,
    dateStyle: options.dateStyle || "medium",
    timeStyle: options.timeStyle || "short",
    hour12: activePreferences.locale.hourFormat === "12",
  }).format(date);
}

export function toIsoFromLocalDateTime(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const wallClockUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let instant = wallClockUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: activePreferences.locale.timezone,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const representedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    instant = wallClockUtc - (representedUtc - instant);
  }
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: activePreferences.locale.timezone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
