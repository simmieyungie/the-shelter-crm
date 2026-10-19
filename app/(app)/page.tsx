import { redirect } from "next/navigation";
import { NAV_HOME, requireAppContext } from "@/lib/auth/context";

export default async function Home() {
  const { nav } = await requireAppContext();
  if (nav.length > 0) redirect(NAV_HOME[nav[0]]);
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
      <h1 className="text-lg font-semibold">No access yet</h1>
      <p className="mt-2 text-sm text-subtle">
        Your account has no active role. Ask your parish pastor or the system administrator to add you.
      </p>
    </div>
  );
}
