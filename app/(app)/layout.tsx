import { AccountMenu } from "@/components/app/account-menu";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { MobileTitle } from "@/components/app/mobile-title";
import { SideNav } from "@/components/app/side-nav";
import { SyncPill } from "@/components/app/sync-pill";
import { requireAppContext } from "@/lib/auth/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, parish, parishes, nav } = await requireAppContext();
  const place = parish ? [parish.areaName, parish.zoneName, parish.regionName].join(" · ") : "Oversight";
  const showAdmin = nav.includes("admin");

  return (
    <div className="min-h-dvh">
      {/* Desktop top bar */}
      <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 bg-brand px-5 text-white md:flex">
        <div aria-hidden className="grid size-9 place-items-center rounded-lg bg-white/15 text-sm font-bold">
          PC
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight" data-testid="parish-name">
            {parish?.name ?? "Parish CRM"}
          </p>
          <p className="truncate text-xs text-white/70">{place}</p>
        </div>
        <SyncPill userId={user.id} />
        <AccountMenu userId={user.id} name={user.name} parishes={parishes} currentParishId={parish?.id ?? null} showAdmin={showAdmin} />
      </header>

      {/* Phone app bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-brand px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white md:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight">
            <MobileTitle nav={nav} />
          </p>
          <p className="truncate text-xs text-white/70">{parish?.name ?? place}</p>
        </div>
        <SyncPill userId={user.id} />
        <AccountMenu userId={user.id} name={user.name} parishes={parishes} currentParishId={parish?.id ?? null} showAdmin={showAdmin} />
      </header>

      <div className="md:flex">
        <aside
          data-testid="side-nav"
          className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[232px] shrink-0 border-r border-line bg-surface md:block"
        >
          <SideNav nav={nav} />
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-5 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto w-full max-w-[1180px]">{children}</div>
        </main>
      </div>

      <BottomTabs nav={nav} />
    </div>
  );
}
