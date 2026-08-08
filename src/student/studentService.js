import { apiRequest as request } from "../api/apiClient.js";

function unwrap(payload, key) {
  return payload?.[key] ?? payload?.data?.[key] ?? payload?.data ?? payload;
}

function normalizeBootstrap(payload) {
  const result = unwrap(payload, "bootstrap") || {};
  return {
    studentProfile: result.studentProfile || {},
    universities: Array.isArray(result.universities) ? result.universities : [],
    contentItems: Array.isArray(result.contentItems) ? result.contentItems : [],
    registrations: Array.isArray(result.registrations) ? result.registrations : [],
    applications: Array.isArray(result.applications) ? result.applications : [],
    notifications: Array.isArray(result.notifications) ? result.notifications : [],
    consentHistory: Array.isArray(result.consentHistory) ? result.consentHistory : [],
    completedSurveyCount: Number(result.completedSurveyCount) || 0,
  };
}

export const studentService = {
  async getBootstrap() {
    const payload = await request("/student/bootstrap");
    return normalizeBootstrap(payload);
  },

  async saveContent(contentId) {
    const payload = await request(`/student/content/${encodeURIComponent(contentId)}/save`, {
      method: "POST",
    });
    return unwrap(payload, "savedContent") || { contentId, isSaved: true };
  },

  async unsaveContent(contentId) {
    const payload = await request(`/student/content/${encodeURIComponent(contentId)}/save`, {
      method: "DELETE",
    });
    return unwrap(payload, "savedContent") || { contentId, isSaved: false };
  },

  async registerEvent(eventId) {
    const payload = await request(`/student/events/${encodeURIComponent(eventId)}/registration`, {
      method: "POST",
      body: JSON.stringify({ consentGranted: true }),
    });
    return unwrap(payload, "registration");
  },

  async createEventCheckout(eventId) {
    return request(`/student/events/${encodeURIComponent(eventId)}/checkout`, {
      method: "POST",
      body: JSON.stringify({ consentGranted: true }),
    });
  },

  async getEventPayment(eventId) {
    return request(`/student/events/${encodeURIComponent(eventId)}/payment`);
  },

  async cancelRegistration(eventId) {
    const payload = await request(`/student/events/${encodeURIComponent(eventId)}/registration`, {
      method: "DELETE",
    });
    return unwrap(payload, "registration") || { eventId, status: "CANCELLED" };
  },

  async getEventTicket(eventId) {
    const payload = await request(`/student/events/${encodeURIComponent(eventId)}/ticket`);
    return unwrap(payload, "ticket");
  },

  async uploadCv(file) {
    const body = new FormData();
    body.append("file", file);
    const payload = await request("/files/student/cv", { method: "POST", body, timeoutMs: 30000 });
    return unwrap(payload, "file");
  },

  async uploadAvatar(file) {
    const body = new FormData();
    body.append("file", file);
    const payload = await request("/files/student/avatar", { method: "POST", body, timeoutMs: 30000 });
    return unwrap(payload, "file");
  },

  async downloadFile(fileId) {
    const response = await request(`/files/${encodeURIComponent(fileId)}/download`, { responseType: "response", timeoutMs: 30000 });
    return response.blob();
  },

  async submitApplication(opportunityId, application = {}) {
    const payload = await request(`/student/opportunities/${encodeURIComponent(opportunityId)}/application`, {
      method: "POST",
      body: JSON.stringify(application),
    });
    return unwrap(payload, "application");
  },

  async withdrawApplication(opportunityId) {
    const payload = await request(`/student/opportunities/${encodeURIComponent(opportunityId)}/application`, {
      method: "DELETE",
    });
    return unwrap(payload, "application") || { opportunityId, status: "WITHDRAWN" };
  },

  async markNotificationRead(notificationId) {
    const payload = await request(`/student/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "PATCH",
    });
    return unwrap(payload, "notification");
  },

  async markAllNotificationsRead() {
    const payload = await request("/student/notifications/read-all", { method: "PATCH" });
    return unwrap(payload, "notifications");
  },

  async submitSurvey(surveyId, answers) {
    const payload = await request(`/surveys/${encodeURIComponent(surveyId)}/responses`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
    return unwrap(payload, "response");
  },
};
