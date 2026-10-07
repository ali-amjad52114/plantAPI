// Real Agent37 smoke for the role skills (S2/C4).
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-roles-agent37.ts [role ...]
// Uploads agent/skills/roles/*.md + fiix/odoo/monid SKILL.md + seed photos to the plant instance,
// runs one real turn per role (outputs chain: triage -> materials -> coordinator -> erp -> verification),
// extracts the final json block and validates it with ROLE_OUTPUT (zod). Prints PASS/FAIL, latency, cost.
// Safety: ERP and Verification run in DRY RUN mode (no browser, no Fiix/Odoo writes) because C1 drives
// the Fiix browser on the same instance; Materials does real Odoo reads + one Monid search.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { agent37 } from "../lib/agent37/index";
import { ROLE_OUTPUT, type Slice1Role } from "../lib/contracts/types";

const ROOT = join(__dirname, "..");
const ID = process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";
const HOME = "/home/node/plantapi";
const OUT = join(tmpdir(), "plantapi-smoke-roles");
const FENCE = "```";
const MAX_SPEND = 1.0;
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

let spend = 0;
let failed = 0;

/** Last fenced json block (fence at line start); falls back to the last top-level {...} in the text. */
export function extractJson(text: string): unknown {
  const blocks: string[] = [];
  let cur: string[] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (cur === null && line === FENCE + "json") cur = [];
    else if (cur !== null && line === FENCE) {
      blocks.push(cur.join("\n"));
      cur = null;
    } else if (cur !== null) cur.push(raw);
  }
  if (blocks.length) return JSON.parse(blocks[blocks.length - 1]);
  const end = text.lastIndexOf("}");
  for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch { /* widen */ }
  }
  throw new Error("no JSON found in reply");
}

async function upload() {
  const files: Array<[string, string]> = [];
  for (const r of ["triage", "materials", "coordinator", "erp", "verification"]) files.push([`agent/skills/roles/${r}.md`, `${HOME}/skills/roles/${r}.md`]);
  for (const s of ["fiix", "odoo", "monid"]) files.push([`agent/skills/${s}/SKILL.md`, `${HOME}/skills/${s}/SKILL.md`]);
  for (const p of ["failure-burned-contactor.jpg", "completion-wrong-part.jpg", "completion-correct-part.jpg"]) files.push([`seed/photos/${p}`, `${HOME}/seed/photos/${p}`]);
  for (const s of ["LOTO-CV104.md", "contactor-LC1D09BD.md"]) files.push([`seed/sop/${s}`, `${HOME}/seed/sop/${s}`]);
  for (const s of ["alarm.txt", "technicians.json", "production_schedule.csv", "calendar_events.json"]) files.push([`seed/${s}`, `${HOME}/seed/${s}`]);
  const dirs = [...new Set(files.map(([, d]) => d.slice(0, d.lastIndexOf("/"))))];
  await agent37.exec(ID, `mkdir -p ${dirs.join(" ")}`);
  for (const [src, dst] of files) await agent37.uploadFile(ID, dst, readFileSync(join(ROOT, src)));
  console.log(`uploaded ${files.length} files to ${ID}:${HOME}`);
}

function task(role: Slice1Role, context: Record<string, unknown>, note = ""): string {
  return [
    `You are the PlantAPI ${role} agent. Read and follow your role skill file ${HOME}/skills/roles/${role}.md exactly (use cat).`,
    `Tool skills: ${HOME}/skills/fiix/SKILL.md, ${HOME}/skills/odoo/SKILL.md, ${HOME}/skills/monid/SKILL.md. Seed/reference files: ${HOME}/seed/. Env vars for systems: source ${HOME}/plant.env if they are not set.`,
    note,
    "## Incident context (JSON)",
    JSON.stringify(context, null, 2),
    "",
    "Real data only: never invent record ids, prices or WO codes. End your reply with exactly one fenced ```json block matching the skill's output schema, and nothing after it.",
  ].filter(Boolean).join("\n");
}

const DRY =
  "SMOKE DRY RUN: another agent is using the browser on this instance. Do NOT open the browser and do NOT write to Fiix or Odoo (reads via the Odoo API are fine).";

async function turn<R extends Slice1Role>(role: R, label: string, input: string, files?: string[]) {
  if (spend >= MAX_SPEND) throw new Error(`spend cap $${MAX_SPEND} reached`);
  const t0 = Date.now();
  try {
    const r = await agent37.runTurn(
      { instanceId: ID, role, incidentId: "smoke-roles", input, files, reasoningEffort: "low" },
      () => {},
    );
    spend += r.costUsd ?? 0;
    writeFileSync(join(OUT, `${label}.txt`), r.outputText);
    const parsed = ROLE_OUTPUT[role].safeParse(extractJson(r.outputText));
    const secs = (r.durationMs / 1000).toFixed(1);
    if (!parsed.success) {
      failed++;
      console.log(`FAIL  ${label}  ${secs}s $${r.costUsd ?? "?"}  schema: ${parsed.error.message.slice(0, 400)}`);
      return null;
    }
    console.log(`PASS  ${label}  ${secs}s $${r.costUsd ?? "?"}  ${JSON.stringify(parsed.data).slice(0, 220)}`);
    return parsed.data as ReturnType<(typeof ROLE_OUTPUT)[R]["parse"]>;
  } catch (e) {
    failed++;
    console.log(`FAIL  ${label}  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${(e as Error).message.slice(0, 300)}`);
    return null;
  }
}

const want = (r: string) => only.length === 0 || only.includes(r);
const prev = (label: string) => {
  try {
    return extractJson(readFileSync(join(OUT, `${label}.txt`), "utf8"));
  } catch {
    return null;
  }
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  await upload();
  const alarm = readFileSync(join(ROOT, "seed/alarm.txt"), "utf8");
  const failurePhoto = `${HOME}/seed/photos/failure-burned-contactor.jpg`;

  const triage = want("triage")
    ? await turn("triage", "triage", task("triage", { incident_id: "smoke-roles", alarm_text: alarm, photo: failurePhoto }), [failurePhoto])
    : prev("triage");
  const materials = want("materials")
    ? await turn("materials", "materials", task("materials", { incident_id: "smoke-roles", triage }))
    : prev("materials");
  const plan = want("coordinator")
    ? await turn("coordinator", "coordinator", task("coordinator", { incident_id: "smoke-roles", triage, materials }))
    : prev("coordinator");
  const erp = want("erp")
    ? await turn(
        "erp",
        "erp",
        task(
          "erp",
          { incident_id: "smoke-roles", plan, approval: { decision: "approve", decided_by: "smoke", note: "dry run" } },
          DRY + ' For this dry run: read the Odoo work centre state for Crushing Line 2 and report an existing open block id if there is one (else null); set fiix_wo_code "DRY-RUN", fiix_wo_status "not created (dry run)", screenshot_path null.',
        ),
      )
    : prev("erp");
  if (want("verification")) {
    for (const [photo, expect] of [["completion-wrong-part.jpg", "reject"], ["completion-correct-part.jpg", "accept"]] as const) {
      const p = `${HOME}/seed/photos/${photo}`;
      const v = await turn(
        "verification",
        `verification-${expect}`,
        task(
          "verification",
          {
            incident_id: "smoke-roles",
            plan,
            erp,
            completion: { notes: "Replaced KM104 contactor, test-ran 10 min OK", actual_downtime_minutes: 50, photo: p },
          },
          DRY + " Judge the evidence and give the verdict, but set fiix_closed and odoo_unblocked to false.",
        ),
        [p],
      );
      if (v && v.verdict !== expect) {
        failed++;
        console.log(`FAIL  verification-${expect}  verdict=${v.verdict} expected=${expect}: ${v.reason}`);
      }
    }
  }
  console.log(`\nAgent37 spend this run: $${spend.toFixed(4)}  ${failed === 0 ? "ALL PASS" : `${failed} FAIL`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE FAIL", (e as Error).message);
  process.exit(1);
});
