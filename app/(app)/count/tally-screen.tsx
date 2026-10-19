"use client";

import { ChevronLeft, UserCheck, UserPlus } from "lucide-react";
import { TallyCounter } from "@/components/app/tally-counter";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/dates";
import { serviceLabel, type ScreenProps } from "./count-types";

export function TallyScreen({
  service,
  zone,
  tally,
  others,
  online,
  go,
  change,
}: ScreenProps & { change: (field: "men" | "women" | "children" | "firstTimers", delta: number) => void }) {
  const men = tally?.men ?? 0;
  const women = tally?.women ?? 0;
  const children = tally?.children ?? 0;
  const firstTimers = tally?.firstTimers ?? 0;
  const mine = men + women + children;
  const otherSum = others ? others.others.men + others.others.women + others.others.children : 0;
  const toGo = Math.max(0, firstTimers - (tally?.registeredFirstTimers ?? 0));
  const updated = others ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(others.fetchedAt) : null;

  return (
    <div className="mx-auto max-w-[560px] space-y-4">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => go("choose")} aria-label="Back to service and zone" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted">
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">{zone.name}</h1>
          <p className="text-sm text-subtle">
            {serviceLabel(service)} · <span className="font-mono">{formatTime(service.startTime)}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-brand p-4 text-white">
          <p className="text-xs font-medium text-white/75">Your count</p>
          <p data-testid="your-count" className="font-mono text-[52px] font-semibold leading-none tabular-nums">
            {mine}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-subtle">Zone so far</p>
          <p data-testid="zone-so-far" className="font-mono text-[40px] font-semibold leading-none tabular-nums text-ink">
            {mine + otherSum}
          </p>
          <p className="mt-1 text-[11px] text-subtle">
            {!online ? (updated ? `Offline · others as of ${updated}` : "Offline · yours only") : others?.otherUshers.length ? `With ${others.otherUshers.join(", ")}` : "Only you so far"}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <TallyCounter label="Men" value={men} onChange={(d) => change("men", d)} testId="counter-men" />
        <TallyCounter label="Women" value={women} onChange={(d) => change("women", d)} testId="counter-women" />
        <TallyCounter label="Children" value={children} onChange={(d) => change("children", d)} testId="counter-children" />
        <TallyCounter label="First-timers" hint="Already counted above" value={firstTimers} steps={[1]} onChange={(d) => change("firstTimers", d)} testId="counter-first-timers" />
      </div>

      <div className="grid gap-2">
        <Button variant="outline" className="h-12 justify-start gap-2 text-base" onClick={() => go("firstTimer")}>
          <UserPlus className="size-5" aria-hidden />
          {toGo > 0 ? `Register first-timer details · ${toGo} to go` : "Register a first-timer"}
        </Button>
        <Button variant="ghost" className="h-11 justify-start gap-2" onClick={() => go("returning")}>
          <UserCheck className="size-5" aria-hidden /> Mark a returning guest present
        </Button>
        <Button className="h-12 text-base" onClick={() => go("review")}>
          Review &amp; submit headcount
        </Button>
      </div>
    </div>
  );
}
