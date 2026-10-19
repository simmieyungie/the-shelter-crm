"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginWithPassword, requestMagicLink, type LoginState } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export function LoginForms({ next }: { next?: string }) {
  const [mode, setMode] = useState<"password" | "email">("password");
  const [pwState, pwAction, pwPending] = useActionState<LoginState, FormData>(loginWithPassword, {});
  const [mlState, mlAction, mlPending] = useActionState<LoginState, FormData>(requestMagicLink, {});

  return (
    <div>
      <div role="tablist" aria-label="Sign-in method" className="mb-5 grid grid-cols-2 rounded-xl bg-muted p-1">
        {(
          [
            ["password", "Phone & password"],
            ["email", "Email link"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn(
              "min-h-11 rounded-lg text-sm font-medium transition-colors",
              mode === key ? "bg-surface text-brand shadow-sm" : "text-subtle",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form action={pwAction} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Phone number or email</Label>
            <Input id="identifier" name="identifier" autoComplete="username" required className="h-11" placeholder="0803 123 4567" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
          </div>
          {pwState.error && (
            <p role="alert" className="text-sm text-danger-text">
              {pwState.error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full text-base" disabled={pwPending}>
            {pwPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : (
        <form action={mlAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className="h-11" />
          </div>
          {mlState.error && (
            <p role="alert" className="text-sm text-danger-text">
              {mlState.error}
            </p>
          )}
          {mlState.message && (
            <p role="status" className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success-text">
              {mlState.message}
            </p>
          )}
          <Button type="submit" className="h-11 w-full text-base" disabled={mlPending}>
            {mlPending ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>
      )}
    </div>
  );
}
