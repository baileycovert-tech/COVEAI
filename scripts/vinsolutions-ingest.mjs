#!/usr/bin/env node
/**
 * vinsolutions-ingest.mjs — pull Bailey's live VinSolutions pipeline into the CRM.
 *
 * The VinSolutions MCP (../mcp/vinsolutions, launchd com.covert.vinsolutions-mcp) exposes an
 * HTTP MCP endpoint at http://127.0.0.1:7892/mcp. Its `vs_get_my_pipeline` tool asks the Chrome
 * extension to scrape the logged-in VS leads grid and returns { source, count, pipeline:[...] }.
 *
 * RUNTIME REQUIREMENT (the seam): Chrome open + the VS extension loaded + logged into VinSolutions
 * on a leads page, so the extension is connected to the bridge. If it isn't, the tool errors/times
 * out — we log a clear message and leave the last-good vinsolutions-leads.json untouched (no wipe).
 *
 * On success: writes data/vinsolutions-leads.json (current OPEN pipeline) and rebuilds the board.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { phone10, kebab, titleCase } from "./lib-leads.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const write = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + "\n");
const log = (...a) => console.log(new Date().toISOString(), "vinsolutions-ingest:", ...a);
const URL_MCP = process.env.VS_MCP_URL || "http://127.0.0.1:7892/mcp";
const CLOSED = /\b(sold|lost|dead|delivered|duplicate|completed|out of market|inactive)\b/i;

async function getPipeline() {
  const client = new Client({ name: "covert-crm-vs", version: "1.0.0" }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_MCP)));
  try {
    const res = await client.callTool({ name: "vs_get_my_pipeline", arguments: { refresh: true } });
    const textPart = (res.content || []).find((c) => c.type === "text");
    if (!textPart) throw new Error("no text content from vs_get_my_pipeline");
    const data = JSON.parse(textPart.text);
    return data.pipeline || [];
  } finally {
    await client.close().catch(() => {});
  }
}

let pipeline;
try {
  pipeline = await getPipeline();
} catch (e) {
  const msg = String(e?.message || e);
  log("could not reach VinSolutions:", msg.split("\n")[0]);
  log("→ open VinSolutions in Chrome with the extension on a leads page, then re-run. Leaving last-good leads untouched.");
  process.exit(0);
}

const open = pipeline.filter((l) => l.customer_name && !CLOSED.test(l.status || ""));
const nowISO = new Date().toISOString();
const leads = open.map((l) => ({
  slug: "vs-" + (l.lead_id || kebab(l.customer_name)),
  name: titleCase(l.customer_name),
  phone: l.phones && l.phones[0] ? phone10(l.phones[0]) : null,
  email: (l.emails && l.emails[0]) ? String(l.emails[0]).toLowerCase() : null,
  vehicle: l.vehicle_interest || "",
  source: l.source || "VinSolutions",
  stock: l.stock_number || null,
  at: l.last_contact || nowISO,
  lastMsg: l.notes_preview || "",
  hot: true,
  channel: "VinSolutions",
  lead_id: l.lead_id || null,
  status: l.status || "",
}));

write("vinsolutions-leads.json", leads);
write("vinsolutions-status.json", { at: nowISO, pulled: pipeline.length, open: leads.length });
log(`pulled ${pipeline.length} pipeline rows, ${leads.length} open → vinsolutions-leads.json`);

try { execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-crm.mjs")], { encoding: "utf8", stdio: "inherit" }); } catch (e) { log("build-crm err", e.message); }
