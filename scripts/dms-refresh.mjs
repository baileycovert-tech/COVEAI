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
                  CASE WHEN list_price='NaN'::numeric THEN NULL ELSE list_price END AS p,
                  CASE WHEN internet_price='NaN'::numeric THEN NULL ELSE internet_price END AS ip,
                  age AS a, status AS st`;
    const avail = `status IN ('IN-STOCK','LOANER','RET LOANER','DEMO')`;
    const ford = await q(`SELECT ${cols} FROM ford_inventory_current WHERE ${avail}`);
    const chevy = await q(`SELECT ${cols} FROM chevy_inventory_current WHERE ${avail}`);
    const map = (rows, store) => rows.map((r) => ({
      stock: r.s, vin: r.v, year: r.y, make: store, model: r.m, trim: r.t, ext: r.c, int: r.ic,
      price: num(r.p) != null ? Math.round(r.p) : null,
      internet: num(r.ip) != null ? Math.round(r.ip) : null, // advertised online price
      mileage: null, age: r.a, status: r.st, store, condition: "New",
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
      internet: num(r.p) != null ? Math.round(r.p) : null, // used asking price = its internet price
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

    // deals.json = THIS MONTH's deals for the dashboard's "Recent deals" + count (was going stale).
    const firstOfMonth = new Date().toISOString().slice(0, 7) + "-01";
    const monthDeals = deals.filter((d) => (d.date || "") >= firstOfMonth)
      .map((d) => ({ date: d.date, nuo: d.nuo, yr: String(d.year || ""), make: d.make, model: d.model, customer: d.customer, stock: d.stock, front: d.front, back: d.back, store: d.store }));
    write("deals.json", JSON.stringify(monthDeals, null, 2));
    log("month deals (deals.json):", monthDeals.length);
  } catch (e) { health.errors.sold = e.message; log("sold ERR", e.message); }

  // ---- 3b. PER-REP BOARDS — EXACT current-month sold by S1 (sales_pace, not name-matched) → reps.json ----
  // sales_pace keys every deal to the rep's unique S1, catching deals scorecard's name-matching misses
  // (CH/Ford store name variants). Each user's Ford + Chevy S1 are summed. This is the count reps trust.
  try {
    const raw = await q(
      `SELECT "S1-NUMBER" AS s1, COUNT(*) AS units,
              SUM(CASE WHEN POSITION('NEW' IN UPPER(COALESCE("NUO",''))) > 0 THEN 1 ELSE 0 END) AS new_u,
              SUM(CASE WHEN POSITION('USED' IN UPPER(COALESCE("NUO",''))) > 0 THEN 1 ELSE 0 END) AS used_u,
              SUM(COALESCE(NULLIF("FRONT-GROSS",'NaN'::numeric), 0) + COALESCE(NULLIF("BACK-GROSS",'NaN'::numeric), 0)) AS gross
       FROM sales_pace WHERE "DATE" >= to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD') GROUP BY "S1-NUMBER"`
    );
    const byS1 = {};
    for (const r of raw) if (r.s1 != null) byS1[String(r.s1)] = { units: Number(r.units) || 0, newU: Number(r.new_u) || 0, usedU: Number(r.used_u) || 0, gross: Math.round(num(r.gross) || 0) };
    const users = JSON.parse(fs.readFileSync(path.join(DATA, "users.json"), "utf8"));
    const bySlug = {}, board = [];
    for (const u of users) {
      const a = byS1[String(u.fordS1)], b = byS1[String(u.chevyS1)];
      const units = (a?.units || 0) + (b?.units || 0);
      if (units <= 0) continue;
      const rec = { units, newU: (a?.newU || 0) + (b?.newU || 0), usedU: (a?.usedU || 0) + (b?.usedU || 0), gross: (a?.gross || 0) + (b?.gross || 0) };
      bySlug[u.slug] = rec;
      board.push({ name: u.name, units: rec.units, gross: rec.gross });
    }
    const leaderboard = board.sort((x, y) => y.gross - x.gross).map((m, i) => ({ rank: i + 1, name: m.name, units: m.units, gross: m.gross }));
    write("reps.json", JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), month: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }), bySlug, leaderboard }, null, 2));
    health.ok.reps = Object.keys(bySlug).length;
    log("rep boards (by S1):", Object.keys(bySlug).length);
  } catch (e) { health.errors.reps = e.message; log("reps ERR", e.message); }

  // ---- 3c. CURRENT-MONTH METRICS — Bailey's MTD tiles, live from sales_pace by S1 (was stale @ 25) ----
  try {
    const rows = await q(
      `SELECT CASE WHEN POSITION('NEW' IN UPPER(COALESCE("NUO",''))) > 0 THEN 'new' ELSE 'used' END AS k,
              COUNT(*) AS units,
              SUM(COALESCE(NULLIF("FRONT-GROSS",'NaN'::numeric), 0)) AS front,
              SUM(COALESCE(NULLIF("BACK-GROSS",'NaN'::numeric), 0)) AS back
       FROM sales_pace WHERE "S1-NUMBER" IN ('1249','3001249') AND "DATE" >= to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD') GROUP BY 1`
    );
    const cur = { new: { units: 0, front: 0, back: 0 }, used: { units: 0, front: 0, back: 0 } };
    for (const r of rows) { const k = r.k === "new" ? "new" : "used"; cur[k] = { units: Number(r.units) || 0, front: Math.round(num(r.front) || 0), back: Math.round(num(r.back) || 0) }; }
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const entry = { month: ym, label: now.toLocaleString("en-US", { month: "short" }), newUnits: cur.new.units, usedUnits: cur.used.units, newFront: cur.new.front, newBack: cur.new.back, usedFront: cur.used.front, usedBack: cur.used.back };
    let mf; try { mf = JSON.parse(fs.readFileSync(path.join(DATA, "metrics.json"), "utf8")); } catch { mf = { months: [] }; }
    const months = Array.isArray(mf.months) ? mf.months : [];
    if (months.length && months[months.length - 1].month === ym) months[months.length - 1] = entry; else months.push(entry);
    write("metrics.json", JSON.stringify({ ...mf, asOf: now.toISOString().slice(0, 10), months }, null, 2));
    health.ok.metrics = entry.newUnits + entry.usedUnits;
    log("metrics MTD:", entry.newUnits + entry.usedUnits, "units");
  } catch (e) { health.errors.metrics = e.message; log("metrics ERR", e.message); }

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
