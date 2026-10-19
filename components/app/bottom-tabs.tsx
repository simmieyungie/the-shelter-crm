"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavKey } from "@/lib/auth/context";
import { cn } from "@/lib/utils";
import { activeNav, NAV_ITEMS } from "./nav-items";

// Admin lives in the account menu on phones to keep the tab bar to five items.
const PHONE_TABS: NavKey[] = ["count", "tasks", "reports", "zone", "members"];

export function BottomTabs({ nav }: { nav: NavKey[] }) {
  const pathname = usePathname();
  const tabs = nav.filter((k) => PHONE_TABS.includes(k));
  const active = activeNav(pathname, nav);
  if (tabs.length === 0) return null;
  return (
    <nav
      aria-label="Main"
      data-testid="bottom-tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((key) => {
          const item = NAV_ITEMS[key];
          const Icon = item.icon;
          const isActive = key === active;
          return (
            <li key={key} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  isActive ? "text-brand" : "text-subtle",
                )}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full", isActive && "bg-brand-tint")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
