import { PageHeader } from "@/components/app/page-header";
import { requireAppContext } from "@/lib/auth/context";

export const metadata = { title: "Members" };

export default async function Page() {
  await requireAppContext();
  return <PageHeader title="Members" subtitle="Coming in a later milestone." />;
}
