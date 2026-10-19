import "server-only";
import { addDays, lagosDateTime } from "@/lib/dates";
import type { DbOrTx } from "@/lib/db";
import { outboundMessages } from "@/lib/db/schema";

type MemberForMessage = {
  id: string;
  parishId: string;
  firstName: string;
  phone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  consentContact: boolean;
};

export const TEMPLATES = {
  welcome: (name: string, parish: string) =>
    `Hello ${name}, thank you for worshipping with us at ${parish}. We're glad you came and we'd love to see you again this Sunday. God bless you!`,
  tribeInvite: (name: string, group: string, where: string) =>
    `Hello ${name}, you're invited to ${group}, our house fellowship near you${where ? ` (${where})` : ""}. Come and meet the family!`,
  believersClass: (name: string) =>
    `Hello ${name}, our Believers' Class helps you grow in your new walk with God. You're warmly invited to the next class after Sunday service.`,
} as const;

/** Queues a message once per (member, template). No-op without consent or a contact. */
export async function queueMessage(
  tx: DbOrTx,
  member: MemberForMessage,
  templateKey: keyof typeof TEMPLATES,
  body: string,
  scheduledFor: Date = new Date(),
) {
  if (!member.consentContact) return false;
  const whatsapp = member.whatsappPhone ?? null;
  const channel = whatsapp ? "WHATSAPP" : member.phone ? "SMS" : member.email ? "EMAIL" : null;
  if (!channel) return false;
  const rows = await tx
    .insert(outboundMessages)
    .values({
      parishId: member.parishId,
      channel,
      toPhone: channel === "WHATSAPP" ? whatsapp : channel === "SMS" ? member.phone : null,
      toEmail: channel === "EMAIL" ? member.email : null,
      templateKey,
      body,
      relatedMemberId: member.id,
      scheduledFor,
      dedupeKey: `followup:${templateKey}:${member.id}`,
    })
    .onConflictDoNothing()
    .returning({ id: outboundMessages.id });
  return rows.length > 0;
}

/** Day 0: welcome message, sent on registration (and caught up by the daily job). */
export async function queueWelcome(tx: DbOrTx, member: MemberForMessage, parishName: string, firstVisitOn: string) {
  // Send at 15:00 Lagos on the day of the visit, or straight away if that time has passed.
  const at = lagosDateTime(firstVisitOn, "15:00");
  return queueMessage(tx, member, "welcome", TEMPLATES.welcome(member.firstName, parishName), at < new Date() ? new Date() : at);
}

export const FOLLOW_UP_DAYS = { welcome: 0, call: 3, tribe: 7, believersClass: 14, review: 30 } as const;
export const followUpDate = (firstVisitOn: string, day: number) => addDays(firstVisitOn, day);
