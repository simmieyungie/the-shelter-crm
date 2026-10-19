import "server-only";
import type { DbOrTx } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export async function writeAudit(
  tx: DbOrTx,
  entry: {
    actorUserId: string | null;
    entity: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
