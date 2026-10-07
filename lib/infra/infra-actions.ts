/// <reference types="node" />
/**
 * infra_actions writer (S4 Platform, migration 020).
 *
 * One row per InstaCloud governance decision (ALLOW / APPROVE / DENY / ERROR) so the UI can show
 * them live via Supabase Realtime. Writes use the service-role key (server side only).
 *
 * REAL ONLY: rows come from real insta CLI results (governance-demo.ts --live) or from the evidence
 * file that a real live run wrote (backfill). Nothing is invented.
 *
 * Backfill:
 *   npx tsx lib/infra/infra-actions.ts --backfill infra/governance/evidence-<ts>.json
 * Idempotent: skips if rows with that run_id already exist.
 */
import { readFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type InfraOutcome = "ALLOW" | "APPROVE" | "DENY" | "ERROR";

export interface InfraActionRow {
  run_id: string;
  outcome: InfraOutcome;
  action: string;
  policy_expected: string | null;
  platform_returned: string | null;
  approval_id: string | null;
  detail: string | null;
  raw: unknown;
  created_at?: string;
}

/** Shape of a governance-demo StepResult (kept loose so evidence JSON parses directly). */
export interface GovernanceStep {
  label: string;
  action: string;
  expected: string;
  decision: string;
  approvalId: string | null;
  detail: string;
  cli: { cmd: string; exitCode: number | null; stdout: string; stderr: string; ms: number } | null;
}

function loadEnv(): void {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const f = resolve(process.cwd(), ".env");
  if (existsSync(f)) process.loadEnvFile(f);
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (client) return client;
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** Map the platform's decision to the row outcome. Anything other than allow/approve/deny is ERROR. */
export function outcomeOf(decision: string): InfraOutcome {
  switch (decision) {
    case "allow":
      return "ALLOW";
    case "approve":
      return "APPROVE";
    case "deny":
      return "DENY";
    default:
      return "ERROR";
  }
}

/** Build a row from a governance step. stdout/stderr are already redacted by governance-demo. */
export function rowFromStep(runId: string, step: GovernanceStep): InfraActionRow {
  const cli = step.cli
    ? {
        cmd: step.cli.cmd,
        exitCode: step.cli.exitCode,
        ms: step.cli.ms,
        stdout: step.cli.stdout.slice(0, 4000),
        stderr: step.cli.stderr.slice(0, 4000),
      }
    : null;
  return {
    run_id: runId,
    outcome: outcomeOf(step.decision),
    action: step.action,
    policy_expected: step.expected ?? null,
    platform_returned: step.decision ?? null,
    approval_id: step.approvalId ?? null,
    detail: step.detail ?? null,
    raw: { label: step.label, cli },
  };
}

export async function recordInfraAction(row: InfraActionRow): Promise<string> {
  const { data, error } = await db().from("infra_actions").insert(row).select("id").single();
  if (error) throw new Error(`infra_actions insert failed: ${error.message}`);
  return (data as { id: string }).id;
}

async function backfill(file: string): Promise<void> {
  const ev = JSON.parse(readFileSync(file, "utf8")) as {
    mode?: string;
    startedAt?: string;
    finishedAt?: string;
    branch?: string;
    steps?: GovernanceStep[];
  };
  if (ev.mode !== "live" || !Array.isArray(ev.steps) || ev.steps.length === 0) {
    throw new Error(`${file} is not a completed live evidence file (mode=${ev.mode}, steps=${ev.steps?.length ?? 0})`);
  }
  const runId = basename(file).replace(/^evidence-/, "").replace(/\.json$/, "");
  const existing = await db().from("infra_actions").select("id").eq("run_id", runId);
  if (existing.error) throw new Error(existing.error.message);
  if ((existing.data ?? []).length > 0) {
    console.log(`run_id ${runId} already backfilled (${existing.data!.length} rows): ${existing.data!.map((r) => r.id).join(", ")}`);
    return;
  }
  for (const [stepIndex, step] of ev.steps.entries()) {
    const row = rowFromStep(runId, step);
    // Real timestamp of the live run (all three steps happened within it).
    row.created_at = ev.finishedAt ?? ev.startedAt;
    (row.raw as Record<string, unknown>).backfilledFrom = basename(file);
    (row.raw as Record<string, unknown>).branch = ev.branch;
    // All backfilled rows share one timestamp; step preserves the real order (ALLOW, APPROVE, DENY).
    (row.raw as Record<string, unknown>).step = stepIndex;
    const id = await recordInfraAction(row);
    console.log(`${row.outcome.padEnd(7)} ${row.action.padEnd(28)} approval=${row.approval_id ?? "-"} id=${id}`);
  }
}

const isMain = process.argv[1] && /infra-actions\.ts$/.test(process.argv[1]);
if (isMain) {
  const i = process.argv.indexOf("--backfill");
  if (i < 0 || !process.argv[i + 1]) {
    console.error("Usage: npx tsx lib/infra/infra-actions.ts --backfill infra/governance/evidence-<ts>.json");
    process.exit(2);
  }
  backfill(process.argv[i + 1]).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
