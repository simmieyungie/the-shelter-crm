import { redirect } from "next/navigation";
import { requireParishContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getCountBootstrap } from "@/lib/db/queries/count";
import { addServiceToday } from "./actions";
import { CountApp } from "./count-app";

export const metadata = { title: "Headcount" };
export const dynamic = "force-dynamic";

export default async function CountPage() {
  const { access, parish, user } = await requireParishContext();
  if (!can(access, "submitTally", parish.id)) redirect("/");
  const bootstrap = await getCountBootstrap(access, parish.id, user);
  return <CountApp bootstrap={bootstrap} parishName={parish.name} addServiceToday={addServiceToday} />;
}
