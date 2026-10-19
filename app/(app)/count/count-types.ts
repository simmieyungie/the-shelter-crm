import type { CountBootstrap, CountService } from "@/lib/db/queries/count";
import type { CachedZoneTotal, LocalTally } from "@/lib/offline/db";
import type { TallyIdentity } from "@/lib/offline/outbox";

export type Step = "choose" | "tally" | "firstTimer" | "review" | "returning";

export type ScreenProps = {
  bootstrap: CountBootstrap;
  service: CountService;
  zone: CountBootstrap["zones"][number];
  identity: TallyIdentity;
  tally: LocalTally | undefined;
  others: CachedZoneTotal | undefined;
  online: boolean;
  go: (step: Step) => void;
};

export function serviceLabel(s: CountService) {
  return s.maxPerDay > 1 ? `${s.name} · ${ordinalShort(s.occurrence)}` : s.name;
}

function ordinalShort(n: number) {
  const sfx = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]);
}
