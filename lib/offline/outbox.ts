import { offlineDb, type LocalTally, type OutboxItem } from "./db";
import type { MemberCreatePayload, SyncKind } from "./protocol";

function uuid(): string {
  return crypto.randomUUID();
}

export type TallyIdentity = { key: string; userId: string; serviceEventId: string; sanctuaryZoneId: string };
type Counts = Pick<LocalTally, "men" | "women" | "children" | "firstTimers">;

/**
 * Reads, changes and writes the local tally in one transaction (so fast taps never
 * lose each other), then replaces any pending outbox item for the same row.
 */
export async function updateTally(id: TallyIdentity, mutate: (t: LocalTally) => Partial<LocalTally>): Promise<LocalTally> {
  const db = offlineDb();
  let saved!: LocalTally;
  await db.transaction("rw", db.tallies, db.outbox, async () => {
    const current: LocalTally =
      (await db.tallies.get(id.key)) ?? {
        ...id,
        clientId: uuid(),
        men: 0,
        women: 0,
        children: 0,
        firstTimers: 0,
        registeredFirstTimers: 0,
        clientUpdatedAt: new Date(0).toISOString(),
      };
    const patch = mutate(current);
    const next: LocalTally = { ...current, ...patch };
    for (const k of ["men", "women", "children", "firstTimers", "registeredFirstTimers"] as const) next[k] = Math.max(0, Math.min(100_000, Math.round(next[k])));
    const countsChanged = (["men", "women", "children", "firstTimers"] as const).some((k) => next[k] !== current[k]);
    if (countsChanged) {
      // Strictly increasing timestamps so last-write-wins never ties.
      const prev = Date.parse(current.clientUpdatedAt);
      next.clientUpdatedAt = new Date(Math.max(Date.now(), prev + 1)).toISOString();
    }
    await db.tallies.put(next);
    saved = next;
    if (!countsChanged) return;
    const payload = {
      serviceEventId: next.serviceEventId,
      sanctuaryZoneId: next.sanctuaryZoneId,
      men: next.men,
      women: next.women,
      children: next.children,
      firstTimers: next.firstTimers,
      clientUpdatedAt: next.clientUpdatedAt,
    };
    const existing = await db.outbox.where("key").equals(next.key).filter((i) => i.status === "pending").first();
    if (existing) {
      await db.outbox.update(existing.seq!, { payload, version: existing.version + 1, nextAttemptAt: Date.now(), attempts: 0 });
    } else {
      await db.outbox.add(newItem("tally.upsert", next.clientId, next.key, payload));
    }
  });
  requestSync();
  return saved;
}

/** Restores a tally from the server copy when this device has nothing newer. */
export async function restoreTally(id: TallyIdentity, server: Counts & { clientId: string; clientUpdatedAt: string }) {
  const db = offlineDb();
  await db.transaction("rw", db.tallies, async () => {
    const local = await db.tallies.get(id.key);
    if (local && Date.parse(local.clientUpdatedAt) >= Date.parse(server.clientUpdatedAt)) return;
    await db.tallies.put({ ...id, ...server, registeredFirstTimers: local?.registeredFirstTimers ?? 0 });
  });
}

export async function enqueueMemberCreate(payload: MemberCreatePayload, label: string) {
  const clientId = uuid();
  await offlineDb().outbox.add({ ...newItem("member.create", clientId, `member:${clientId}`, payload), label });
  requestSync();
  return clientId;
}

export async function enqueueCheckin(serviceEventId: string, memberId: string, label: string) {
  const clientId = uuid();
  await offlineDb().outbox.add({
    ...newItem("checkin.create", clientId, `checkin:${serviceEventId}:${memberId}`, { serviceEventId, memberId }),
    label,
  });
  requestSync();
  return clientId;
}

function newItem(kind: SyncKind, clientId: string, key: string, payload: unknown): OutboxItem {
  return {
    clientId,
    kind,
    key,
    payload,
    status: "pending",
    version: 1,
    attempts: 0,
    nextAttemptAt: Date.now(),
    createdAt: Date.now(),
  };
}

// The sync loop registers itself here so writers can nudge it without importing it.
let nudge: (() => void) | null = null;
export function setSyncNudge(fn: (() => void) | null) {
  nudge = fn;
}
export function requestSync() {
  nudge?.();
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("outbox"))
      .catch(() => undefined);
  }
}
