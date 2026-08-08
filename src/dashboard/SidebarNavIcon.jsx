import {
  Activity,
  BarChart3,
  Bookmark,
  Briefcase,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
  Globe2,
  GraduationCap,
  Handshake,
  Home,
  LayoutDashboard,
  Network,
  PlusCircle,
  ScrollText,
  Send,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { createElement } from "react";

function iconForPath(path) {
  if (/\/(staff|admin|platform)$/.test(path)) return LayoutDashboard;
  if (path.includes("/universities/create")) return PlusCircle;
  if (path.includes("/universities") || path.includes("/my-university") || path.includes("/university-profile")) return Building2;
  if (path.includes("/network")) return Network;
  if (path.includes("/saved")) return Bookmark;
  if (path.includes("/registrations")) return CalendarCheck;
  if (path.includes("/applications")) return Briefcase;
  if (path.includes("/survey")) return ClipboardList;
  if (path.includes("/approvals")) return CheckCircle2;
  if (path.includes("/drafts")) return FileText;
  if (path.includes("/published")) return Send;
  if (path.includes("/content")) return FileText;
  if (path.includes("/students")) return GraduationCap;
  if (path.includes("/staff") || path.includes("/admins")) return UserCog;
  if (path.includes("/users")) return Users;
  if (path.includes("/roles")) return ShieldCheck;
  if (path.includes("/partnership")) return Handshake;
  if (path.includes("/analytics") || path.includes("/reports")) return BarChart3;
  if (path.includes("/audit")) return ScrollText;
  if (path.includes("/monitoring")) return Activity;
  if (path.startsWith("/platform")) return Globe2;
  if (path === "/student") return Home;
  return ClipboardList;
}

export default function SidebarNavIcon({ path, className = "h-5 w-5" }) {
  return createElement(iconForPath(path), { "aria-hidden": true, className, strokeWidth: 2 });
}
