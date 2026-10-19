/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Page navigations: network first, fall back to the last cached copy when offline.
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin && request.mode === "navigate" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/login"),
      handler: new NetworkFirst({ cacheName: "pages-nav", networkTimeoutSeconds: 5 }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

// Background Sync: wake any open page and ask it to drain its outbox.
self.addEventListener("sync", (event) => {
  const e = event as ExtendableEvent & { tag?: string };
  if (e.tag !== "outbox") return;
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: "run-sync" }));
    }),
  );
});

// Signing out clears cached pages so the next person on a shared phone can't see them.
self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-page-caches") {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => !k.includes("static") && !k.includes("font") && !k.includes("precache")).map((k) => caches.delete(k))),
      ),
    );
  }
});

serwist.addEventListeners();
