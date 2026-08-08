import { apiRequest as request } from "../api/apiClient.js";

/**
 * @typedef {"PENDING_REVIEW"|"ACTIVE"|"SUSPENDED"|"DEACTIVATED"|"REJECTED"} MemberStatus
 * @typedef {"PENDING"|"ACCEPTED"|"REVOKED"|"EXPIRED"} InvitationStatus
 * @typedef {"createdAt"|"email"|"status"|"lastLoginAt"} MemberSort
 * @typedef {{page?: number, pageSize?: number, search?: string, status?: MemberStatus, department?: string, sortBy?: MemberSort, sortOrder?: "asc"|"desc"}} MemberQuery
 * @typedef {{canCreateContent?: boolean, canPublish?: boolean, canManageRegistrations?: boolean, canManageApplications?: boolean, canManageSurveys?: boolean, canViewReports?: boolean}} StaffPermissions
 * @typedef {{rosterMemberId?: string}} PendingStudentApproval
 */

const unwrap = payload => payload?.data ?? payload;

function queryString(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "ALL") return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function encoded(value) {
  return encodeURIComponent(String(value));
}

async function downloadCsv(path, filename) {
  const response = await request(path, { responseType: "response" });
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const membershipService = {
  /** @param {"staff"|"students"} kind @param {MemberQuery} query @param {{signal?: AbortSignal}} [options] */
  async listMembers(kind, query = {}, options = {}) {
    return unwrap(await request(`/memberships/${kind}${queryString(query)}`, { signal: options.signal }));
  },

  async getMember(kind, id, options = {}) {
    return unwrap(await request(`/memberships/${kind}/${encoded(id)}`, { signal: options.signal }));
  },

  async downloadMembers(kind, query = {}) {
    const filename = kind === "staff" ? "uninet-staff.csv" : "uninet-students.csv";
    return downloadCsv(`/memberships/${kind}/export.csv${queryString(query)}`, filename);
  },


  /** @param {MemberQuery} query @param {{signal?: AbortSignal}} [options] */
  async listPendingStudents(query = {}, options = {}) {
    return unwrap(await request(`/memberships/students/pending${queryString(query)}`, { signal: options.signal }));
  },

  /** @param {string} id @param {PendingStudentApproval} review */
  async approvePendingStudent(id, review = {}) {
    return unwrap(await request(`/memberships/students/${encoded(id)}/approve`, {
      method: "POST",
      body: JSON.stringify(review),
    }));
  },

  /** @param {string} id */
  async rejectPendingStudent(id) {
    return unwrap(await request(`/memberships/students/${encoded(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({}),
    }));
  },

  /** @param {"staff"|"students"} kind @param {string} id @param {MemberStatus} status */
  async updateMemberStatus(kind, id, status) {
    return unwrap(await request(`/memberships/${kind}/${encoded(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }));
  },

  /** @param {string} id @param {StaffPermissions} permissions */
  async updateStaffPermissions(id, permissions) {
    return unwrap(await request(`/memberships/staff/${encoded(id)}/permissions`, {
      method: "PATCH",
      body: JSON.stringify(permissions),
    }));
  },

  async listInvitations(query = {}, options = {}) {
    return unwrap(await request(`/memberships/invitations${queryString(query)}`, { signal: options.signal }));
  },

  async createInvitation(invitation) {
    return unwrap(await request("/memberships/invitations", {
      method: "POST",
      body: JSON.stringify(invitation),
    }));
  },

  async revokeInvitation(id, { universityId } = {}) {
    return unwrap(await request(`/memberships/invitations/${encoded(id)}/revoke${queryString({ universityId })}`, {
      method: "POST",
    }));
  },

  async acceptInvitation(invitation) {
    return unwrap(await request("/memberships/invitations/accept", {
      method: "POST",
      auth: false,
      body: JSON.stringify(invitation),
    }));
  },

  async listRoster(query = {}, options = {}) {
    return unwrap(await request(`/memberships/roster${queryString(query)}`, { signal: options.signal }));
  },

  async downloadRosterTemplate() {
    return downloadCsv("/memberships/roster/template", "uninet-roster-template.csv");
  },

  async previewRosterImport(file) {
    const csv = await file.text();
    return unwrap(await request("/memberships/roster/imports/preview", {
      method: "POST",
      headers: { "Content-Type": "text/csv", "X-File-Name": file.name },
      body: csv,
    }));
  },

  async listRosterImports(query = {}, options = {}) {
    return unwrap(await request(`/memberships/roster/imports${queryString(query)}`, { signal: options.signal }));
  },

  async commitRosterImport(id) {
    return unwrap(await request(`/memberships/roster/imports/${encoded(id)}/commit`, { method: "POST" }));
  },

  async downloadRoster(query = {}) {
    return downloadCsv(`/memberships/roster/export.csv${queryString(query)}`, "uninet-roster.csv");
  },

  async downloadRosterImportErrors(id) {
    return downloadCsv(`/memberships/roster/imports/${encoded(id)}/errors.csv`, `roster-import-${id}-errors.csv`);
  },
};

export { queryString as buildMembershipQuery };
