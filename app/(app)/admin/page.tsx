import { PageHeader } from "@/components/app/page-header";
import { requireAppContext } from "@/lib/auth/context";

export const metadata = { title: "Admin" };

export default async function Page() {
  await requireAppContext();
  return <PageHeader title="Admin" subtitle="Coming in a later milestone." />;
}
