#!/usr/bin/env node
/**
 * dms-refresh.mjs — the fully-autonomous live refresh.
 *
 * Talks DIRECTLY to the GMReview DMS MCP server over SSE (no Claude, no API key,
 * no desktop app) and rebuilds the connected CRM. Runs on a launchd cron every few
 * minutes (com.covert.crm-refresh). This is "path B" — constant updates that don't
 * depend on anything being open.
 *
 * Each source is independent (its own try/catch) so one bad pull can't break the rest.
 * Never fabricates — only what the DMS returns. Ends by running build-crm.mjs.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const DMS_URL = process.env.DMS_MCP_URL || "https://gmmcp.slaxer07.com/sse";
const write = (f, v) => fs.writeFileSync(path.join(DATA, f), (typeof v === "string" ? v : JSON.stringify(v)) + "\n");
const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);
const log = (...a) => console.log(new Date().toISOString(), ...a);

const health = { at: new Date().toISOString(), ok: {}, errors: {} };

async function main() {
  const client = new Client({ name: "covert-crm-refresh", version: "1.0.0" }, { capabilities: {} });
  const deadline = setTimeout(() => { log("hard timeout"); process.exit(1); }, 90000);
  await client.connect(new SSEClientTransport(new URL(DMS_URL)));

  const q = async (sql) => {
    const r = await client.callTool({ name: "run_query", arguments: { sql } });
    const txt = r?.content?.find?.((c) => c.type === "text")?.text ?? r?.content?.[0]?.text ?? "[]";
    const j = JSON.parse(txt);
    if (j && j.error) throw new Error(j.error);
    return j;
  };

  // ---- 1. ACTIVE LEADS (the people side: leads → customers → pipeline) ----
  try {
    const rows = await q(
      `SELECT customer, lead_source, year, make, model, stock_number,
              contacted_indicator, lead_origination_date::text AS origin, last_customer_contact::text AS lastc
       FROM scorecard_leads
       WHERE POSITION('Bailey' IN COALESCE(sales_rep,'')) > 0
         AND lead_status NOT IN ('Delivered','Sold','Lost','Dead','Duplicate lead','Lead process completed','Out of market')
         AND lead_origination_date >= (CURRENT_DATE - INTERVAL '45 days')
       ORDER BY lead_origination_date DESC LIMIT 80`
    );
    const leads = rows.map((r) => ({
      customer: r.customer, source: /ask the question/i.test(r.lead_source || "") ? "CRM" : (r.lead_source || "CRM"),
      year: r.year, make: r.make, model: r.model, stock: r.stock_number,
      contacted: r.contacted_indicator, origin: r.origin, lastContact: r.lastc,
    }));
    write("_active-leads.json", JSON.stringify(leads, null, 2));
    health.ok.leads = leads.length;
    log("leads:", leads.length);
  } catch (e) { health.errors.leads = e.message; log("leads ERR", e.message); }

  // ---- 2. INVENTORY (unit-level for search/chatbot + aggregate for the board) ----
  try {
    const cols = `stock_number AS s, vin AS v, year AS y, COALESCE(standardized_model, model) AS m,
                  COALESCE(standardized_trim, trim) AS t, exterior_color AS c, interior_color AS ic,
                  CASE WHEN list_price='NaN'::numeric THEN NULL ELSE list_price END AS p, age AS a, status AS st`;
    const avail = `status IN ('IN-STOCK','LOANER','RET LOANER','DEMO')`;
    const ford = await q(`SELECT ${cols} FROM ford_inventory_current WHERE ${avail}`);
    const chevy = await q(`SELECT ${cols} FROM chevy_inventory_current WHERE ${avail}`);
    const map = (rows, store) => rows.map((r) => ({
      stock: r.s, vin: r.v, year: r.y, model: r.m, trim: r.t, ext: r.c, int: r.ic,
      price: num(r.p) != null ? Math.round(r.p) : null, age: r.a, status: r.st, store,
    })).filter((u) => u.stock);
    const units = [...map(ford, "Ford"), ...map(chevy, "Chevy")].sort((a, b) => a.age - b.age);
    write("inventory-units.json", JSON.stringify({ asOf: today(), source: "GMReview ford/chevy_inventory_current (live)", units }));

    // aggregate by model for the board (new IN-STOCK only)
    const agg = (rows, store) => {
      const m = {};
      for (const u of map(rows, store).filter((x) => x.status === "IN-STOCK")) {
        const k = u.model || "Other";
        (m[k] ||= { model: k, units: 0, msrp: 0, msrpN: 0, days: 0 });
        m[k].units++; m[k].days += u.age || 0;
        if (u.price) { m[k].msrp += u.price; m[k].msrpN++; }
      }
      return Object.values(m).map((x) => ({ model: x.model, units: x.units, avgMsrp: x.msrpN ? Math.round(x.msrp / x.msrpN) : 0, avgDays: Math.round(x.days / x.units) }))
        .sort((a, b) => b.units - a.units);
    };
    write("inventory.json", JSON.stringify({ asOf: today(), source: "GMReview inventory_current (live)", ford: agg(ford, "Ford"), chevy: agg(chevy, "Chevy") }, null, 2));
    health.ok.inventory = units.length;
    log("inventory units:", units.length);
  } catch (e) { health.errors.inventory = e.message; log("inventory ERR", e.message); }

  // NOTE: month-to-date GROSS/metrics is intentionally NOT refreshed here. The DMS
  // sales_pace gross differs from Bailey's authoritative Drive-log gross (~$15k gap on
  // a quick check), so the sold/gross numbers stay on the Drive-log path (covert-crm-sold).
  // This refresher owns the live PEOPLE side (leads→customers→pipeline) + inventory only.

  await client.close();
  clearTimeout(deadline);

  // ---- 4. REBUILD the connected people-side from the fresh leads ----
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-crm.mjs")], { encoding: "utf8" });
    log("build-crm:", out.trim());
    health.ok.build = out.trim();
  } catch (e) { health.errors.build = e.message; log("build ERR", e.message); }

  write("_refresh-log.json", JSON.stringify({ ...health, finishedAt: new Date().toISOString() }, null, 2));
  log("done", JSON.stringify(health.ok));
  process.exit(0);
}

function today() { return new Date().toISOString().slice(0, 10); }

main().catch((e) => { console.error("FATAL", e); try { write("_refresh-log.json", JSON.stringify({ at: new Date().toISOString(), fatal: String(e) }, null, 2)); } catch {} process.exit(1); });
