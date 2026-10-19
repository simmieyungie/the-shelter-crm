export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-subtle">
          This page hasn&apos;t been saved on this device yet. Open Count while you&apos;re online and it will keep
          working offline afterwards. Anything you counted is saved and sends automatically when you&apos;re back.
        </p>
      </div>
    </main>
  );
}
