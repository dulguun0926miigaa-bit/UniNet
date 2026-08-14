/**
 * @typedef {Object} UserSettings
 * @property {Object} account
 * @property {Object} security
 * @property {Object} notifications
 * @property {Object} privacy
 * @property {Object} appearance
 * @property {Object} locale
 * @property {Object} accessibility
 * @property {Array<Object>} devices
 * @property {Array<Object>} consentHistory
 */
import { apiRequest as request } from "../api/apiClient.js";

const unwrap = payload => payload?.data ?? payload;

export const settingsService = {
  async get() {
    const payload = unwrap(await request("/settings"));
    const settings = payload?.settings ?? payload;
    if (!settings?.account || !settings?.security) throw new Error("Backend тохиргооны бүрэн өгөгдөл буцаасангүй.");
    return settings;
  },

  async save(section, value, stepUpToken = "") {
    if (!section || value == null) throw new Error("Хадгалах тохиргоо дутуу байна.");
    return unwrap(await request("/settings", {
      method: "PATCH",
      headers: stepUpToken ? { "x-step-up-token": stepUpToken } : undefined,
      body: JSON.stringify({ section, value }),
    }));
  },

  async sendFeedback(feedback) {
    return unwrap(await request("/settings/feedback", {
      method: "POST",
      body: JSON.stringify({
        category: feedback.type,
        subject: feedback.title,
        message: feedback.details,
      }),
    }));
  },

  async download(kind, stepUpToken) {
    const apiKind = ({ registrations: "registration-history", applications: "application-history" })[kind] || kind;
    const response = await request(`/settings/export/${encodeURIComponent(apiKind)}`, { responseType: "response", headers: { "x-step-up-token": stepUpToken } });
    const disposition = response.headers.get("content-disposition") || "";
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;
    const filename = encodedName
      ? decodeURIComponent(encodedName)
      : plainName || payload?.filename || `uninet-${kind}-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = payload
      ? new Blob([JSON.stringify(payload.data ?? payload, null, 2)], { type: "application/json;charset=utf-8" })
      : await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return { ok: true, filename };
  },

  async logoutDevice(deviceId, stepUpToken) {
    if (!deviceId) throw new Error("Төхөөрөмжийн ID дутуу байна.");
    return unwrap(await request(`/settings/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE", headers: { "x-step-up-token": stepUpToken } }));
  },

  async logoutAllDevices(stepUpToken) {
    return unwrap(await request("/settings/devices", { method: "DELETE", headers: { "x-step-up-token": stepUpToken } }));
  },

  async deactivateAccount(stepUpToken) {
    return unwrap(await request("/settings/account/deactivate", { method: "POST", headers: { "x-step-up-token": stepUpToken } }));
  },

  async requestAccountDeletion(reason, stepUpToken) {
    return unwrap(await request("/settings/account/delete-request", {
      method: "POST",
      headers: { "x-step-up-token": stepUpToken },
      body: JSON.stringify({ reason }),
    }));
  },
};
