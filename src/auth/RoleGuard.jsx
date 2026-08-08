import { roleHome } from "./authService";
import HttpErrorState from "../errors/HttpErrorState.jsx";

export function PermissionDenied({ title = "Энэ үйлдлийг хийх эрх танд байхгүй.", onBack }) {
  return <HttpErrorState status={403} error={{ status: 403, code: "FORBIDDEN", message: title }} onHome={onBack} compact />;
}

export function RoleGuard({ user, allowedRole, children, navigate }) {
  if (!user) return <PermissionDenied title="Нэвтрэх шаардлагатай." onBack={() => navigate("/")} />;
  if (user.status !== "ACTIVE") return <PermissionDenied title="Таны бүртгэл идэвхгүй байна." onBack={() => navigate("/")} />;
  if (user.role !== allowedRole) return <PermissionDenied title="Өөр role-ийн хамгаалагдсан хуудас." onBack={() => navigate(roleHome[user.role] || "/")} />;
  return children;
}

export function PermissionGuard({ user, permission, children, fallback = null }) {
  if (!permission || user?.permissions?.includes(permission)) return children;
  return fallback;
}
