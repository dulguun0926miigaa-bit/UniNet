import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/apiClient.js", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../api/apiClient.js";
import { buildMembershipQuery, membershipService } from "./membershipService.js";

describe("membershipService", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  });

  it("serializes supported filters and omits empty UI values", () => {
    expect(buildMembershipQuery({ page: 2, search: "test user", status: "ALL", department: "", sortOrder: "asc" }))
      .toBe("?page=2&search=test+user&sortOrder=asc");
  });

  it("loads a tenant member page through the central API client", async () => {
    const controller = new AbortController();
    await membershipService.listMembers("students", { page: 3, pageSize: 10, status: "ACTIVE" }, { signal: controller.signal });
    expect(apiRequest).toHaveBeenCalledWith(
      "/memberships/students?page=3&pageSize=10&status=ACTIVE",
      { signal: controller.signal },
    );
  });

  it("loads and reviews pending students through dedicated endpoints", async () => {
    const controller = new AbortController();
    await membershipService.listPendingStudents({ page: 2, pageSize: 10, search: "student" }, { signal: controller.signal });
    expect(apiRequest).toHaveBeenLastCalledWith(
      "/memberships/students/pending?page=2&pageSize=10&search=student",
      { signal: controller.signal },
    );

    await membershipService.approvePendingStudent("student/id", {});
    expect(apiRequest).toHaveBeenLastCalledWith("/memberships/students/student%2Fid/approve", {
      method: "POST",
      body: JSON.stringify({}),
    });

    await membershipService.rejectPendingStudent("student/id");
    expect(apiRequest).toHaveBeenLastCalledWith("/memberships/students/student%2Fid/reject", {
      method: "POST",
      body: JSON.stringify({}),
    });
  });

  it("sends permission changes as a JSON patch", async () => {
    await membershipService.updateStaffPermissions("staff/id", { canPublish: true });
    expect(apiRequest).toHaveBeenCalledWith("/memberships/staff/staff%2Fid/permissions", {
      method: "PATCH",
      body: JSON.stringify({ canPublish: true }),
    });
  });

  it("keeps invitation acceptance unauthenticated and revocation query scoped", async () => {
    await membershipService.acceptInvitation({ token: "token", firstName: "A", lastName: "B", password: "Password!123", confirmPassword: "Password!123" });
    expect(apiRequest).toHaveBeenLastCalledWith("/memberships/invitations/accept", expect.objectContaining({ method: "POST", auth: false }));

    await membershipService.revokeInvitation("invite", { universityId: "university" });
    expect(apiRequest).toHaveBeenLastCalledWith("/memberships/invitations/invite/revoke?universityId=university", { method: "POST" });
  });

  it("integrates roster list, CSV preview, and commit endpoints", async () => {
    const controller = new AbortController();
    await membershipService.listRoster(
      { page: 2, pageSize: 20, memberType: "STUDENT", enrollmentStatus: "ACTIVE", search: "num" },
      { signal: controller.signal },
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      "/memberships/roster?page=2&pageSize=20&memberType=STUDENT&enrollmentStatus=ACTIVE&search=num",
      { signal: controller.signal },
    );

    const file = { name: "num-roster.csv", text: vi.fn().mockResolvedValue("email,memberType\nstudent@num.edu.mn,STUDENT") };
    await membershipService.previewRosterImport(file);
    expect(file.text).toHaveBeenCalledOnce();
    expect(apiRequest).toHaveBeenLastCalledWith("/memberships/roster/imports/preview", {
      method: "POST",
      headers: { "Content-Type": "text/csv", "X-File-Name": "num-roster.csv" },
      body: "email,memberType\nstudent@num.edu.mn,STUDENT",
    });

    await membershipService.commitRosterImport("job/id");
    expect(apiRequest).toHaveBeenLastCalledWith("/memberships/roster/imports/job%2Fid/commit", { method: "POST" });
  });

});
