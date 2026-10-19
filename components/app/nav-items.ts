import { ChartColumn, FileText, Settings, SquareKanban, Tally5, Users, type LucideIcon } from "lucide-react";
import type { NavKey } from "@/lib/auth/context";

export const NAV_ITEMS: Record<NavKey, { label: string; href: string; icon: LucideIcon; title: string }> = {
  count: { label: "Count", href: "/count", icon: Tally5, title: "Headcount" },
  tasks: { label: "Tasks", href: "/tasks", icon: SquareKanban, title: "Tasks" },
  reports: { label: "Reports", href: "/reports", icon: FileText, title: "Reports" },
  zone: { label: "Zone", href: "/zone", icon: ChartColumn, title: "Zone overview" },
  members: { label: "Members", href: "/members", icon: Users, title: "Members" },
  admin: { label: "Admin", href: "/admin", icon: Settings, title: "Admin" },
};

export function activeNav(pathname: string, nav: NavKey[]): NavKey | null {
  return nav.find((k) => pathname === NAV_ITEMS[k].href || pathname.startsWith(NAV_ITEMS[k].href + "/")) ?? null;
}
