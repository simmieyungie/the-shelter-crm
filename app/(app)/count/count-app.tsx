"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOnline } from "@/components/app/sync-pill";
import type { FormAction } from "@/components/app/entity-form";
import type { CountBootstrap } from "@/lib/db/queries/count";
import { offlineDb, tallyKey, zoneKey } from "@/lib/offline/db";
import { restoreTally, updateTally, type TallyIdentity } from "@/lib/offline/outbox";
import { ChooseScreen } from "./choose-screen";
import { FirstTimerScreen } from "./first-timer-screen";
import { ReturningScreen } from "./returning-screen";
import { ReviewScreen } from "./review-screen";
import { TallyScreen } from "./tally-screen";

import type { Step } from "./count-types";
type UiState = { date: string; step: Step; eventId: string | null; zoneId: string | null };

const uiKey = (b: CountBootstrap) => `count-ui:${b.userId}:${b.parishId}`;

export function CountApp({ bootstrap, parishName, addServiceToday }: { bootstrap: CountBootstrap; parishName: string; addServiceToday: FormAction }) {
  const online = useOnline();
  const [ui, setUi] = useState<UiState>({ date: bootstrap.date, step: "choose", eventId: bootstrap.services[0]?.eventId ?? null, zoneId: null });
  const [restored, setRestored] = useState(false);

  // Restore where the usher was (survives reloads, including offline ones).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(uiKey(bootstrap)) ?? "null") as UiState | null;
      if (saved && saved.date === bootstrap.date && bootstrap.services.some((s) => s.eventId === saved.eventId)) setUi(saved);
    } catch {
      /* ignore */
    }
    setRestored(true);
  }, [bootstrap]);
  useEffect(() => {
    if (restored) localStorage.setItem(uiKey(bootstrap), JSON.stringify(ui));
  }, [ui, restored, bootstrap]);

  // Cache the bootstrap and merge in the server's copy of this usher's tallies and other ushers' sums.
  useEffect(() => {
    const db = offlineDb();
    void db.cache.put({ key: `count:${bootstrap.userId}:${bootstrap.parishId}`, value: bootstrap, savedAt: Date.now() });
    for (const t of bootstrap.myTallies) {
      const id = { key: tallyKey(bootstrap.userId, t.serviceEventId, t.sanctuaryZoneId), userId: bootstrap.userId, serviceEventId: t.serviceEventId, sanctuaryZoneId: t.sanctuaryZoneId };
      void restoreTally(id, t);
    }
    void db.transaction("rw", db.zoneTotals, async () => {
      for (const z of bootstrap.zoneTotals) {
        const key = zoneKey(z.serviceEventId, z.sanctuaryZoneId);
        const existing = await db.zoneTotals.get(key);
        if (!existing || existing.fetchedAt < Date.now() - 5_000) await db.zoneTotals.put({ ...z, key, fetchedAt: Date.now() });
      }
    });
  }, [bootstrap]);

  const service = bootstrap.services.find((s) => s.eventId === ui.eventId) ?? null;
  const zone = bootstrap.zones.find((z) => z.id === ui.zoneId) ?? null;
  const identity: TallyIdentity | null = useMemo(
    () =>
      service && zone
        ? { key: tallyKey(bootstrap.userId, service.eventId, zone.id), userId: bootstrap.userId, serviceEventId: service.eventId, sanctuaryZoneId: zone.id }
        : null,
    [service, zone, bootstrap.userId],
  );
  const tally = useLiveQuery(() => (identity ? offlineDb().tallies.get(identity.key) : undefined), [identity?.key]);
  const others = useLiveQuery(() => (identity ? offlineDb().zoneTotals.get(zoneKey(identity.serviceEventId, identity.sanctuaryZoneId)) : undefined), [identity?.key]);

  // Refresh "Zone so far" every 15 s while counting online.
  useEffect(() => {
    if (!identity || !online || ui.step !== "tally") return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/v1/zone-totals?event=${identity.serviceEventId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { zoneTotals: CountBootstrap["zoneTotals"] };
        const db = offlineDb();
        await db.zoneTotals.bulkPut(body.zoneTotals.map((z) => ({ ...z, key: zoneKey(z.serviceEventId, z.sanctuaryZoneId), fetchedAt: Date.now() })));
      } catch {
        /* offline or server busy: keep the last numbers */
      }
    };
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [identity, online, ui.step]);

  const change = useCallback(
    (field: "men" | "women" | "children" | "firstTimers", delta: number) => {
      if (!identity) return;
      void updateTally(identity, (t) => ({ [field]: t[field] + delta }));
    },
    [identity],
  );
  const go = (step: Step) => {
    setUi((u) => ({ ...u, step }));
    window.scrollTo({ top: 0 });
  };

  if (!restored) return null;

  if (ui.step === "choose" || !service || !zone || !identity) {
    return (
      <ChooseScreen
        bootstrap={bootstrap}
        eventId={ui.eventId}
        zoneId={ui.zoneId}
        onEvent={(eventId) => setUi((u) => ({ ...u, eventId }))}
        onZone={(zoneId) => setUi((u) => ({ ...u, zoneId }))}
        onStart={() => go("tally")}
        addServiceToday={addServiceToday}
        online={online}
      />
    );
  }

  const props = { bootstrap, service, zone, identity, tally, others, online, go };
  switch (ui.step) {
    case "tally":
      return <TallyScreen {...props} change={change} />;
    case "firstTimer":
      return <FirstTimerScreen {...props} parishName={parishName} />;
    case "review":
      return <ReviewScreen {...props} />;
    case "returning":
      return <ReturningScreen {...props} />;
  }
}
