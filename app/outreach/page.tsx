import { redirect } from "next/navigation";
import { outreachTargetsFor, getOutreachQueue } from "../lib/data";
import { currentUser } from "../lib/auth";
import { PageHead } from "../components/ui";
import RepNudge from "../components/RepNudge";
import OutreachClient from "./OutreachClient";

export const dynamic = "force-dynamic";

export default function OutreachPage({ searchParams }: { searchParams: { slug?: string } }) {
  const me = currentUser();
  if (!me) redirect("/login");
  if (!me.isAdmin && !me.manager) return (<><PageHead title="AI Outreach" sub="Draft messages to your customers" /><RepNudge what="customers to message" /></>);
  const customers = outreachTargetsFor(me)
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
