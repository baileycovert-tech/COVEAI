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
      stock: r.s, vin: r.v, year: r.y, make: store, model: r.m, trim: r.t, ext: r.c, int: r.ic,
      price: num(r.p) != null ? Math.round(r.p) : null, mileage: null, age: r.a, status: r.st, store, condition: "New",
    })).filter((u) => u.stock);

    // USED inventory — ALL makes (trade-ins, off-brand), available only.
    const used = await q(
      `SELECT stock_number AS s, vin AS v, year AS y, COALESCE(std_make, make) AS mk,
              COALESCE(std_model, model) AS m, COALESCE(std_trim, trim_level) AS t,
              exterior_color AS c, interior_color AS ic, mileage AS mi,
              CASE WHEN price='NaN'::real THEN NULL ELSE price END AS p,
              age_in_inventory AS a, status AS st, certification_status AS cert
       FROM used_inventory WHERE status = 'IN-STOCK'`
    );
    const usedUnits = used.map((r) => ({
      stock: r.s, vin: r.v, year: r.y, make: r.mk, model: r.m,
      trim: /certified/i.test(r.cert || "") ? `${r.t || ""} (Certified)`.trim() : r.t,
      ext: r.c, int: r.ic, price: num(r.p) != null ? Math.round(r.p) : null,
      mileage: num(r.mi), age: r.a, status: r.st, store: "Used", condition: "Used",
    })).filter((u) => u.stock);

    const units = [...map(ford, "Ford"), ...map(chevy, "Chevy"), ...usedUnits].sort((a, b) => (a.age || 0) - (b.age || 0));
    write("inventory-units.json", JSON.stringify({ asOf: today(), source: "GMReview ford/chevy_inventory_current + used_inventory (live)", units }));

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

  // ---- 3. SOLD DEALS DATABASE — every Bailey deal w/ gross, clickable by deal #. ----
  try {
    const pace = await q(
      `SELECT "DATE" AS d, "DEAL" AS deal, "FRONT-GROSS" AS front, "BACK-GROSS" AS back, "MSRP" AS msrp,
              "ACV-TRADE1" AS trade, "STORE" AS store, "NUO" AS nuo, "LAST-NAME" AS lastname,
              "STK-NO" AS stock, "VIN" AS vin, "BANK-NAME" AS bank, "DAYS-IN-STK" AS daysstk
       FROM sales_pace WHERE "S1-NUMBER" IN ('1249','3001249') ORDER BY "DATE" DESC LIMIT 400`
    );
    const sc = await q(
      `SELECT stock_number AS stock, customer, year, make, model, inventory_type FROM scorecard_sales
       WHERE POSITION('Bailey' IN COALESCE(sales_representative,'')) > 0 AND sold_date >= (CURRENT_DATE - INTERVAL '400 days') LIMIT 400`
    );
    const byStock = {};
    for (const r of sc) if (r.stock) byStock[String(r.stock).toLowerCase()] = r;
    const deals = pace.map((p) => {
      const m = byStock[String(p.stock || "").toLowerCase()] || {};
      const front = num(p.front) || 0, back = num(p.back) || 0;
      return {
        id: String(p.deal), date: (p.d || "").slice(0, 10), deal: p.deal,
        customer: m.customer || titleCaseName(p.lastname), stock: p.stock, vin: p.vin,
        nuo: (p.nuo || "").toUpperCase(), store: p.store === "03/01" ? "Chevy" : p.store === "04/01" ? "Ford" : p.store,
        year: m.year || null, make: m.make || null, model: m.model || null,
        front: Math.round(front), back: Math.round(back), gross: Math.round(front + back),
        msrp: num(p.msrp) ? Math.round(p.msrp) : null, trade: num(p.trade) ? Math.round(p.trade) : null,
        bank: p.bank || null, daysInStock: p.daysstk || null,
      };
    }).filter((d) => d.stock || d.deal);
    const totalGross = deals.reduce((n, d) => n + (d.gross || 0), 0);
    write("sold.json", JSON.stringify({ asOf: today(), source: "GMReview sales_pace + scorecard_sales (live)", count: deals.length, totalGross, deals }, null, 2));
    health.ok.sold = deals.length;
    log("sold deals:", deals.length, "$" + totalGross);
  } catch (e) { health.errors.sold = e.message; log("sold ERR", e.message); }

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
function titleCaseName(s) { return (s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) || "—"; }

main().catch((e) => { console.error("FATAL", e); try { write("_refresh-log.json", JSON.stringify({ at: new Date().toISOString(), fatal: String(e) }, null, 2)); } catch {} process.exit(1); });
