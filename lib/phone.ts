import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/** Normalise a Nigerian (or international) number to E.164, e.g. "0803 123 4567" -> "+2348031234567". */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, "NG");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}
