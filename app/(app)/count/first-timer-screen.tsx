"use client";

import { ChevronLeft, ScanLine } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enqueueCheckin, enqueueMemberCreate, updateTally } from "@/lib/offline/outbox";
import { serviceLabel, type ScreenProps } from "./count-types";

type Match = { id: string; firstName: string; lastName: string; status: string };

export function FirstTimerScreen({ bootstrap, service, zone, identity, tally, online, go }: ScreenProps & { parishName: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [sameWhatsapp, setSameWhatsapp] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dupe, setDupe] = useState<{ matches: Match[]; then: "again" | "finish" } | null>(null);
  const toGo = Math.max(0, (tally?.firstTimers ?? 0) - (tally?.registeredFirstTimers ?? 0));

  function read() {
    const fd = new FormData(formRef.current!);
    const fullName = String(fd.get("fullName") ?? "").trim().replace(/\s+/g, " ");
    const phone = String(fd.get("phone") ?? "").trim();
    const whatsapp = String(fd.get("whatsapp") ?? "").trim();
    const [firstName, ...rest] = fullName.split(" ");
    const errs: Record<string, string> = {};
    if (!fullName) errs.fullName = "Enter their name";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) errs.phone = "Enter an 11-digit number like 0803 123 4567";
    return {
      errs,
      payload: {
        serviceEventId: service.eventId,
        firstName: firstName ?? "",
        lastName: rest.join(" "),
        phone: digits.startsWith("234") ? `+${digits}` : phone,
        whatsappPhone: sameWhatsapp ? (digits.startsWith("234") ? `+${digits}` : phone) : whatsapp || null,
        gender: (fd.get("gender") as "MALE" | "FEMALE" | null) ?? null,
        smallGroupId: (fd.get("smallGroupId") as string) || null,
        consentContact: fd.get("consent") === "on",
      },
    };
  }

  async function save(then: "again" | "finish", force = false) {
    const { errs, payload } = read();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (online && !force) {
        try {
          const res = await fetch(`/api/v1/members/check-phone?parishId=${bootstrap.parishId}&phone=${encodeURIComponent(payload.phone)}`);
          if (res.ok) {
            const body = (await res.json()) as { valid: boolean; matches: Match[] };
            if (!body.valid) {
              setErrors({ phone: "That number doesn't look right" });
              return;
            }
            if (body.matches.length) {
              setDupe({ matches: body.matches, then });
              return;
            }
          }
        } catch {
          /* offline mid-way: save anyway */
        }
      }
      await enqueueMemberCreate(bootstrap.userId, { ...payload, allowDuplicatePhone: force }, `${payload.firstName} ${payload.lastName}`.trim());
      await updateTally(identity, (t) => ({ registeredFirstTimers: t.registeredFirstTimers + 1 }));
      toast.success(`${payload.firstName} saved${online ? "" : " on this device"}`);
      setDupe(null);
      formRef.current?.reset();
      setSameWhatsapp(true);
      if (then === "finish") go("tally");
      else formRef.current?.querySelector<HTMLInputElement>("#fullName")?.focus();
    } finally {
      setSaving(false);
    }
  }

  async function markExisting(m: Match, then: "again" | "finish") {
    await enqueueCheckin(bootstrap.userId, service.eventId, m.id, `${m.firstName} ${m.lastName}`);
    await updateTally(identity, (t) => ({ registeredFirstTimers: t.registeredFirstTimers + 1 }));
    toast.success(`${m.firstName} marked present`);
    setDupe(null);
    formRef.current?.reset();
    if (then === "finish") go("tally");
  }

  return (
    <div className="mx-auto max-w-[560px] space-y-4">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => go("tally")} aria-label="Back to tally" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted">
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div>
          <h1 className="text-xl font-semibold leading-tight">First-timer</h1>
          <p className="text-sm text-subtle">
            {serviceLabel(service)} · {zone.name}
            {toGo > 0 ? ` · ${toGo} to go` : ""}
          </p>
        </div>
      </div>

      <div role="tablist" aria-label="How to capture" className="grid grid-cols-2 rounded-xl bg-muted p-1">
        <button type="button" role="tab" aria-selected={false} disabled className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm text-subtle opacity-60">
          <ScanLine className="size-4" aria-hidden /> Scan guest card
        </button>
        <button type="button" role="tab" aria-selected className="min-h-11 rounded-lg bg-surface text-sm font-medium text-brand shadow-sm">
          Type details
        </button>
      </div>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); void save("finish"); }} className="space-y-4 rounded-2xl border border-line bg-surface p-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">
            Full name <span className="text-danger-text">*</span>
          </Label>
          <Input id="fullName" name="fullName" autoComplete="off" autoCapitalize="words" className="h-12" aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "fullName-err" : undefined} />
          {errors.fullName && <p id="fullName-err" className="text-xs text-danger-text">{errors.fullName}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">
            Phone <span className="text-danger-text">*</span>
          </Label>
          <div className="flex">
            <span className="grid h-12 place-items-center rounded-l-lg border border-r-0 border-line bg-muted px-3 font-mono text-sm text-subtle">+234</span>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0803 123 4567" className="h-12 rounded-l-none font-mono" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-err" : undefined} />
          </div>
          {errors.phone && <p id="phone-err" className="text-xs text-danger-text">{errors.phone}</p>}
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={sameWhatsapp} onChange={(e) => setSameWhatsapp(e.target.checked)} className="size-5 accent-[var(--brand)]" />
          <span className="text-sm">Same number on WhatsApp</span>
        </label>
        {!sameWhatsapp && (
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp number</Label>
            <Input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" className="h-12 font-mono" />
          </div>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Gender</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["FEMALE", "Female"],
              ["MALE", "Male"],
            ].map(([v, l]) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="radio" name="gender" value={v} className="size-4 accent-[var(--brand)]" />
                <span className="text-sm">{l}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="smallGroupId">Nearest Tribe</Label>
          <select id="smallGroupId" name="smallGroupId" className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-sm">
            <option value="">Not sure yet</option>
            {bootstrap.tribes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.landmark ? ` (${t.landmark})` : ""}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-start gap-3">
          <input type="checkbox" name="consent" className="mt-0.5 size-5 accent-[var(--brand)]" />
          <span className="text-sm">They&apos;re happy for the church to call or message them</span>
        </label>

        {dupe && (
          <div role="alert" className="space-y-2 rounded-xl border border-warning/40 bg-warning-bg p-3 text-sm text-warning-text">
            <p className="font-medium">This number is already used by:</p>
            {dupe.matches.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <span>
                  {m.firstName} {m.lastName}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => markExisting(m, dupe.then)}>
                  It&apos;s them · mark present
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => save(dupe.then, true)}>
              Different person · save anyway
            </Button>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" className="h-12" disabled={saving} onClick={() => save("again")}>
            Save &amp; add another
          </Button>
          <Button type="submit" className="h-12" disabled={saving}>
            Save &amp; finish
          </Button>
        </div>
        {!online && <p className="text-xs text-subtle">Saved on this device. Sends automatically when you&apos;re back online.</p>}
      </form>
    </div>
  );
}

