import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import crypto from "crypto";
import { currentUser } from "../../../lib/auth";
import {
  listJackets, getJacket, createJacket, updateJacket, deleteJacket,
  getRouting, setRouting, type DealJacket, type Stage,
} from "../../../lib/deal-jackets";

export const dynamic = "force-dynamic";

const SCRIPTS = path.join(process.cwd(), "scripts", "deal-jacket");

// Run a deal-jacket python script, piping `payload` in as JSON on stdin. Returns {stdout, code}.
function runPy(script: string, payload: any): Promise<{ out: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn("/usr/bin/python3", [path.join(SCRIPTS, script)], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill(); resolve({ out: "", code: 124 }); }, 60000);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => { clearTimeout(timer); resolve({ out: out || err, code: code ?? 1 }); });
    p.on("error", (e) => { clearTimeout(timer); resolve({ out: String(e), code: 1 }); });
    p.stdin.write(JSON.stringify(payload)); p.stdin.end();
  });
}

export async function GET() {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ ok: true, jackets: listJackets(me.slug, me.isAdmin), routing: getRouting() });
}

export async function POST(req: NextRequest) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  // ── Set the default desk / finance routing ──
  if (action === "routing") {
    return NextResponse.json({ ok: true, routing: setRouting({ desk: body.desk, finance: body.finance }) });
  }

  // ── Build the packet PDF and create the jacket (stage: ready, nothing sent yet) ──
  if (action === "build") {
    const { type = "used", customer = {}, vehicle = {}, trade, dealNumber = "" } = body;
    if (!customer.last_name || !vehicle.stock) {
      return NextResponse.json({ error: "Customer last name and vehicle stock # are required." }, { status: 400 });
    }
    const deal = { type, customer, vehicle, trade: trade || {}, deal_number: dealNumber };
    const r = await runPy("fill_packet.py", deal);
    const m = r.out.match(/Filled:\s*(.+\.pdf)\s*$/m);
    if (r.code !== 0 || !m) {
      return NextResponse.json({ error: `Couldn't fill the packet: ${r.out.trim().slice(-300) || "unknown error"}` }, { status: 500 });
    }
    const pdfPath = m[1].trim();
    const routing = getRouting();
    const jacket: DealJacket = {
      id: "dj_" + crypto.randomBytes(5).toString("hex"),
      createdAt: new Date().toISOString(),
      createdBy: me.slug,
      type, customer, vehicle, trade: trade || undefined, dealNumber,
      pdfPath, pdfName: path.basename(pdfPath),
      stage: "ready",
      desk: body.desk || routing.desk,
      finance: body.finance || routing.finance,
      history: [{ at: new Date().toISOString(), event: "Packet built" }],
    };
    createJacket(jacket);
    return NextResponse.json({ ok: true, jacket });
  }

  // Actions below operate on an existing jacket the caller owns (or admin).
  const j = getJacket(String(body.id || ""));
  if (!j) return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  if (j.createdBy !== me.slug && !me.isAdmin) return NextResponse.json({ error: "Not your deal." }, { status: 403 });

  const fullName = `${j.customer.first_name || ""} ${j.customer.last_name || ""}`.trim();
  const stockStr = String(j.vehicle.stock || "");
  const vehStr = [j.vehicle.year, j.vehicle.make, j.vehicle.model].filter(Boolean).join(" ");

  // ── Approve in COVE → send the packet to the desk for approval ──
  if (action === "send-desk") {
    const desk = body.desk || j.desk;
    const r = await runPy("send_jacket.py", {
      to: [desk], cc: ["bailey"],
      subject: `Deal for approval — ${fullName || j.customer.last_name} — ${stockStr}`,
      body: `Hey,\n\nDeal packet for ${fullName} (${vehStr}, stock ${stockStr}, deal #${j.dealNumber}) attached for desk approval.\nOnce approved I'll forward to finance.\n\n— Bailey\n512-777-9404\n`,
      pdf: j.pdfPath, photos_dir: body.photosDir || undefined,
    });
    let res: any = {}; try { res = JSON.parse(r.out.trim().split("\n").pop() || "{}"); } catch {}
    if (!res.ok) return NextResponse.json({ error: res.error || "Send to desk failed." }, { status: 500 });
    const updated = updateJacket(j.id, { stage: "at_desk", desk }, `Sent to desk (${res.to?.join(", ")}) for approval`);
    return NextResponse.json({ ok: true, jacket: updated });
  }

  // ── Desk approved → forward to finance/F&I ──
  if (action === "send-finance") {
    const finance = body.finance || j.finance;
    const r = await runPy("send_jacket.py", {
      to: [finance], cc: ["bailey"],
      subject: `Approved deal → finance — ${fullName || j.customer.last_name} — ${stockStr}`,
      body: `Hey,\n\nDesk-approved deal for ${fullName} (${vehStr}, stock ${stockStr}, deal #${j.dealNumber}) attached for finance.\n\n— Bailey\n512-777-9404\n`,
      pdf: j.pdfPath, photos_dir: body.photosDir || undefined,
    });
    let res: any = {}; try { res = JSON.parse(r.out.trim().split("\n").pop() || "{}"); } catch {}
    if (!res.ok) return NextResponse.json({ error: res.error || "Send to finance failed." }, { status: 500 });
    const updated = updateJacket(j.id, { stage: "at_finance", finance }, `Desk approved → forwarded to finance (${res.to?.join(", ")})`);
    return NextResponse.json({ ok: true, jacket: updated });
  }

  // ── Mark funded / complete ──
  if (action === "done") {
    return NextResponse.json({ ok: true, jacket: updateJacket(j.id, { stage: "done" as Stage }, "Marked funded/complete") });
  }

  if (action === "delete") {
    deleteJacket(j.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
