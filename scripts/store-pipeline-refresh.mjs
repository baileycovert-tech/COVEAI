#!/usr/bin/env node
/**
 * store-pipeline-refresh.mjs — the WHOLE-STORE active-lead pipeline for the owner/admin view.
 *
 * dms-refresh.mjs pulls only Bailey's leads (his personal board). This pulls every rep's active
 * leads from scorecard_leads (the live GMReview CRM) into data/store-leads.json so the admin can
 * see the store pipeline and zoom into any employee. Read-only; runs on the same cron cadence.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const DMS_URL = process.env.DMS_MCP_URL || "https://gmmcp.slaxer07.com/sse";
const log = (...a) => console.log(new Date().toISOString(), "store-pipeline:", ...a);
const cleanSource = (s) => (/ask the question/i.test(s || "") ? "CRM" : (s || "CRM"));

async function main() {
  const client = new Client({ name: "covert-crm-store-pipeline", version: "1.0.0" }, { capabilities: {} });
  const deadline = setTimeout(() => { log("hard timeout"); process.exit(1); }, 90000);
  await client.connect(new SSEClientTransport(new URL(DMS_URL)));
  const q = async (sql) => {
    const r = await client.callTool({ name: "run_query", arguments: { sql } });
    const txt = r?.content?.find?.((c) => c.type === "text")?.text ?? r?.content?.[0]?.text ?? "[]";
    const j = JSON.parse(txt);
    if (j && j.error) throw new Error(j.error);
    return j;
  };

  const WINDOW = "lead_status_type = 'Active' AND lead_origination_date >= (CURRENT_DATE - INTERVAL '60 days') AND sales_rep IS NOT NULL AND sales_rep <> ''";

  // Per-rep active counts (full — every rep), + last-3-day touch count (working the pipeline?).
  const agg = await q(
    `SELECT sales_rep AS rep, COUNT(*) AS active,
            COUNT(*) FILTER (WHERE last_attempted_or_actual >= CURRENT_DATE - INTERVAL '3 days') AS touched3d
     FROM scorecard_leads WHERE ${WINDOW} GROUP BY sales_rep ORDER BY active DESC`
  );
  const byRep = {};
  let activeTotal = 0;
  for (const r of agg) { byRep[r.rep] = { active: Number(r.active) || 0, touched3d: Number(r.touched3d) || 0 }; activeTotal += Number(r.active) || 0; }

  // The lead rows themselves (recent first) — enough for the store pipeline + each rep's drill-down.
  const rows = await q(
    `SELECT customer, sales_rep AS rep, lead_source AS source, lead_status_custom AS status,
            year, make, model, trim, stock_number AS stock,
            lead_origination_date::text AS at, last_attempted_or_actual::text AS last_touch
     FROM scorecard_leads WHERE ${WINDOW} ORDER BY lead_origination_date DESC LIMIT 900`
  );
  const leads = rows.map((r) => ({
    customer: r.customer || "", rep: r.rep || "", source: cleanSource(r.source), status: r.status || "Active",
    vehicle: [r.year, r.make, r.model, r.trim].filter(Boolean).join(" ").trim(),
    stock: r.stock || "", at: (r.at || "").slice(0, 10), lastTouch: (r.last_touch || "").slice(0, 10),
  }));

  // Lead-source mix (store-wide) for the overview.
  const bySource = {};
  for (const l of leads) bySource[l.source] = (bySource[l.source] || 0) + 1;

  clearTimeout(deadline);
  try { await client.close(); } catch {}

  const out = { asOf: new Date().toISOString().slice(0, 10), activeTotal, reps: Object.keys(byRep).length, byRep, bySource, leads };
  fs.writeFileSync(path.join(DATA, "store-leads.json"), JSON.stringify(out) + "\n");
  log(`wrote store-leads.json · ${activeTotal} active leads across ${out.reps} reps · ${leads.length} rows`);
  process.exit(0);
}

main().catch((e) => { console.error("store-pipeline ERROR:", e.message); process.exit(1); });
