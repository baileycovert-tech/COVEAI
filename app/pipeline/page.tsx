import { redirect } from "next/navigation";
import { getPipeline } from "../lib/data";
import { currentUser } from "../lib/auth";
import { getRemoved } from "../lib/leads-state";
import { PageHead, LivePill } from "../components/ui";
import PipelineClient from "./PipelineClient";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  if (!currentUser()?.isAdmin) redirect("/");
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
