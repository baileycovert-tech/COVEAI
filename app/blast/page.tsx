import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { getOutreachTargets } from "../lib/data";
import { getSendingStatus } from "../lib/user-sending";
import { PageHead } from "../components/ui";
import BlastClient from "./BlastClient";

export const dynamic = "force-dynamic";

export default function BlastPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  const customers = getOutreachTargets().map((c) => ({
    slug: c.slug, name: c.name, vehicle: c.vehicle_interest || "", stage: c.stage || "",
    hasEmail: !!c.email, hasPhone: !!c.phone, hot: !!c.hot,
  }));
  return (
    <>
      <PageHead title="Blast" sub={`Send one message to a batch of your customers, ${me.name.split(/\s+/)[0]}`} />
      <BlastClient customers={customers} sending={getSendingStatus(me.slug)} />
    </>
  );
}
