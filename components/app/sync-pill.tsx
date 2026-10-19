"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, Cloud, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
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

export function SyncPill({ className }: { className?: string }) {
  useEffect(() => startSyncLoop(), []);
  const online = useOnline();
  const sync = useSyncState();
  const waiting = useLiveQuery(() => offlineDb().outbox.where("status").equals("pending").count(), [], 0);
  const failed = useLiveQuery(() => offlineDb().outbox.where("status").equals("rejected").count(), [], 0);

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
  } else if (failed > 0) {
    label = `${failed} not sent`;
    Icon = TriangleAlert;
    tone = "bg-danger-bg text-danger-text";
  } else {
    label = "All synced";
  }

  const pill = (
    <span
      data-testid="sync-pill"
      role="status"
      aria-live="polite"
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", tone, className)}
    >
      <Icon className={cn("size-3.5", Icon === LoaderCircle && "animate-spin")} aria-hidden />
      {label}
    </span>
  );
  return sync.needsLogin ? <Link href="/login?next=/count">{pill}</Link> : pill;
}
