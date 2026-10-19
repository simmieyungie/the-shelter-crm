"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavKey } from "@/lib/auth/context";
import { cn } from "@/lib/utils";
import { activeNav, NAV_ITEMS } from "./nav-items";

export function SideNav({ nav }: { nav: NavKey[] }) {
  const pathname = usePathname();
  const active = activeNav(pathname, nav);
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {nav.map((key) => {
        const item = NAV_ITEMS[key];
        const Icon = item.icon;
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              isActive ? "bg-brand-soft text-brand" : "text-subtle hover:bg-muted hover:text-ink",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
