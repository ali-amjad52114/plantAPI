// Offline smoke test for the wave-A role files (S2/C6). No network, no Agent37 turns, no paid calls.
// Run: npx tsx scripts/smoke-roles-waveA.ts
// Checks: exactly one line-started ```json block per file, it parses, and it has the proposed fields.
// The zod shapes below are PROPOSALS for the lead's ROLE_OUTPUT (lib/contracts is lead-owned; not edited here).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PlanAction } from "../lib/contracts/types";

const ROOT = join(__dirname, "..");
const FENCE = "```";
const iso = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
const win = z.object({ window_start: iso, window_end: iso });
const span = z.object({ start: iso, end: iso });
const nstr = z.string().nullable();

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  reliability: z.object({
    status: z.enum(["ok", "BLOCKED"]), blocked_reason: nstr, asset_id: z.string(), source: z.enum(["fiix", "none"]),
    work_orders: z.array(z.object({ code: z.string(), date: nstr, description: z.string(), status: z.string() })),
    prior_failures: z.number().int().min(0), mean_days_between_failures: z.number().nullable(), recurring: z.boolean(),
    root_cause: z.string(), recommended_fix: z.enum(["replace", "clean", "inspect"]), repair_asap: z.boolean(),
    confidence: z.number().min(0).max(1), summary: z.string(),
  }).strict(),
  production: z.object({
    status: z.enum(["ok", "partial", "BLOCKED"]), blocked_reason: nstr, source: z.enum(["sheets", "seed_file", "none"]), line: z.string(),
    candidates: z.array(win.extend({
      schedule_status: z.string(), impact: z.enum(["none", "lowest", "low", "medium", "high"]),
      planned_throughput_tph: z.number(), lost_tonnes: z.number(), note: z.string(),
    })),
    preferred_window: win.nullable(), production_impact: z.enum(["none", "low", "medium", "high"]), summary: z.string(),
  }).strict(),
  workforce: z.object({
    status: z.enum(["ok", "partial", "BLOCKED"]), blocked_reason: nstr, source: z.enum(["calendar", "seed_file", "none"]),
    technician: nstr, trade: nstr, certifications: z.array(z.string()), shift: nstr,
    busy: z.array(span.extend({ title: z.string() })), free: z.array(span), earliest_free: span.nullable(),
    unavailable_note: z.string(), summary: z.string(),
  }).strict(),
  risk: z.object({
    safety_critical: z.boolean(), loto_required: z.boolean(), loto_sop: z.string(), loto_steps: z.array(z.string()),
    actions: z.array(PlanAction), corrections: z.array(z.string()), delay_risk: z.enum(["low", "medium", "high"]),
    delay_risk_reason: z.string(), go: z.boolean(), summary: z.string(),
  }).strict(),
  procurement: z.object({
    status: z.enum(["dry_run", "sent", "BLOCKED"]), blocked_reason: nstr, mode: z.enum(["dry_run", "send"]), monid_tool: nstr,
    email: z.object({ to: nstr, subject: z.string(), body: z.string() }),
    part: z.string(), quantity: z.number().int().positive(), supplier: z.string(), supplier_url: z.string().url().nullable(),
    sent: z.boolean(), message_id: nstr, summary: z.string(),
  }).strict().refine((o) => o.status !== "dry_run" || (o.sent === false && o.message_id === null), "dry_run must not be sent"),
  dispatch: z.object({
    status: z.enum(["ok", "partial", "BLOCKED"]), blocked_reason: nstr, technician: z.string(), window_start: iso, window_end: iso,
    calendar: z.object({ status: z.enum(["ok", "BLOCKED"]), event_id: nstr, link: nstr, error: nstr }),
    slack: z.object({ status: z.enum(["ok", "BLOCKED"]), channel: nstr, ts: nstr, text: z.string(), error: nstr }),
    email: z.object({ status: z.enum(["ok", "skipped", "BLOCKED"]), message_id: nstr, error: nstr }),
    summary: z.string(),
  }).strict(),
};

function jsonBlocks(text: string): string[] {
  const out: string[] = [];
  let cur: string[] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (cur === null && line === FENCE + "json") cur = [];
    else if (cur !== null && line === FENCE) { out.push(cur.join("\n")); cur = null; }
    else if (cur !== null) cur.push(raw);
  }
  return out;
}

let failed = 0;
for (const [role, schema] of Object.entries(SCHEMAS)) {
  const md = readFileSync(join(ROOT, "agent/skills/roles", `${role}.md`), "utf8");
  const blocks = jsonBlocks(md);
  let msg = "";
  try {
    if (blocks.length !== 1) throw new Error(`expected 1 json block, got ${blocks.length}`);
    if (!md.trimEnd().endsWith(FENCE)) throw new Error("text after the json block");
    const r = schema.safeParse(JSON.parse(blocks[0]));
    if (!r.success) throw new Error(r.error.message);
  } catch (e) {
    msg = (e as Error).message;
  }
  if (msg) failed++;
  console.log(`${msg ? "FAIL" : "PASS"}  ${role}${msg ? "  " + msg : ""}`);
}
process.exit(failed ? 1 : 0);
