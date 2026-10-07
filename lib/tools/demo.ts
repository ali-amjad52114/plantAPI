// Demo reset (real systems, one button). Importable from Next and the worker: no top-level side effects.
// Steps: guard -> archive incidents -> unblock Odoo Crushing Line 2 -> close open CV-104 Fiix WOs (Agent37 browser)
// -> refresh Sheet + Calendar (lib/tools/demo-refresh) -> summary. Never deletes anything. Never logs secrets.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { odoo, unblockWorkcenter, DEMO_WORKCENTER } from "@/lib/tools/odoo";

export const LIVE_STATUSES = ["EXECUTING", "WAITING_REPAIR", "VERIFYING"] as const;
const FIIX_INSTANCE = "pfd5d7eukw";

export type DemoStep = "guard" | "archive" | "odoo" | "fiix" | "refresh" | "summary";
export type StepResult = { status: "ok" | "skipped" | "pending" | "error"; detail: string; data?: unknown };
export interface ResetSummary {
  refused: boolean;
  live: Array<{ id: string; status: string }>;
  steps: Partial<Record<DemoStep, StepResult>>;
  ok: boolean;
}
export interface ResetOptions {
  force?: boolean;
  tz?: string;
  onProgress?: (step: DemoStep, detail: string) => void;
}

/** Retry an external call at most 2 times (3 attempts total). */
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) { try { return await fn(); } catch (e) { last = e; } }
  throw last;
}

function supabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Finds the repo root (dir containing scripts/lib/fiix-browser.sh): PLANTAPI_ROOT, then up from cwd, then up from this file. */
export function repoRoot(): string {
  const rel = join("scripts", "lib", "fiix-browser.sh");
  const starts = [process.env.PLANTAPI_ROOT, process.cwd(), typeof __dirname === "string" ? __dirname : undefined].filter(Boolean) as string[];
  for (const s of starts) {
    let d = resolve(s);
    for (let i = 0; i < 8; i++) { if (existsSync(join(d, rel))) return d; const p = dirname(d); if (p === d) break; d = p; }
  }
  throw new Error("repo root not found (set PLANTAPI_ROOT): scripts/lib/fiix-browser.sh missing");
}

// ---------- Agent37 exec (Fiix browser) ----------
function agent37Exec(command: string, timeoutMs = 180_000) {
  const key = process.env.AGENT37_API_KEY;
  if (!key) throw new Error("missing AGENT37_API_KEY");
  const base = (process.env.AGENT37_BASE_URL ?? "https://api.agent37.com").replace(/\/$/, "").replace(/(\/v1)?$/, "/v1");
  return retry(async () => {
    const r = await fetch(`${base}/instances/${FIIX_INSTANCE}/exec`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeout_ms: timeoutMs }),
    });
    if (!r.ok) throw new Error(`agent37 exec HTTP ${r.status}`);
    return (await r.json()) as { exit_code: number; stdout: string; stderr: string };
  });
}

type Wo = { code: string; status: string; row: string };
function parseHistory(stdout: string): Wo[] {
  return stdout.split("\\n").join("\n").split("\n").map((l) => l.trim().replace(/^"|"$/g, "")).filter((l) => / \| /.test(l))
    .map((row) => {
      const cells = row.split(" | ").map((c) => c.trim());
      const status = cells.find((c) => /^(Open|Closed|Requested|Assigned|Work In Progress|On Hold|Waiting|Completed)/i.test(c)) ?? "?";
      return { code: cells[0], status, row };
    });
}

/** Closes every open CV-104 WO (helper `history` lists Status group "Active"). Never deletes. */
export async function closeOpenFiixWos(progress: (d: string) => void = () => {}) {
  const { FIIX_URL, FIIX_USERNAME, FIIX_PASSWORD } = process.env;
  if (!FIIX_URL || !FIIX_USERNAME || !FIIX_PASSWORD) throw new Error("missing FIIX_* env");
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const helper = readFileSync(join(repoRoot(), "scripts", "lib", "fiix-browser.sh"), "utf8").split("\r").join("");
  progress("provisioning Fiix helper on Agent37");
  await agent37Exec(`umask 077; mkdir -p ~/plantapi; ` +
    `printf '%s\\n' 'FIIX_URL=${FIIX_URL}' 'FIIX_USERNAME_B64=${b64(FIIX_USERNAME)}' 'FIIX_PASSWORD_B64=${b64(FIIX_PASSWORD)}' > ~/plantapi/fiix.env; ` +
    `echo ${b64(helper)} | base64 -d > ~/plantapi/fiix-browser.sh; chmod 700 ~/plantapi/fiix-browser.sh; echo ok`);
  progress("logging in to Fiix");
  await agent37Exec("~/plantapi/fiix-browser.sh login");
  const open = parseHistory((await agent37Exec("~/plantapi/fiix-browser.sh history")).stdout).filter((w) => !/Closed/i.test(w.row));
  const closed: Array<{ code: string; result: string }> = [];
  for (const w of open) {
    progress(`closing WO ${w.code}`);
    const r = await agent37Exec(`~/plantapi/fiix-browser.sh close ${JSON.stringify(w.code)}`);
    closed.push({ code: w.code, result: (r.stdout.match(/status=(.*)/)?.[1] ?? `exit ${r.exit_code}`).trim() });
  }
  let after: Wo[] = [];
  if (open.length) for (let i = 0; i < 3; i++) { after = parseHistory((await agent37Exec("~/plantapi/fiix-browser.sh history")).stdout); if (after.length || i === 2) break; }
  return { openBefore: open.map((w) => w.code), closed, stillOpen: after.filter((w) => !/Closed/i.test(w.row)).map((w) => w.code) };
}

// ---------- refresh (Sheet + Calendar) ----------
type RefreshFn = (o: { dryRun?: boolean; tz?: string; onProgress?: (step: string, detail: string) => void }) => Promise<unknown>;
async function loadRefresh(): Promise<RefreshFn | null> {
  // TODO(core): switch to a static `import { refreshDemoData } from "@/lib/tools/demo-refresh"` once that file lands.
  try {
    const spec: string = "./demo-refresh";
    const m = (await import(/* webpackIgnore: true */ spec)) as { refreshDemoData?: RefreshFn };
    return m.refreshDemoData ?? null;
  } catch { return null; }
}

// ---------- main ----------
export async function resetDemo(opts: ResetOptions = {}): Promise<ResetSummary> {
  const say = (step: DemoStep, detail: string) => { try { opts.onProgress?.(step, detail); } catch { /* ignore listener errors */ } };
  const steps: ResetSummary["steps"] = {};
  const run = async (step: DemoStep, fn: () => Promise<StepResult>) => {
    try { steps[step] = await fn(); } catch (e) { steps[step] = { status: "error", detail: String((e as Error)?.message ?? e).slice(0, 300) }; }
    say(step, `${steps[step]!.status}: ${steps[step]!.detail}`);
  };
  const db = supabase();

  // 1. guard
  say("guard", "checking for live incidents");
  const liveQ = await retry(async () => {
    const r = await db.from("incidents").select("id,status").eq("archived", false).in("status", [...LIVE_STATUSES]);
    if (r.error) throw new Error(r.error.message);
    return (r.data ?? []) as Array<{ id: string; status: string }>;
  });
  if (liveQ.length && !opts.force) {
    steps.guard = { status: "error", detail: `refused: ${liveQ.length} live incident(s) (${LIVE_STATUSES.join("/")}); use force` };
    say("guard", steps.guard.detail);
    return { refused: true, live: liveQ, steps, ok: false };
  }
  steps.guard = { status: "ok", detail: liveQ.length ? `forced past ${liveQ.length} live incident(s)` : "no live incidents" };
  say("guard", steps.guard.detail);

  // 2. archive
  await run("archive", async () => {
    const r = await retry(async () => {
      const u = await db.from("incidents").update({ archived: true }).eq("archived", false).select("id");
      if (u.error) throw new Error(u.error.message);
      return u.data ?? [];
    });
    return { status: "ok", detail: `archived ${r.length} incident(s)`, data: { archivedIds: r.map((x) => x.id) } };
  });

  // 3. odoo
  await run("odoo", async () => {
    const un = await retry(() => unblockWorkcenter(DEMO_WORKCENTER));
    const after = await retry(() => odoo.workcenterBlocked(DEMO_WORKCENTER));
    return { status: after.blocked ? "error" : "ok", detail: `${DEMO_WORKCENTER} blocked=${after.blocked}; ended ${un.closedIds.length} block(s)`,
      data: { closedProductivityIds: un.closedIds, blocked: after.blocked, ref: after.ref } };
  });

  // 4. fiix
  await run("fiix", async () => {
    const f = await closeOpenFiixWos((d) => say("fiix", d));
    return { status: f.stillOpen.length ? "error" : "ok", detail: `closed ${f.closed.length} CV-104 WO(s)${f.stillOpen.length ? `; still open: ${f.stillOpen.join(",")}` : ""}`, data: f };
  });

  // 5. refresh
  await run("refresh", async () => {
    const refresh = await loadRefresh();
    if (!refresh) return { status: "pending", detail: "lib/tools/demo-refresh not available yet" };
    const data = await refresh({ dryRun: false, tz: opts.tz, onProgress: (s, d) => say("refresh", `${s}: ${d}`) });
    return { status: "ok", detail: "Sheet + Calendar refreshed", data };
  });

  const ok = (["archive", "odoo", "fiix", "refresh"] as const).every((s) => steps[s]?.status === "ok" || steps[s]?.status === "pending");
  steps.summary = { status: ok ? "ok" : "error", detail: ok ? "demo reset complete" : "demo reset incomplete" };
  say("summary", steps.summary.detail);
  return { refused: false, live: liveQ, steps, ok };
}
