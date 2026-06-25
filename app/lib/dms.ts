import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Live read-only access to the GMReview DMS (same MCP the desktop assistant uses).
// One short-lived connection per call. run_query is SELECT-only on the DMS side.
export async function dmsQuery(sql: string): Promise<any[]> {
  const url = process.env.DMS_MCP_URL || "https://gmmcp.slaxer07.com/sse";
  const client = new Client({ name: "covert-crm-chat", version: "1.0.0" }, { capabilities: {} });
  await client.connect(new SSEClientTransport(new URL(url)));
  try {
    const r: any = await client.callTool({ name: "run_query", arguments: { sql } });
    const txt = r?.content?.find?.((c: any) => c.type === "text")?.text ?? r?.content?.[0]?.text ?? "[]";
    const j = JSON.parse(txt);
    if (j && j.error) throw new Error(String(j.error));
    return Array.isArray(j) ? j : [j];
  } finally {
    try { await client.close(); } catch {}
  }
}
