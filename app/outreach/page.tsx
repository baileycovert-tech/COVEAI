import { redirect } from "next/navigation";
import { getCustomers, getOutreachQueue } from "../lib/data";
import { currentUser } from "../lib/auth";
import OutreachClient from "./OutreachClient";

export const dynamic = "force-dynamic";

export default function OutreachPage({ searchParams }: { searchParams: { slug?: string } }) {
  if (!currentUser()?.isAdmin) redirect("/");
  const customers = getCustomers()
    .filter((c) => c.status !== "closed")
    .map((c) => ({
      slug: c.slug, name: c.name, vehicle: c.vehicle_interest, next: c.next_step, hot: c.hot,
      hasPhone: !!c.phone, hasEmail: !!c.email,
    }));
  const queue = getOutreachQueue();
  const aiEnabled = !!process.env.ANTHROPIC_API_KEY;
  return (
    <OutreachClient
      customers={customers}
      initialQueue={queue}
      aiEnabled={aiEnabled}
      preselect={searchParams.slug || ""}
    />
  );
}
