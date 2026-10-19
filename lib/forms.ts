import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/permissions";

export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Changes on every result so clients can react to repeated identical results. */
  at?: number;
  data?: Record<string, unknown>;
};

export const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const text = () => z.string().trim().min(1, "Required");
export const optionalText = () =>
  z.preprocess(blankToNull, z.string().trim().nullable().optional()).transform((v) => v ?? null);
export const optionalInt = (min = 0) =>
  z
    .preprocess(blankToNull, z.coerce.number().int("Whole numbers only").min(min, `Must be ${min} or more`).nullable().optional())
    .transform((v) => v ?? null);
export const int = (min = 0) => z.coerce.number().int("Whole numbers only").min(min, `Must be ${min} or more`);
export const checkbox = () => z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const uuid = () => z.uuid("Choose an option");
export const optionalUuid = () =>
  z.preprocess(blankToNull, z.uuid().nullable().optional()).transform((v) => v ?? null);
export const isoDate = () => z.iso.date("Enter a date");
export const time = () => z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a time like 08:00");

export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k in out) {
      const prev = out[k];
      out[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    } else out[k] = v;
  }
  return out;
}

/** Parses the form, runs the mutation and turns known errors into an ActionState. */
export async function runAction<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  fn: (data: z.infer<S>) => Promise<string | void | ActionState>,
): Promise<ActionState> {
  const parsed = schema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Check the highlighted fields.", fieldErrors, at: Date.now() };
  }
  try {
    const result = await fn(parsed.data);
    if (result && typeof result === "object") return { ok: true, at: Date.now(), ...result };
    return { ok: true, message: result || "Saved", at: Date.now() };
  } catch (err) {
    return { ok: false, error: friendlyError(err), at: Date.now() };
  }
}

export class UserError extends Error {}

export function friendlyError(err: unknown): string {
  if (err instanceof ForbiddenError || err instanceof UserError) return err.message;
  const e = err as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const code = e?.code ?? e?.cause?.code;
  if (code === "23505") return "That already exists. Use a different name or code.";
  if (code === "23503") return "That record is still in use elsewhere, so it can't be removed.";
  if (code === "23514") return "Some values are out of range.";
  // Redirects thrown by next/navigation must propagate.
  if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
  console.error(err);
  return "Something went wrong. Try again.";
}
