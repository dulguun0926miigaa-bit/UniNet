import { API_URL, apiRequest as request, createIdempotencyKey } from "../api/apiClient.js";

export const staffRoutes = [
  ["Нүүр", "/staff"], ["Контент", "/staff/content"],
  ["Судалгаа ба асуулга", "/staff/forms"],
  ["Ноорог", "/staff/drafts"], ["Батлуулахаар илгээсэн", "/staff/approvals"], ["Нийтлэгдсэн", "/staff/published"],
  ["Бүртгэлүүд", "/staff/registrations"], ["Өргөдлүүд", "/staff/applications"],
  ["Тайлан ба аналитик", "/staff/reports"],
].map(([label, path]) => ({ label, path }));

export const adminRoutes = [
  ["Нүүр", "/admin"], ["Баталгаажуулалт", "/admin/approvals"], ["Контент", "/admin/content"], ["Хэрэглэгчид", "/admin/users"],
  ["Ажилтнууд", "/admin/staff"], ["Оюутнууд", "/admin/students"], ["Role ба эрх", "/admin/roles"], ["Түншлэл", "/admin/partnerships"],
  ["Бүртгэлүүд", "/admin/registrations"], ["Өргөдлүүд", "/admin/applications"],
  ["Тайлан ба аналитик", "/admin/reports"], ["Audit Log", "/admin/audit-logs"], ["Сургуулийн профайл", "/admin/university-profile"],
].map(([label, path]) => ({ label, path }));

export const platformRoutes = [
  ["Network Dashboard", "/platform"], ["Их сургуулиуд", "/platform/universities"], ["Шинэ сургууль нэмэх", "/platform/universities/create"],
  ["University Admin-ууд", "/platform/admins"], ["Нийт хэрэглэгчид", "/platform/users"], ["Түншлэлийн сүлжээ", "/platform/partnerships"],
  ["Global Analytics", "/platform/analytics"], ["Audit Logs", "/platform/audit-logs"], ["System Monitoring", "/platform/monitoring"],
].map(([label, path]) => ({ label, path }));

const unwrap = payload => payload?.data ?? payload;
const apiOrigin = API_URL.replace(/\/api\/?$/, "");

export function resolveApiAssetUrl(value) {
  if (!value) return "";
  try { return new URL(value, `${apiOrigin}/`).toString(); }
  catch { return value; }
}

async function withTransientRetry(action, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await action(); }
    catch (error) {
      lastError = error;
      if (!["NETWORK_ERROR", "REQUEST_TIMEOUT"].includes(error?.code) || attempt === attempts - 1) throw error;
      await new Promise(resolve => window.setTimeout(resolve, 450 * (attempt + 1)));
    }
  }
  throw lastError;
}

export const operationsService = {
  async bootstrap() {
    const payload = unwrap(await withTransientRetry(() => request("/operations/bootstrap"), 3));
    if (!payload || typeof payload !== "object") throw new Error("Backend буруу өгөгдөл буцаалаа.");
    return payload;
  },
  async mutate(action) {
    const body = typeof action === "object" ? action : { action };
    return unwrap(await request("/operations/action", { method: "POST", body: JSON.stringify(body) }));
  },
  async createContent(content) {
    return unwrap(await request("/operations/content", { method: "POST", body: JSON.stringify(content) }));
  },
  async getContent(id) {
    const payload = unwrap(await request(`/operations/content/${encodeURIComponent(id)}`));
    return payload.content;
  },
  async updateContent(id, content) {
    const payload = unwrap(await request(`/operations/content/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(content),
    }));
    return payload.content;
  },
  async deleteContent(id) {
    return request(`/operations/content/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async listManagedSurveys({ page = 1, pageSize = 20, search, status, visibility, sortBy = "updatedAt", sortOrder = "desc" } = {}) {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortOrder,
    });
    if (search) query.set("search", search);
    if (status && status !== "ALL") query.set("status", status);
    if (visibility && visibility !== "ALL") query.set("visibility", visibility);
    return unwrap(await request(`/surveys/manage?${query}`));
  },
  async createSurvey(survey) {
    return unwrap(await request("/surveys", { method: "POST", body: JSON.stringify(survey) }));
  },
  async updateSurvey(id, survey) {
    return unwrap(await request(`/surveys/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(survey) }));
  },
  async updateSurveyStatus(id, status) {
    return unwrap(await request(`/surveys/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }));
  },
  async deleteSurvey(id) {
    return request(`/surveys/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async getSurveyReport(id, { page = 1, pageSize = 20 } = {}) {
    return unwrap(await request(`/surveys/${encodeURIComponent(id)}/report?page=${page}&pageSize=${pageSize}`));
  },
  async downloadSurveyResponses(id, filename = `survey-${id}.csv`) {
    const response = await request(`/surveys/${encodeURIComponent(id)}/responses.csv`, { responseType: "response" });
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  },
  async updateContentStatus(id, status, metadata = {}) {
    return unwrap(await request(`/operations/content/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, ...metadata }),
    }));
  },
  async markNotificationRead(id) {
    return unwrap(await request(`/operations/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }));
  },
  async markAllNotificationsRead() {
    return unwrap(await request("/operations/notifications/read-all", { method: "PATCH" }));
  },
  async createUniversity(university) {
    return unwrap(await request("/operations/universities", {
      method: "POST",
      body: JSON.stringify(university),
    }));
  },
  async updateUniversityStatus(id, status) {
    return unwrap(await request(`/universities/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ status }),
    }));
  },
  async getUniversity(id) {
    return unwrap(await request(`/universities/${encodeURIComponent(id)}`));
  },
  async updateUniversity(id, profile) {
    return unwrap(await request(`/universities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(profile) }));
  },
  async getOwnUniversityProfile() {
    return unwrap(await withTransientRetry(() => request("/universities/me/profile")));
  },
  async updateOwnUniversityProfile(profile) {
    return unwrap(await withTransientRetry(() => request("/universities/me/profile", { method: "PATCH", body: JSON.stringify(profile) })));
  },
  async uploadUniversityLogo(file) {
    const form = new FormData();
    form.append("file", file);
    return unwrap(await request("/files/university/logo", { method: "POST", body: form, timeoutMs: 45_000 }));
  },
  async addUniversityDomain(universityId, domain, isPrimary = false) {
    return unwrap(await request(`/universities/${encodeURIComponent(universityId)}/domains`, {
      method: "POST",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ domain, isPrimary }),
    }));
  },
  async requestDomainVerification(universityId, domainId, method = "ADMIN_APPROVAL", evidence = "") {
    return unwrap(await request(`/universities/${encodeURIComponent(universityId)}/domains/${encodeURIComponent(domainId)}/verification/request`, {
      method: "POST",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ method, ...(evidence ? { evidence } : {}) }),
    }));
  },
  async verifyUniversityDomain(universityId, domainId, evidence) {
    return unwrap(await request(`/universities/${encodeURIComponent(universityId)}/domains/${encodeURIComponent(domainId)}/verification/verify`, {
      method: "POST",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ evidence }),
    }));
  },
  async makePrimaryUniversityDomain(universityId, domainId) {
    return unwrap(await request(`/universities/${encodeURIComponent(universityId)}/domains/${encodeURIComponent(domainId)}/primary`, {
      method: "PATCH",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({}),
    }));
  },
  async revokeUniversityDomain(universityId, domainId, reason) {
    return unwrap(await request(`/universities/${encodeURIComponent(universityId)}/domains/${encodeURIComponent(domainId)}`, {
      method: "DELETE",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ reason }),
    }));
  },

  async listRegistrations({ page = 1, pageSize = 20, search, status, eventId, sortBy = "createdAt", sortOrder = "desc" } = {}) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, sortOrder });
    if (search) query.set("search", search);
    if (status && status !== "ALL") query.set("status", status);
    if (eventId && eventId !== "ALL") query.set("eventId", eventId);
    return unwrap(await request(`/operations/registrations?${query}`));
  },
  async markRegistrationAttended(id) {
    return unwrap(await request(`/operations/registrations/${encodeURIComponent(id)}/attendance`, {
      method: "PATCH",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ attended: true }),
    }));
  },
  async listApplications({ page = 1, pageSize = 20, search, status, contentId, sortBy = "submittedAt", sortOrder = "desc" } = {}) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, sortOrder });
    if (search) query.set("search", search);
    if (status && status !== "ALL") query.set("status", status);
    if (contentId && contentId !== "ALL") query.set("contentId", contentId);
    return unwrap(await request(`/operations/applications?${query}`));
  },
  async getApplication(id) {
    const payload = unwrap(await request(`/operations/applications/${encodeURIComponent(id)}`));
    return payload.application;
  },
  async updateApplicationStatus(id, status, reason = "") {
    const payload = unwrap(await request(`/operations/applications/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
    }));
    return payload.application;
  },
  async downloadApplicationCv(cv) {
    if (!cv?.downloadUrl) throw new Error("CV файл олдсонгүй.");
    if (!cv.assetId) { window.open(cv.downloadUrl, "_blank", "noopener,noreferrer"); return; }
    const response = await request(cv.downloadUrl.replace(/^\/api/, ""), { responseType: "response" });
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = cv.fileName || "student-cv";
    anchor.click();
    URL.revokeObjectURL(url);
  },
  async scanAttendance(eventId, ticket) {
    const payload = unwrap(await request(`/operations/events/${encodeURIComponent(eventId)}/attendance/scan`, {
      method: "POST",
      body: JSON.stringify({ ticket }),
    }));
    return payload.attendance;
  },
};
