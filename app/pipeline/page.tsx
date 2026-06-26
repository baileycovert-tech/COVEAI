import { redirect } from "next/navigation";
import { getPipeline } from "../lib/data";
import { currentUser } from "../lib/auth";
import { getRemoved } from "../lib/leads-state";
import { PageHead, LivePill } from "../components/ui";
import RepNudge from "../components/RepNudge";
import PipelineClient from "./PipelineClient";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  const me = currentUser();
  if (!me) redirect("/login");
  if (!me.isAdmin) return (<><PageHead title="Pipeline" sub="Your leads in motion" /><RepNudge what="leads" /></>);
  const p = getPipeline();
  const total = p.columns.reduce((n, c) => n + c.leads.length, 0);
  const removed = getRemoved();

  return (
    <>
      <PageHead
        title="Pipeline"
        sub={`${total} leads in motion · ${p.standing}`}
        right={<LivePill text={`Refreshed ${p.last_refresh}`} />}
      />
      <PipelineClient columns={p.columns as any} removed={removed} />
    </>
  );
}
