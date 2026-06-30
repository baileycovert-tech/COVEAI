import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCustomers, getThreadForCustomer, matchInventory, money } from "../../lib/data";
import { currentUser } from "../../lib/auth";
import { PageHead, Avatar } from "../../components/ui";
import { Handshake, Car, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default function CustomerDetail({ params }: { params: { slug: string } }) {
  const me = currentUser();
  if (!me?.isAdmin) redirect("/");
  const c = getCustomers().find((x) => x.slug === params.slug);
  if (!c) return notFound();
  const matches = matchInventory(c.vehicle_interest);
  const thread = getThreadForCustomer(c, me.slug);

  return (
    <>
      <PageHead
        title={c.name}
        sub={c.vehicle_interest || "Customer record"}
        right={
          <div className="flex gap-sm">
            <Link className="btn" href="/customers">All customers</Link>
            <Link className="btn primary" href={`/outreach?slug=${c.slug}`}>Draft AI message</Link>
          </div>
        }
      />

      <div className="grid cols-3">
        <div className="card pad-lg" style={{ gridColumn: "span 2" }}>
          <div className="flex gap-sm" style={{ marginBottom: 16 }}>
            <Avatar name={c.name} />
            <div>
              <div className="row-title" style={{ fontSize: 16 }}>{c.name}</div>
              <div className="row-sub">{c.stage}{c.source ? ` · ${c.source}` : ""}</div>
            </div>
            {c.hot && <span className="badge hot" style={{ marginLeft: "auto" }}>Hot</span>}
          </div>

          <dl className="kv">
            <dt>Phone</dt><dd>{c.phone || <span className="muted">—</span>}</dd>
            <dt>Email</dt><dd>{c.email || <span className="muted">—</span>}</dd>
            <dt>Vehicle interest</dt><dd>{c.vehicle_interest || <span className="muted">—</span>}</dd>
            <dt>Trade</dt><dd>{c.trade || <span className="muted">—</span>}</dd>
            <dt>Stage</dt><dd><span className="badge">{c.stage || "Lead"}</span></dd>
            <dt>Last touch</dt><dd>{c.last_touch || <span className="muted">—</span>}</dd>
            <dt>Next step</dt><dd style={{ color: "var(--accent-2)", fontWeight: 600 }}>{c.next_step || <span className="muted">—</span>}</dd>
          </dl>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>Summary</div>
            <div className="lead-note" style={{ fontSize: 13, lineHeight: 1.6 }}>{c.notes || "No summary yet."}</div>
          </div>
          {c.personal && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Handshake /></span>Rapport</div>
              <div className="lead-note" style={{ fontSize: 13, lineHeight: 1.6 }}>{c.personal}</div>
            </div>
          )}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Car /></span>In stock that fits</div>
            {matches.length === 0 ? (
              <div className="lead-note" style={{ fontSize: 13 }}>No direct model match in current stock — check <a className="card-link" href="/inventory">full inventory</a> or a dealer-trade.</div>
            ) : (
              matches.map((m) => (
                <div className="row-item" key={m.store + m.model} style={{ padding: "8px 2px" }}>
                  <span className={"badge " + m.store.toLowerCase()}>{m.store}</span>
                  <div className="row-main">
                    <div className="row-title" style={{ fontSize: 13 }}>{m.model}</div>
                    <div className="row-sub">{m.units} in stock · avg {money(m.avgMsrp)}{m.avgDays >= 120 ? " · aged (deal room)" : ""}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {thread.length > 0 && (
        <div className="card pad-lg section-gap">
          <div className="card-title" style={{ marginBottom: 12 }}><span className="ico"><MessageSquare /></span>Conversation <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— {thread.length} message{thread.length === 1 ? "" : "s"} (texts, emails &amp; COVE outreach)</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {thread.map((m, i) => (
              <div key={i} className={"ask-msg " + (m.dir === "out" ? "you" : "bot")} style={{ maxWidth: "80%", alignSelf: m.dir === "out" ? "flex-end" : "flex-start", opacity: (m as any).pending ? 0.7 : 1, border: (m as any).pending ? "1px dashed var(--border-strong)" : undefined }}>
                <div>{m.text}</div>
                <div className="ask-src">
                  {(m as any).pending ? "✎ Draft — not sent yet · " : ""}
                  {(m as any).channel ? `${(m as any).channel} · ` : ""}
                  {(m.at || "").replace("T", " ").slice(0, 16)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-sm" style={{ marginTop: 12 }}>
            <Link className="btn primary sm" href={`/outreach?slug=${c.slug}`}><MessageSquare size={14} /> Draft / send a message</Link>
          </div>
        </div>
      )}
    </>
  );
}
