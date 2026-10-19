import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForms } from "./login-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="bg-brand px-4 pb-16 pt-[calc(env(safe-area-inset-top)+2.5rem)] text-white">
        <div className="mx-auto flex max-w-sm items-center gap-3">
          <Logo />
          <div>
            <p className="text-lg font-semibold leading-tight">Parish CRM</p>
            <p className="text-sm text-white/75">Attendance, reports and follow-up</p>
          </div>
        </div>
      </div>
      <div className="-mt-10 px-4 pb-10">
        <div className="mx-auto max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
          {error === "link" && (
            <p role="alert" className="mb-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
              That sign-in link has expired or was already used. Request a new one.
            </p>
          )}
          <LoginForms next={next} />
        </div>
      </div>
    </main>
  );
}

function Logo() {
  return (
    <div aria-hidden className="grid size-11 place-items-center rounded-xl bg-white/15 text-lg font-bold">
      PC
    </div>
  );
}
