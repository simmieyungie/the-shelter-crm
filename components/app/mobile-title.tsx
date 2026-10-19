"use client";

import { usePathname } from "next/navigation";
import type { NavKey } from "@/lib/auth/context";
import { activeNav, NAV_ITEMS } from "./nav-items";

export function MobileTitle({ nav }: { nav: NavKey[] }) {
  const key = activeNav(usePathname(), [...nav, "admin"]);
  return <>{key ? NAV_ITEMS[key].title : "Parish CRM"}</>;
}
