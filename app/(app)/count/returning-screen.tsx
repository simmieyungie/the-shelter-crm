"use client";

import { ChevronLeft, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StatusPill } from "@/components/app/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDay } from "@/lib/dates";
import { MEMBER_STATUS_LABELS } from "@/lib/labels";
import { enqueueCheckin } from "@/lib/offline/outbox";
import type { MemberStatus } from "@/lib/db/schema";
import { serviceLabel, type ScreenProps } from "./count-types";

type Result = { id: string; firstName: string; lastName: string; phone: string | null; status: MemberStatus; firstVisitOn: string | null };

export function ReturningScreen({ bootstrap, service, online, go }: ScreenProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [marked, setMarked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!online || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/members/search?parishId=${bootstrap.parishId}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setResults(((await res.json()) as { members: Result[] }).members);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, online, bootstrap.parishId]);

  async function mark(r: Result) {
    await enqueueCheckin(bootstrap.userId, service.eventId, r.id, `${r.firstName} ${r.lastName}`);
    setMarked((m) => new Set(m).add(r.id));
    toast.success(`${r.firstName} marked present`);
  }

  return (
    <div className="mx-auto max-w-[560px] space-y-4">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => go("tally")} aria-label="Back to tally" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted">
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div>
          <h1 className="text-xl font-semibold leading-tight">Returning guest</h1>
          <p className="text-sm text-subtle">Mark someone present at {serviceLabel(service)}. This is how we know first-timers came back.</p>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone number" aria-label="Search by name or phone" className="h-12 pl-9" disabled={!online} />
      </div>
      {!online && <p className="rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning-text">Searching needs a connection. Register them as a first-timer for now and the Secretary can merge the records later.</p>}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {results.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">
                {r.firstName} {r.lastName}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                <StatusPill tone={r.status === "FIRST_TIMER" ? "brand" : "neutral"}>{MEMBER_STATUS_LABELS[r.status]}</StatusPill>
                {r.firstVisitOn && <span>First came {formatDay(r.firstVisitOn)}</span>}
              </p>
            </div>
            <Button size="sm" variant={marked.has(r.id) ? "secondary" : "default"} disabled={marked.has(r.id)} onClick={() => mark(r)} className="h-10">
              {marked.has(r.id) ? "Present" : "Mark present"}
            </Button>
          </li>
        ))}
        {online && q.trim().length >= 2 && results.length === 0 && <li className="p-4 text-sm text-subtle">No one found.</li>}
      </ul>
    </div>
  );
}
