"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { type ActionState, checkbox, optionalInt, optionalText, runAction, uuid } from "@/lib/forms";
import { parseNairaToKobo } from "@/lib/money";
import { saveReportTx, transitionReportTx } from "@/lib/reports/mutations";

const money = (label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z.string().transform((v, ctx) => {
      const k = parseNairaToKobo(v);
      if (k !== null && Number.isNaN(k)) {
        ctx.addIssue({ code: "custom", message: `Enter ${label} like 145,000 or 145000.50` });
        return z.NEVER;
      }
      return k;
    }),
  );

const reportSchema = z.object({
  reportId: uuid(),
  intent: z.enum(["save", "submit"]),
  typeAttendance: checkbox(),
  men: optionalInt(0),
  women: optionalInt(0),
  children: optionalInt(0),
  firstTimers: optionalInt(0),
  workersOnDuty: optionalInt(0),
  offering: money("the offering"),
  tithe: money("the tithe"),
  specialSeed: money("the special seed"),
  notes: optionalText(),
  preacher: optionalText(),
  theme: optionalText(),
});

export async function saveReport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(reportSchema, fd, async (d) => {
    const { access, user } = await requireAppContext();
    await db.transaction((tx) =>
      saveReportTx(
        tx,
        access,
        user.id,
        d.reportId,
        {
          men: d.men,
          women: d.women,
          children: d.children,
          firstTimers: d.firstTimers,
          workersOnDuty: d.workersOnDuty,
          offeringKobo: d.offering,
          titheKobo: d.tithe,
          specialSeedKobo: d.specialSeed,
          notes: d.notes,
          preacher: d.preacher,
          theme: d.theme,
          typeAttendance: d.typeAttendance,
        },
        d.intent === "submit",
      ),
    );
    revalidatePath(`/reports/${d.reportId}`);
    revalidatePath("/reports");
    return d.intent === "submit" ? "Submitted for verification" : "Draft saved";
  });
}

const transitionSchema = z.object({ reportId: uuid(), to: z.enum(["verify", "send_back", "reopen"]) });

export async function transitionReport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(transitionSchema, fd, async (d) => {
    const { access, user } = await requireAppContext();
    await db.transaction((tx) => transitionReportTx(tx, access, user.id, d.reportId, d.to));
    revalidatePath(`/reports/${d.reportId}`);
    revalidatePath("/reports");
    revalidatePath("/zone");
    return { verify: "Verified. It now counts in Area and Zone totals.", send_back: "Sent back to the Head Usher", reopen: "Reopened. Changes are recorded in the audit log." }[d.to];
  });
}

export async function goToReport(reportId: string) {
  redirect(`/reports/${reportId}`);
}
