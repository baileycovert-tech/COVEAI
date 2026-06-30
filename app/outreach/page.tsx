import { redirect } from "next/navigation";
import { outreachTargetsFor, outreachQueueFor } from "../lib/data";
import { currentUser } from "../lib/auth";
import { PageHead } from "../components/ui";
import RepNudge from "../components/RepNudge";
import OutreachClient from "./OutreachClient";

export const dynamic = "force-dynamic";

export default function OutreachPage({ searchParams }: { searchParams: { slug?: string } }) {
  const me = currentUser();
  if (!me) redirect("/login");
  const customers = outreachTargetsFor(me)
    .map((c) => ({
      slug: c.slug, name: c.name, vehicle: c.vehicle_interest, next: c.next_step, hot: c.hot,
      hasPhone: !!c.phone, hasEmail: !!c.email,
    }));
  // Every rep sees THEIR OWN queue (auto-drafts + manual). No leads yet → setup nudge.
  const queue = outreachQueueFor(me.slug);
  if (!me.isAdmin && !me.manager && customers.length === 0 && queue.length === 0) {
    return (<><PageHead title="AI Outreach" sub="Draft messages to your customers" /><RepNudge what="customers to message" /></>);
  }
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
