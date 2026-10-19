"use client";

import { Check, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout, switchParish } from "@/lib/auth/actions";

export function AccountMenu({
  name,
  parishes,
  currentParishId,
  showAdmin,
}: {
  name: string;
  parishes: { id: string; name: string }[];
  currentParishId: string | null;
  showAdmin: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-semibold text-ink">{name}</DropdownMenuLabel>
        {parishes.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-subtle">Switch parish</DropdownMenuLabel>
            {parishes.map((p) => (
              <DropdownMenuItem key={p.id} asChild>
                <form action={switchParish} className="w-full">
                  <input type="hidden" name="parishId" value={p.id} />
                  <button type="submit" className="flex w-full items-center justify-between text-left">
                    {p.name}
                    {p.id === currentParishId && <Check className="size-4 text-brand" aria-label="Current" />}
                  </button>
                </form>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {showAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Settings className="size-4" aria-hidden /> Admin
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={logout} className="w-full">
            <button type="submit" className="flex w-full items-center gap-2 text-left">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
