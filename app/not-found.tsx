import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-subtle">That page doesn&apos;t exist, or it belongs to a parish you can&apos;t see.</p>
        <Link href="/" className="mt-4 inline-flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white">
          Go home
        </Link>
      </div>
    </main>
  );
}
