import { PageHeader } from "@/components/app/page-header";
import { requireAppContext } from "@/lib/auth/context";

export const metadata = { title: "Tasks" };

export default async function Page() {
  await requireAppContext();
  return <PageHeader title="Tasks" subtitle="Coming in a later milestone." />;
}
