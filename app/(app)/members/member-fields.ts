import type { Field } from "@/components/app/entity-form";
import type { Tone } from "@/components/app/status-pill";
import type { MemberStatus, members } from "@/lib/db/schema";
import { MEMBER_STATUS_LABELS } from "@/lib/labels";

type Member = typeof members.$inferSelect;

export function memberFields(tribes: { id: string; name: string }[], m?: Member, groupId?: string | null): Field[] {
  return [
    { name: "firstName", label: "First name", type: "text", required: true, defaultValue: m?.firstName },
    { name: "lastName", label: "Last name", type: "text", defaultValue: m?.lastName },
    { name: "phone", label: "Phone", type: "tel", defaultValue: m?.phone, placeholder: "0803 123 4567", hint: "Optional for children and family members sharing a phone." },
    { name: "whatsappPhone", label: "WhatsApp number", type: "tel", defaultValue: m?.whatsappPhone },
    { name: "email", label: "Email", type: "email", defaultValue: m?.email },
    { name: "gender", label: "Gender", type: "select", defaultValue: m?.gender ?? "", options: [{ value: "FEMALE", label: "Female" }, { value: "MALE", label: "Male" }] },
    { name: "dateOfBirth", label: "Date of birth", type: "date", defaultValue: m?.dateOfBirth },
    { name: "status", label: "Status", type: "select", required: true, defaultValue: m?.status ?? "REGULAR_MEMBER", options: Object.entries(MEMBER_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
    { name: "firstVisitOn", label: "First visit", type: "date", defaultValue: m?.firstVisitOn },
    { name: "smallGroupId", label: "Tribe", type: "select", defaultValue: groupId ?? "", options: tribes.map((t) => ({ value: t.id, label: t.name })), placeholder: "None" },
    { name: "address", label: "Address", type: "textarea", defaultValue: m?.address },
    { name: "consentContact", label: "Happy for the church to call or message them", type: "checkbox", defaultValue: m?.consentContact ?? false },
  ];
}

export const STATUS_TONE: Record<MemberStatus, Tone> = { FIRST_TIMER: "brand", NEW_CONVERT: "warning", REGULAR_MEMBER: "neutral", WORKER: "success", ORDAINED_MINISTER: "success" };
