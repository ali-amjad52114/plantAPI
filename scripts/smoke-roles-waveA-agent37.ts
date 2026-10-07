// Real Agent37 smoke for the wave-A role skills (S2/C6).
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-roles-waveA-agent37.ts [role ...]
// Uploads the wave-A role files + tool skills + seed to the plant instance and runs ONE real turn per role:
//   reliability ∥ production ∥ workforce  →  risk  →  procurement ∥ dispatch
// Inputs reuse the real slice-1 outputs from the last smoke-roles-agent37 run (tmp/plantapi-smoke-roles/*.txt).
// Safety: no Fiix writes (reliability reads history only), no Calendar/Slack/Gmail writes, no email sends,
// no calls, no Odoo writes. Validates each final JSON with zod (scripts/lib/wave-a-schemas.ts). Cap $1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { agent37 } from "../lib/agent37/index";
import { WAVE_A_OUTPUT, type WaveARole } from "./lib/wave-a-schemas";

const ROOT = join(__dirname, "..");
const ID = process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";
const HOME = "/home/node/plantapi";
const PREV = join(tmpdir(), "plantapi-smoke-roles");
const OUT = join(tmpdir(), "plantapi-smoke-roles-waveA");
const MAX_SPEND = 1.0;
const MAX_TRIES = 3; // 1 + 2 retries
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const want = (r: string) => only.length === 0 || only.includes(r);


/** Last fenced json block (fence at line start); falls back to the last top-level {...}. */
function extractJson(text: string): unknown {
  const blocks: string[] = [];
  let cur: string[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (cur === null && line === "```json") cur = [];
    else if (cur !== null && line === "```") { blocks.push(cur.join("\n")); cur = null; }
    else if (cur !== null) cur.push(raw);
  }
  if (blocks.length) return JSON.parse(blocks[blocks.length - 1]);
  const end = text.lastIndexOf("}");
  for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* widen */ }
  }
  throw new Error("no JSON found in reply");
}

let spend = 0;
const results: string[] = [];

async function upload() {
  const files: Array<[string, string]> = [];
  for (const r of Object.keys(WAVE_A_OUTPUT)) files.push([`agent/skills/roles/${r}.md`, `${HOME}/skills/roles/${r}.md`]);
  for (const s of ["fiix", "odoo", "monid"]) files.push([`agent/skills/${s}/SKILL.md`, `${HOME}/skills/${s}/SKILL.md`]);
  for (const s of ["sheets", "calendar", "slack", "gmail"]) if (existsSync(join(ROOT, `agent/skills/${s}.md`))) files.push([`agent/skills/${s}.md`, `${HOME}/skills/${s}.md`]);
  for (const s of ["LOTO-CV104.md", "contactor-LC1D09BD.md"]) files.push([`seed/sop/${s}`, `${HOME}/seed/sop/${s}`]);
  for (const s of ["alarm.txt", "technicians.json", "production_schedule.csv", "calendar_events.json"]) files.push([`seed/${s}`, `${HOME}/seed/${s}`]);
  const dirs = [...new Set(files.map(([, d]) => d.slice(0, d.lastIndexOf("/"))))];
  await agent37.exec(ID, `mkdir -p ${dirs.join(" ")}`);
  for (const [src, dst] of files) await agent37.uploadFile(ID, dst, readFileSync(join(ROOT, src)));
  console.log(`uploaded ${files.length} files to ${ID}:${HOME}`);
}

const SAFETY =
  "SMOKE RUN (lead-authorized test): READ ONLY. Do NOT create/edit/close anything in Fiix, Odoo, Google Calendar, Slack or Gmail. " +
  "Do NOT send any email, do NOT place any call, do NOT create crons, do NOT purchase. Free Monid discover/inspect is fine; no paid Monid runs.";

function task(role: WaveARole, context: Record<string, unknown>, note = ""): string {
  return [
    `You are the PlantAPI ${role} agent. Read and follow your role skill file ${HOME}/skills/roles/${role}.md exactly (use cat).`,
    `Tool skills live in ${HOME}/skills/: fiix/SKILL.md, odoo/SKILL.md, monid/SKILL.md, sheets.md, calendar.md, slack.md, gmail.md ` +
      `(a path like agent/skills/sheets.md in the role file means ${HOME}/skills/sheets.md). Seed/reference files: ${HOME}/seed/ (= ~/plantapi/seed/). ` +
      `Env vars for systems: source ${HOME}/plant.env if they are not set.`,
    SAFETY,
    note,
    "## Incident context (JSON)",
    JSON.stringify(context, null, 2),
    "",
    "Real data only: never invent record ids, WO codes, event ids or message ids. End your reply with exactly one fenced ```json block matching the role's output schema, and nothing after it.",
  ].filter(Boolean).join("\n");
}

async function turn(role: WaveARole, input: string): Promise<unknown> {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    if (spend >= MAX_SPEND) {
      results.push(`FAIL  ${role}  spend cap $${MAX_SPEND} reached`);
      return null;
    }
    const t0 = Date.now();
    let line = "";
    try {
      const r = await agent37.runTurn({ instanceId: ID, role, incidentId: "smoke-waveA", input, reasoningEffort: "low" }, () => {});
      spend += r.costUsd ?? 0;
      writeFileSync(join(OUT, `${role}.txt`), r.outputText);
      const secs = (r.durationMs / 1000).toFixed(1);
      const parsed = WAVE_A_OUTPUT[role].safeParse(extractJson(r.outputText));
      if (parsed.success) {
        const msg = `PASS  ${role}  ${secs}s $${r.costUsd ?? "?"} try ${attempt}  ${JSON.stringify(parsed.data).slice(0, 260)}`;
        console.log(msg);
        results.push(msg);
        return parsed.data;
      }
      line = `FAIL  ${role}  ${secs}s $${r.costUsd ?? "?"} try ${attempt}  schema: ${parsed.error.message.slice(0, 300)}`;
    } catch (e) {
      line = `FAIL  ${role}  ${((Date.now() - t0) / 1000).toFixed(1)}s try ${attempt}  ${(e as Error).message.slice(0, 300)}`;
    }
    console.log(line);
    if (attempt === MAX_TRIES) results.push(line);
  }
  return null;
}

const prev = (dir: string, label: string) => {
  try {
    return extractJson(readFileSync(join(dir, `${label}.txt`), "utf8"));
  } catch {
    return null;
  }
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const triage = prev(PREV, "triage");
  const materials = prev(PREV, "materials");
  const plan = prev(PREV, "coordinator");
  if (!triage || !plan) throw new Error(`need real slice-1 outputs in ${PREV} (run smoke-roles-agent37 first)`);
  await upload();
  const id = "smoke-waveA";

  const [reliability] = await Promise.all([
    want("reliability") ? turn("reliability", task("reliability", { incident_id: id, triage }, "Fiix: run only `login` and `history` (read). If another agent holds the browser and it fails twice, report BLOCKED as the role says.")) : prev(OUT, "reliability"),
    want("production") ? turn("production", task("production", { incident_id: id, triage, allow_seed_fallback: true })) : null,
    want("workforce") ? turn("workforce", task("workforce", { incident_id: id, triage, allow_seed_fallback: true })) : null,
  ]);
  if (want("risk")) await turn("risk", task("risk", { incident_id: id, plan, reliability }));
  const approval = { decision: "approve", decided_by: "smoke", note: "dry run" };
  await Promise.all([
    want("procurement")
      ? turn("procurement", task("procurement", { incident_id: id, plan, materials, approval, send: false, supplier_email: "test-inbox@example.invalid" }, "DRY RUN: send is false. Compose only."))
      : null,
    want("dispatch")
      ? turn("dispatch", task("dispatch", { incident_id: id, plan, erp: null, approval, dry_run: true }, "DRY RUN: dry_run is true. Write nothing; you may READ Calendar/Slack connection status (COMPOSIO_SEARCH_TOOLS) to report blocked vs drafted."))
      : null,
  ]);
  console.log("\n" + results.join("\n"));
  const failed = results.filter((l) => l.startsWith("FAIL")).length;
  console.log(`\nAgent37 spend this run: $${spend.toFixed(4)}  ${failed === 0 ? "ALL PASS" : `${failed} FAIL`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE FAIL", (e as Error).message);
  process.exit(1);
});
