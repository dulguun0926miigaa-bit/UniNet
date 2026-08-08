import {
  apiRequest,
  restoreAccessSession,
  setAccessToken,
  setSessionExpiredHandler,
  API_URL,
} from "../api/apiClient.js";

const permissionFields = {
  canCreateContent: "CREATE_CONTENT",
  canPublish: "PUBLISH_CONTENT",
  canManageRegistrations: "MANAGE_REGISTRATIONS",
  canManageApplications: "MANAGE_APPLICATIONS",
  canManageSurveys: "MANAGE_SURVEYS",
  canViewReports: "VIEW_REPORTS",
};

let currentSession = null;

const normalizeUser = (user) => {
  const derivedPermissions = Object.entries(permissionFields)
    .filter(([field]) => Boolean(user.staffProfile?.[field]))
    .map(([, permission]) => permission);
  return {
    ...user,
    permissions: [...new Set([...(user.permissions || []), ...derivedPermissions])],
    firstName: user.firstName || user.studentProfile?.firstName || user.staffProfile?.firstName || "",
    lastName: user.lastName || user.studentProfile?.lastName || user.staffProfile?.lastName || "",
    name: user.name || [user.firstName || user.studentProfile?.firstName || user.staffProfile?.firstName, user.lastName || user.studentProfile?.lastName || user.staffProfile?.lastName].filter(Boolean).join(" "),
    school: user.university?.shortName || user.university?.name || "UniNet",
    university: user.university?.shortName || user.university?.name || "UniNet",
  };
};

function notifySessionExpired() {
  currentSession = null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("uninet:session-expired"));
}

setSessionExpiredHandler(notifySessionExpired);


export const roleHome = {
  STUDENT: "/student",
  STAFF: "/staff",
  UNIVERSITY_ADMIN: "/admin",
  PLATFORM_SUPER_ADMIN: "/platform",
};

export const authService = {
  startGoogleOAuth(intent = "login", rememberMe = false) {
    const params = new URLSearchParams({ intent, rememberMe: String(Boolean(rememberMe)) });
    window.location.assign(`${API_URL}/auth/google/start?${params.toString()}`);
  },
  async getGoogleOnboarding() {
    return apiRequest("/auth/google/onboarding", { auth: false });
  },
  async completeGoogleOnboarding(data) {
    const result = await apiRequest("/auth/google/complete", {
      method: "POST", auth: false, body: JSON.stringify(data),
    });
    const account = normalizeUser(result.user);
    if (result.accessToken) this.saveSession(account, result);
    return { account, ...result };
  },
  async unlinkGoogle(currentPassword) {
    const result = await apiRequest("/auth/google/unlink", {
      method: "POST",
      body: JSON.stringify({ currentPassword }),
    });
    this.clearSession();
    return result;
  },
  async login(email, password, rememberMe = false) {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password, rememberMe }),
    });
    const account = normalizeUser(result.user);
    if (result.accessToken) this.saveSession(account, result);
    return { account, ...result };
  },
  async verifyMfaLogin(challengeToken, code) {
    const result = await apiRequest("/auth/mfa/login/verify", { method: "POST", auth: false, body: JSON.stringify({ challengeToken, code }) });
    const account = normalizeUser(result.user);
    this.saveSession(account, result);
    return { account, ...result };
  },
  async verifyOAuthMfa(code) {
    const result = await apiRequest("/auth/mfa/oauth/verify", { method: "POST", auth: false, body: JSON.stringify({ code }) });
    const account = normalizeUser(result.user);
    this.saveSession(account, result);
    return { account, ...result };
  },
  async startOAuthMfaBootstrap() { return apiRequest("/auth/mfa/oauth/bootstrap/start", { method: "POST", auth: false }); },
  async confirmOAuthMfaBootstrap(setupToken, code) {
    const result = await apiRequest("/auth/mfa/oauth/bootstrap/confirm", { method: "POST", auth: false, body: JSON.stringify({ setupToken, code }) });
    const account = normalizeUser(result.user); this.saveSession(account, result); return { account, ...result };
  },
  async startMfaBootstrap(enrollmentToken) {
    return apiRequest("/auth/mfa/bootstrap/start", { method: "POST", auth: false, body: JSON.stringify({ enrollmentToken }) });
  },
  async confirmMfaBootstrap(enrollmentToken, setupToken, code) {
    const result = await apiRequest("/auth/mfa/bootstrap/confirm", { method: "POST", auth: false, body: JSON.stringify({ enrollmentToken, setupToken, code }) });
    const account = normalizeUser(result.user);
    this.saveSession(account, result);
    return { account, ...result };
  },
  async getMfaStatus() { return apiRequest("/auth/mfa/status"); },
  async startMfaEnrollment(currentPassword) { return apiRequest("/auth/mfa/enroll/start", { method: "POST", body: JSON.stringify({ currentPassword }) }); },
  async confirmMfaEnrollment(setupToken, code) { return apiRequest("/auth/mfa/enroll/confirm", { method: "POST", body: JSON.stringify({ setupToken, code }) }); },
  async regenerateMfaRecoveryCodes(currentPassword, code) { return apiRequest("/auth/mfa/recovery-codes/regenerate", { method: "POST", body: JSON.stringify({ currentPassword, code }) }); },
  async disableMfa(currentPassword, code) { return apiRequest("/auth/mfa", { method: "DELETE", body: JSON.stringify({ currentPassword, code }) }); },
  async createStepUp(currentPassword, code = "") { return apiRequest("/auth/step-up", { method: "POST", body: JSON.stringify({ currentPassword, code: code || undefined }) }); },
  async requestEmailChange(newEmail, stepUpToken) { return apiRequest("/auth/email-change/request", { method: "POST", headers: { "x-step-up-token": stepUpToken }, body: JSON.stringify({ newEmail }) }); },
  async confirmEmailChange(token) { return apiRequest("/auth/email-change/confirm", { method: "POST", auth: false, body: JSON.stringify({ token }) }); },
  async register(data) {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      auth: false,
      body: JSON.stringify(data),
    });
    const account = normalizeUser(result.user);
    if (result.accessToken) this.saveSession(account, result);
    return { account, ...result };
  },
  async verifyEmail(email, code) {
    const result = await apiRequest("/auth/verify-email", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, code }),
    });
    const account = normalizeUser(result.user);
    if (result.accessToken) this.saveSession(account, result);
    return { account, ...result };
  },
  async resendEmailVerification(email) {
    return apiRequest("/auth/resend-verification", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email }),
    });
  },
  async restoreSession() {
    const refreshed = await restoreAccessSession();
    setAccessToken(refreshed.accessToken);
    const result = await apiRequest("/auth/me", { retryAuth: false });
    const account = normalizeUser(result.user);
    this.saveSession(account, refreshed);
    return account;
  },
  async logout() {
    try {
      await apiRequest("/auth/logout-all", { method: "POST" });
    } catch {
      // Local logout still completes if the server session has already expired.
    } finally {
      this.clearSession();
    }
  },
  async requestPasswordReset(email) {
    return apiRequest("/auth/password-reset/request", {
      method: "POST", auth: false, body: JSON.stringify({ email }),
    });
  },
  async verifyPasswordResetOtp(challengeToken, code) {
    return apiRequest("/auth/password-reset/verify-otp", {
      method: "POST", auth: false, body: JSON.stringify({ challengeToken, code }),
    });
  },
  async confirmPasswordReset(token, password, confirmPassword = password) {
    return apiRequest("/auth/password-reset/confirm", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ token, password, confirmPassword }),
    });
  },
  saveSession(user, tokens = {}) {
    currentSession = user;
    if (tokens.accessToken) setAccessToken(tokens.accessToken);
  },
  getSession() {
    return currentSession;
  },
  clearSession() {
    currentSession = null;
    setAccessToken(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("uninet.session");
      window.sessionStorage.removeItem("uninet.student");
      window.sessionStorage.removeItem("uninet.accessToken");
      window.sessionStorage.removeItem("uninet.refreshToken");
    }
  },
};
