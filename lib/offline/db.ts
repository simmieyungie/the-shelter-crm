import Dexie, { type EntityTable } from "dexie";
import type { SyncKind, ZoneTotal } from "./protocol";

export type OutboxStatus = "pending" | "rejected";

export type OutboxItem = {
  seq?: number;
  /** Who queued it. Only that user's session may send it (shared phones). */
  userId: string;
  clientId: string;
  kind: SyncKind;
  /** Local upsert key: one pending tally item per (event, zone, user). */
  key: string;
  payload: unknown;
  status: OutboxStatus;
  version: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  label?: string;
  createdAt: number;
};

export type LocalTally = {
  key: string; // `${userId}:${serviceEventId}:${sanctuaryZoneId}`
  userId: string;
  clientId: string;
  serviceEventId: string;
  sanctuaryZoneId: string;
  men: number;
  women: number;
  children: number;
  firstTimers: number;
  registeredFirstTimers: number;
  clientUpdatedAt: string;
};

export type CachedValue = { key: string; value: unknown; savedAt: number };

export type CachedZoneTotal = ZoneTotal & { key: string; fetchedAt: number };

class OfflineDb extends Dexie {
  outbox!: EntityTable<OutboxItem, "seq">;
  tallies!: EntityTable<LocalTally, "key">;
  cache!: EntityTable<CachedValue, "key">;
  zoneTotals!: EntityTable<CachedZoneTotal, "key">;

  constructor() {
    super("parish-crm");
    this.version(1).stores({
      outbox: "++seq, &clientId, key, status, kind, nextAttemptAt",
      tallies: "&key, userId, serviceEventId",
      cache: "&key",
      zoneTotals: "&key",
    });
    this.version(2).stores({
      outbox: "++seq, &clientId, key, status, kind, nextAttemptAt, userId, [userId+status]",
    });
  }
}

let instance: OfflineDb | null = null;

export function offlineDb(): OfflineDb {
  if (!instance) instance = new OfflineDb();
  return instance;
}

export function tallyKey(userId: string, serviceEventId: string, zoneId: string) {
  return `${userId}:${serviceEventId}:${zoneId}`;
}

export function zoneKey(serviceEventId: string, zoneId: string) {
  return `${serviceEventId}:${zoneId}`;
}
