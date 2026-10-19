"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Cloud, CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { offlineDb } from "@/lib/offline/db";
import { startSyncLoop, subscribeSyncState, type SyncState } from "@/lib/offline/sync";
import { cn } from "@/lib/utils";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export function useSyncState() {
  const [s, setS] = useState<SyncState>({ running: false, needsLogin: false, lastSyncedAt: null });
  useEffect(() => subscribeSyncState(setS), []);
  return s;
}

const KIND_LABEL = { "tally.upsert": "Headcount", "member.create": "First-timer", "checkin.create": "Attendance" } as const;

export function SyncPill({ userId, className }: { userId: string; className?: string }) {
  useEffect(() => startSyncLoop(userId), [userId]);
  const online = useOnline();
  const sync = useSyncState();
  const waiting = useLiveQuery(() => offlineDb().outbox.where("[userId+status]").equals([userId, "pending"]).count(), [userId], 0);
  const rejected = useLiveQuery(() => offlineDb().outbox.where("[userId+status]").equals([userId, "rejected"]).toArray(), [userId], []);

  let label: string;
  let Icon = Cloud;
  let tone = "bg-white/15 text-white";
  if (sync.needsLogin) {
    label = `Sign in to send · ${waiting}`;
    Icon = TriangleAlert;
    tone = "bg-warning-bg text-warning-text";
  } else if (!online) {
    label = waiting > 0 ? `Offline · ${waiting} waiting` : "Offline";
    Icon = CloudOff;
    tone = "bg-warning-bg text-warning-text";
  } else if (waiting > 0) {
    label = `Sending · ${waiting}`;
    Icon = LoaderCircle;
  } else if (rejected.length > 0) {
    label = `${rejected.length} not sent`;
    Icon = TriangleAlert;
    tone = "bg-danger-bg text-danger-text";
  } else {
    label = "All synced";
  }

  const pill = (
    <span data-testid="sync-pill" role="status" aria-live="polite" className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", tone, className)}>
      <Icon className={cn("size-3.5", Icon === LoaderCircle && "animate-spin")} aria-hidden />
      {label}
    </span>
  );
  if (sync.needsLogin) return <Link href="/login?next=/count">{pill}</Link>;
  if (rejected.length === 0) return pill;
  return (
    <Popover>
      <PopoverTrigger aria-label="See what wasn't sent" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white">
        {pill}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="mb-2 text-sm font-semibold">Not sent</p>
        <p className="mb-3 text-xs text-subtle">The server refused these. Tell your Head Usher, then dismiss them.</p>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {rejected.map((r) => (
            <li key={r.seq} className="rounded-lg bg-muted/60 p-2 text-xs">
              <p className="font-medium text-ink">
                {KIND_LABEL[r.kind]}
                {r.label ? ` · ${r.label}` : ""}
              </p>
              <p className="text-danger-text">{r.lastError ?? "Rejected"}</p>
              <button type="button" className="mt-1 font-medium text-brand underline" onClick={() => offlineDb().outbox.delete(r.seq!)}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
