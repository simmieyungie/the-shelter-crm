"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, CircleCheck, CloudOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { offlineDb } from "@/lib/offline/db";
import { syncNow } from "@/lib/offline/sync";
import { serviceLabel, type ScreenProps } from "./count-types";

export function ReviewScreen({ bootstrap, service, zone, tally, online, go }: ScreenProps) {
  const [submitted, setSubmitted] = useState(false);
  const waiting = useLiveQuery(() => offlineDb().outbox.where("[userId+status]").equals([bootstrap.userId, "pending"]).count(), [], 0);
  const rows: [string, number][] = [
    ["Men", tally?.men ?? 0],
    ["Women", tally?.women ?? 0],
    ["Children", tally?.children ?? 0],
  ];
  const total = rows.reduce((a, [, v]) => a + v, 0);
  const firstTimers = tally?.firstTimers ?? 0;
  const registered = tally?.registeredFirstTimers ?? 0;

  async function submit() {
    setSubmitted(true);
    await syncNow();
  }

  return (
    <div className="mx-auto max-w-[560px] space-y-4">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => go("tally")} aria-label="Back to tally" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted">
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div>
          <h1 className="text-xl font-semibold leading-tight">Review headcount</h1>
          <p className="text-sm text-subtle">
            {zone.name} · {serviceLabel(service)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {rows.map(([label, v]) => (
              <tr key={label}>
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  {label}
                </th>
                <td className="px-4 py-3 text-right font-mono text-base">{v}</td>
              </tr>
            ))}
            <tr className="bg-brand-soft">
              <th scope="row" className="px-4 py-3 text-left font-semibold">
                Total
              </th>
              <td data-testid="review-total" className="px-4 py-3 text-right font-mono text-lg font-semibold">
                {total}
              </td>
            </tr>
            <tr>
              <th scope="row" className="px-4 py-3 text-left font-medium">
                First-timers <span className="font-normal text-subtle">(in the total)</span>
              </th>
              <td className="px-4 py-3 text-right font-mono text-base">{firstTimers}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {firstTimers > registered && (
        <p className="rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning-text">
          {firstTimers - registered} first-timer{firstTimers - registered === 1 ? "" : "s"} still without details.{" "}
          <button type="button" className="font-semibold underline" onClick={() => go("firstTimer")}>
            Register now
          </button>
        </p>
      )}

      <Button className="h-12 w-full text-base" onClick={submit}>
        Submit headcount
      </Button>
      {!online ? (
        <p data-testid="offline-note" className="flex items-start gap-2 text-sm text-subtle">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          Saved on this device. Sends automatically when you&apos;re back online.
        </p>
      ) : submitted && waiting === 0 ? (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-success-bg px-3 py-2 text-sm text-success-text">
          <CircleCheck className="size-4" aria-hidden /> Headcount sent. The Head Usher will see it on the service report.
        </p>
      ) : submitted ? (
        <p role="status" className="text-sm text-subtle">
          Sending…
        </p>
      ) : (
        <p className="text-sm text-subtle">Your counts are saved as you tap. You can keep counting after submitting.</p>
      )}
    </div>
  );
}
