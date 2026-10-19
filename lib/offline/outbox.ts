import { offlineDb, type LocalTally, type OutboxItem } from "./db";
import type { MemberCreatePayload, SyncKind } from "./protocol";

function uuid(): string {
  return crypto.randomUUID();
}

/** Writes the tally locally and replaces any pending outbox item for the same row. */
export async function saveTally(tally: Omit<LocalTally, "clientUpdatedAt">) {
  const db = offlineDb();
  const clientUpdatedAt = new Date().toISOString();
  const row: LocalTally = { ...tally, clientUpdatedAt };
  const payload = {
    serviceEventId: row.serviceEventId,
    sanctuaryZoneId: row.sanctuaryZoneId,
    men: row.men,
    women: row.women,
    children: row.children,
    firstTimers: row.firstTimers,
    clientUpdatedAt,
  };
  await db.transaction("rw", db.tallies, db.outbox, async () => {
    await db.tallies.put(row);
    const existing = await db.outbox.where("key").equals(row.key).first();
    if (existing && existing.status === "pending") {
      await db.outbox.update(existing.seq!, {
        payload,
        version: existing.version + 1,
        nextAttemptAt: Date.now(),
      });
    } else {
      await db.outbox.add(newItem("tally.upsert", row.clientId, row.key, payload));
    }
  });
  requestSync();
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
