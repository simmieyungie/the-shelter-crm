import { backoffMs } from "./backoff";
import { offlineDb, zoneKey, type OutboxItem } from "./db";
import { setSyncNudge } from "./outbox";
import type { SyncResponse } from "./protocol";

const BATCH = 50;
const INTERVAL_MS = 15_000;

export type SyncState = { running: boolean; needsLogin: boolean; lastSyncedAt: number | null };

type Listener = (s: SyncState) => void;
const listeners = new Set<Listener>();
let state: SyncState = { running: false, needsLogin: false, lastSyncedAt: null };
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}
export function subscribeSyncState(l: Listener) {
  listeners.add(l);
  l(state);
  return () => void listeners.delete(l);
}

let inFlight: Promise<void> | null = null;
let currentUserId: string | null = null;
let again = false;

/** Sends every due outbox item. Safe to call often; concurrent calls coalesce. */
export function syncNow(): Promise<void> {
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      do {
        again = false;
        await drain();
      } while (again);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function drain() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (!currentUserId) return;
  const db = offlineDb();
  for (;;) {
    const now = Date.now();
    const due = await db.outbox
      .where("[userId+status]")
      .equals([currentUserId, "pending"])
      .filter((i) => i.nextAttemptAt <= now)
      .limit(BATCH)
      .toArray();
    if (due.length === 0) return;
    setState({ running: true });
    const sentVersions = new Map(due.map((i) => [i.seq!, i.version]));
    let res: Response;
    try {
      res = await fetch("/api/v1/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          items: due.map((i) => ({ clientId: i.clientId, kind: i.kind, payload: i.payload })),
        }),
      });
    } catch {
      await scheduleRetry(due, "Network error");
      setState({ running: false });
      return;
    }
    if (res.status === 401) {
      setState({ running: false, needsLogin: true });
      return;
    }
    if (!res.ok) {
      await scheduleRetry(due, `Server error ${res.status}`);
      setState({ running: false });
      return;
    }
    const body = (await res.json()) as SyncResponse;
    await applyResults(due, sentVersions, body);
    setState({ running: false, needsLogin: false, lastSyncedAt: Date.now() });
  }
}

async function scheduleRetry(items: OutboxItem[], error: string) {
  const db = offlineDb();
  await db.transaction("rw", db.outbox, async () => {
    for (const item of items) {
      const attempts = item.attempts + 1;
      await db.outbox.update(item.seq!, { attempts, lastError: error, nextAttemptAt: Date.now() + backoffMs(attempts) });
    }
  });
}

async function applyResults(items: OutboxItem[], sentVersions: Map<number, number>, body: SyncResponse) {
  const db = offlineDb();
  const byClient = new Map(body.results.map((r) => [r.clientId, r]));
  await db.transaction("rw", db.outbox, db.zoneTotals, async () => {
    for (const item of items) {
      const result = byClient.get(item.clientId);
      const current = await db.outbox.get(item.seq!);
      if (!current) continue;
      if (!result || result.status === "error") {
        const attempts = current.attempts + 1;
        await db.outbox.update(item.seq!, {
          attempts,
          lastError: result?.error ?? "No result",
          nextAttemptAt: Date.now() + backoffMs(attempts),
        });
      } else if (result.status === "rejected") {
        await db.outbox.update(item.seq!, { status: "rejected", lastError: result.error });
      } else if (current.version === sentVersions.get(item.seq!)) {
        // Only remove the item if it wasn't changed (e.g. another tap) while in flight.
        await db.outbox.delete(item.seq!);
      } else {
        await db.outbox.update(item.seq!, { attempts: 0, nextAttemptAt: Date.now() });
        again = true;
      }
    }
    for (const z of body.zoneTotals) {
      await db.zoneTotals.put({ ...z, key: zoneKey(z.serviceEventId, z.sanctuaryZoneId), fetchedAt: Date.now() });
    }
  });
}

let started = false;
/** Starts the background loop: online event, every 15 s, nudges, and service-worker messages. */
export function startSyncLoop(userId: string) {
  currentUserId = userId;
  if (started || typeof window === "undefined") return () => undefined;
  started = true;
  const kick = () => void syncNow();
  let timer: ReturnType<typeof setTimeout> | null = null;
  setSyncNudge(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(kick, 300);
  });
  window.addEventListener("online", kick);
  const interval = setInterval(kick, INTERVAL_MS);
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === "run-sync") kick();
  };
  navigator.serviceWorker?.addEventListener("message", onMessage);
  kick();
  return () => {
    started = false;
    currentUserId = null;
    setSyncNudge(null);
    window.removeEventListener("online", kick);
    clearInterval(interval);
    navigator.serviceWorker?.removeEventListener("message", onMessage);
  };
}

/** Clears the needs-login flag after the user signs in again. */
export function resetNeedsLogin() {
  setState({ needsLogin: false });
}
