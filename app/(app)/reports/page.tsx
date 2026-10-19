import { PageHeader } from "@/components/app/page-header";
import { requireAppContext } from "@/lib/auth/context";

export const metadata = { title: "Reports" };

export default async function Page() {
  await requireAppContext();
  return <PageHeader title="Reports" subtitle="Coming in a later milestone." />;
}
