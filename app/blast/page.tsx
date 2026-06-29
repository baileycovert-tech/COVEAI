import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { outreachTargetsFor } from "../lib/data";
import { getSendingStatus } from "../lib/user-sending";
import { PageHead } from "../components/ui";
import RepNudge from "../components/RepNudge";
import BlastClient from "./BlastClient";

export const dynamic = "force-dynamic";

export default function BlastPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  // Scope the audience to the viewer — a rep only ever blasts their OWN customers, never the
  // shared/owner book. (Empty until their leads ingest, so show the same nudge as the other tools.)
  if (!me.isAdmin && !me.manager) return (<><PageHead title="Blast" sub="Email your customers" /><RepNudge what="customers to message" /></>);
  const customers = outreachTargetsFor(me).map((c) => ({
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
