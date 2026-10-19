"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div role="alert" className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
      <h1 className="text-lg font-semibold">{offline ? "You're offline" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-subtle">
        {offline
          ? "This page needs a connection. Counts you've made are saved on this phone and send when you're back online."
          : "The page couldn't load. Try again, and if it keeps happening tell your parish administrator."}
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-subtle">Ref: {error.digest}</p>}
      <Button className="mt-4 h-11" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
