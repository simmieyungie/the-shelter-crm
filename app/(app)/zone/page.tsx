import { PageHeader } from "@/components/app/page-header";
import { requireAppContext } from "@/lib/auth/context";

export const metadata = { title: "Zone overview" };

export default async function Page() {
  await requireAppContext();
  return <PageHeader title="Zone overview" subtitle="Coming in a later milestone." />;
}
