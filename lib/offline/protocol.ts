// Shared between the browser outbox and the /api/v1/sync route handler.
import { z } from "zod";

const count = z.number().int().min(0).max(100_000);

export const tallyPayload = z.object({
  serviceEventId: z.uuid(),
  sanctuaryZoneId: z.uuid(),
  men: count,
  women: count,
  children: count,
  firstTimers: count,
  clientUpdatedAt: z.iso.datetime({ offset: true }),
});

export const memberCreatePayload = z.object({
  serviceEventId: z.uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  phone: z.string().trim().min(7).max(20),
  whatsappPhone: z.string().trim().max(20).nullable().optional(),
  gender: z.enum(["MALE", "FEMALE"]).nullable().optional(),
  smallGroupId: z.uuid().nullable().optional(),
  consentContact: z.boolean(),
  /** Set when the usher chose "Save anyway" after a duplicate-phone warning. */
  allowDuplicatePhone: z.boolean().optional(),
});

export const checkinPayload = z.object({
  serviceEventId: z.uuid(),
  memberId: z.uuid(),
});

export const syncItem = z.discriminatedUnion("kind", [
  z.object({ clientId: z.uuid(), kind: z.literal("tally.upsert"), payload: tallyPayload }),
  z.object({ clientId: z.uuid(), kind: z.literal("member.create"), payload: memberCreatePayload }),
  z.object({ clientId: z.uuid(), kind: z.literal("checkin.create"), payload: checkinPayload }),
]);

export const syncRequest = z.object({ items: z.array(syncItem).min(1).max(100) });

export type SyncItem = z.infer<typeof syncItem>;
export type SyncKind = SyncItem["kind"];
export type TallyPayload = z.infer<typeof tallyPayload>;
export type MemberCreatePayload = z.infer<typeof memberCreatePayload>;

/**
 * ok        – applied
 * duplicate – this clientId was already applied (no-op)
 * stale     – a newer version is already on the server (no-op)
 * rejected  – permanent failure (validation, permission, locked report); do not retry
 * error     – transient failure; retry later
 */
export type SyncItemStatus = "ok" | "duplicate" | "stale" | "rejected" | "error";

export type ZoneTotal = {
  serviceEventId: string;
  sanctuaryZoneId: string;
  /** Sum of every other usher's tally for this zone. */
  others: { men: number; women: number; children: number; firstTimers: number };
  otherUshers: string[];
};

export type SyncResponse = {
  results: { clientId: string; status: SyncItemStatus; error?: string; memberId?: string }[];
  zoneTotals: ZoneTotal[];
};
