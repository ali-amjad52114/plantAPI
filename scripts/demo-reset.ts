// Demo reset (real systems): closes every open CV-104 WO in Fiix (Agent37 browser), unblocks Crushing Line 2 in Odoo,
// and reports/archives non-closed Supabase incidents. Never deletes anything. Never prints secrets.
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/demo-reset.ts
// LEAD ONLY: refuses (exit 2) while any non-archived incident is EXECUTING/WAITING_REPAIR/VERIFYING, unless --force.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { odoo, unblockWorkcenter, DEMO_WORKCENTER } from "../lib/tools/odoo";

const INSTANCE = "pfd5d7eukw";
const base = (process.env.AGENT37_BASE_URL ?? "https://api.agent37.com").replace(/\/$/, "").replace(/(\/v1)?$/, "/v1");
const key = process.env.AGENT37_API_KEY!;
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** Retry an external call at most 2 times (3 attempts total). */
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) { try { return await fn(); } catch (e) { last = e; } }
  throw last;
}

const exec = (command: string, timeoutMs = 180_000) => retry(async () => {
  const r = await fetch(`${base}/instances/${INSTANCE}/exec`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ command, timeout_ms: timeoutMs }),
  });
  if (!r.ok) throw new Error(`exec HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as { exit_code: number; stdout: string; stderr: string };
});

type Wo = { code: string; status: string; row: string };
function parseHistory(stdout: string): Wo[] {
  return stdout.split("\\n").join("\n").split("\n").map((l) => l.trim().replace(/^"|"$/g, "")).filter((l) => / \| /.test(l))
    .map((row) => {
      const cells = row.split(" | ").map((c) => c.trim());
      const status = cells.find((c) => /^(Open|Closed|Requested|Assigned|Work In Progress|On Hold|Waiting|Completed)/i.test(c)) ?? "?";
      return { code: cells[0], status, row };
    });
}
const isClosed = (w: Wo) => /Closed/i.test(w.row);

async function fiix() {
  const { FIIX_URL, FIIX_USERNAME, FIIX_PASSWORD } = process.env;
  if (!key || !FIIX_URL || !FIIX_USERNAME || !FIIX_PASSWORD) return { error: "missing AGENT37_API_KEY or FIIX_* env" };
  const helper = readFileSync(join(__dirname, "lib", "fiix-browser.sh"), "utf8").split(String.fromCharCode(13)).join("");
  await exec(`umask 077; mkdir -p ~/plantapi; ` +
    `printf '%s\n' 'FIIX_URL=${FIIX_URL}' 'FIIX_USERNAME_B64=${b64(FIIX_USERNAME)}' 'FIIX_PASSWORD_B64=${b64(FIIX_PASSWORD)}' > ~/plantapi/fiix.env; ` +
    `echo ${b64(helper)} | base64 -d > ~/plantapi/fiix-browser.sh; chmod 700 ~/plantapi/fiix-browser.sh; echo ok`);
  await exec("~/plantapi/fiix-browser.sh login");
  const before = parseHistory((await exec("~/plantapi/fiix-browser.sh history")).stdout);
  const toClose = before.filter((w) => !isClosed(w));
  const closed: Array<{ code: string; result: string }> = [];
  for (const w of toClose) {
    const r = await exec(`~/plantapi/fiix-browser.sh close ${JSON.stringify(w.code)}`);
    closed.push({ code: w.code, result: (r.stdout.match(/status=(.*)/)?.[1] ?? `exit ${r.exit_code}`).trim() });
  }
  let after = before;
  if (toClose.length) {
    for (let i = 0; i < 3; i++) { after = parseHistory((await exec("~/plantapi/fiix-browser.sh history")).stdout); if (after.length) break; }
  }
  // NOTE: helper's "All work orders" switch currently stays on "Status group: Active", so history = open CV-104 WOs.
  return { scope: "Fiix CV-104 WOs, Status group Active (open)", before: before.length, openBefore: toClose.map((w) => w.code), closed, activeAfter: after.map((w) => `${w.code}: ${w.status}`),
    stillOpen: after.filter((w) => !isClosed(w)).map((w) => w.code) };
}

async function odooReset() {
  const before = await retry(() => odoo.workcenterBlocked(DEMO_WORKCENTER));
  const un = before.blocked ? await retry(() => unblockWorkcenter(DEMO_WORKCENTER)) : { workcenterId: null, closedIds: [] as number[] };
  const after = await retry(() => odoo.workcenterBlocked(DEMO_WORKCENTER));
  return { blockedBefore: before.blocked, refBefore: before.ref, closedProductivityIds: un.closedIds, blocked: after.blocked, ref: after.ref };
}

async function supabaseReset() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL, sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk) return { error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" };
  const db = createClient(url, sk, { auth: { persistSession: false } });
  const sel = await retry(async () => {
    const r = await db.from("incidents").select("*").neq("status", "CLOSED").order("created_at");
    if (r.error) throw new Error(r.error.message);
    return r.data as Array<Record<string, unknown>>;
  });
  const rows = sel.map((r) => `${r.id}:${r.status}`);
  const probe = await db.from("incidents").select("archived").limit(1);
  if (probe.error) {
    return { nonClosedBefore: sel.length, nonClosedAfter: sel.length, archived: 0,
      blocked: "BLOCKED: incidents.archived not migrated yet (core migration 004)", incidents: rows };
  }
  const pending = sel.filter((r) => r.archived !== true);
  if (pending.length) {
    await retry(async () => {
      const r = await db.from("incidents").update({ archived: true }).in("id", pending.map((p) => p.id as string));
      if (r.error) throw new Error(r.error.message);
    });
  }
  const left = await db.from("incidents").select("id").neq("status", "CLOSED").or("archived.is.null,archived.eq.false");
  return { nonClosedBefore: sel.length, nonClosedUnarchivedAfter: left.data?.length ?? null, archivedNow: pending.length, incidents: rows };
}

async function safe<T>(name: string, fn: () => Promise<T>) {
  try { return await fn(); } catch (e) { return { error: `${name}: ${String((e as Error).message ?? e).slice(0, 300)}` }; }
}

const ACTIVE = ["EXECUTING", "WAITING_REPAIR", "VERIFYING"];

/** Refuse to reset while a live run is in flight (lead rule): returns the active, non-archived incidents. */
async function activeIncidents(): Promise<Array<{ id: string; status: string }>> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL, sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk) throw new Error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — cannot check for live runs");
  const db = createClient(url, sk, { auth: { persistSession: false } });
  let r: { data: unknown; error: { message: string } | null } = await db.from("incidents").select("id,status,archived").in("status", ACTIVE);
  if (r.error && /archived/.test(r.error.message)) r = await db.from("incidents").select("id,status").in("status", ACTIVE);
  if (r.error) throw new Error(r.error.message);
  return (r.data as Array<{ id: string; status: string; archived?: boolean }>).filter((i) => i.archived !== true);
}

async function main() {
  // Lead rule: run only by the lead (or on the lead's instruction), never during a live run.
  if (!process.argv.includes("--force")) {
    let live: Array<{ id: string; status: string }>;
    try { live = await activeIncidents(); }
    catch (e) { console.error(`REFUSED: could not check for live incidents (${(e as Error).message}); rerun with --force only if the lead says so`); process.exitCode = 2; return; }
    if (live.length) {
      console.error(`REFUSED: ${live.length} live incident(s) — ${live.map((i) => `${i.id} ${i.status}`).join(", ")}. Reset would close their Fiix WO / Odoo block. Use --force only on the lead's instruction.`);
      process.exitCode = 2;
      return;
    }
  }
  const [fx, od, sb] = await Promise.all([safe("fiix", fiix), safe("odoo", odooReset), safe("supabase", supabaseReset)]);
  console.log("=== DEMO RESET — FINAL STATE ===");
  console.log(JSON.stringify({ fiix_cv104: fx, odoo_crushing_line_2: od, supabase_incidents: sb }, null, 2));
  const ok = !("error" in fx) && !(fx as { stillOpen: string[] }).stillOpen.length && !("error" in od) && (od as { blocked: boolean }).blocked === false && !("error" in sb);
  console.log(ok ? "RESET OK" : "RESET INCOMPLETE");
  process.exit(ok ? 0 : 1);
}
main();
