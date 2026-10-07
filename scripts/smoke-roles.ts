// Smoke test for agent/skills/roles/*.md (S2/C4).
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-roles.ts [--offline]
// 1) validates each role file's example json block against ROLE_OUTPUT[role] (zod)
// 2) live: verification role on the 2 completion photos via OpenAI vision (2 calls), asserts reject / accept
import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { ROLE_OUTPUT, type Slice1Role } from "../lib/contracts/types";

const ROOT = join(__dirname, "..");
const ROLES: Slice1Role[] = ["triage", "materials", "coordinator", "erp", "verification"];
const FENCE = "```";
let failed = 0;
const report = (ok: boolean, label: string, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
};

/** JSON bodies of fenced json blocks whose fence starts a line (prose mentions are ignored). */
function jsonBlocks(text: string): string[] {
  const out: string[] = [];
  let cur: string[] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (cur === null && line === FENCE + "json") cur = [];
    else if (cur !== null && line === FENCE) {
      out.push(cur.join("\n"));
      cur = null;
    } else if (cur !== null) cur.push(raw);
  }
  return out;
}
function lastJson(text: string): unknown {
  const blocks = jsonBlocks(text);
  if (blocks.length === 0) throw new Error("no json block");
  return JSON.parse(blocks[blocks.length - 1]);
}

// ---- 1. static: example JSON in each role file ----
for (const role of ROLES) {
  const md = readFileSync(join(ROOT, "agent/skills/roles", `${role}.md`), "utf8");
  try {
    const count = jsonBlocks(md).length;
    const parsed = ROLE_OUTPUT[role].safeParse(lastJson(md));
    report(parsed.success && count === 1, `schema ${role}`, parsed.success ? `(json blocks: ${count})` : parsed.error.message);
  } catch (e) {
    report(false, `schema ${role}`, (e as Error).message);
  }
}

// ---- 2. live: verification on the completion photos ----
async function live() {
  if (process.argv.includes("--offline")) return console.log("SKIP  live verification (--offline)");
  if (!process.env.OPENAI_API_KEY) return report(false, "live verification", "OPENAI_API_KEY not set");
  const model = process.env.OPENAI_MODEL_SMART ?? "gpt-5.5";
  const client = new OpenAI();
  const skill = readFileSync(join(ROOT, "agent/skills/roles/verification.md"), "utf8");
  const sop = readFileSync(join(ROOT, "seed/sop/contactor-LC1D09BD.md"), "utf8");
  const cases = [
    { file: "completion-wrong-part.jpg", expect: "reject" },
    { file: "completion-correct-part.jpg", expect: "accept" },
  ] as const;
  for (const c of cases) {
    const b64 = readFileSync(join(ROOT, "seed/photos", c.file)).toString("base64");
    const task =
      `incident_id: smoke-roles\n` +
      `plan: part LC1D09BD on CV-104 (Crushing Line 2), technician Sarah Chen\n` +
      `erp: fiix_wo_code WO-SMOKE, odoo_block_ref null\n` +
      `completion: notes "Replaced KM104 contactor, test-ran 10 min OK", actual_downtime_minutes 50, photo attached.\n` +
      `Equipment note:\n${sop}\n\n` +
      `SMOKE TEST: do NOT use any tools or write to any system; set fiix_closed and odoo_unblocked to false. Judge the photo only.`;
    const t0 = Date.now();
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: skill },
          {
            role: "user",
            content: [
              { type: "text", text: task },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
            ],
          },
        ],
      });
      const ms = Date.now() - t0;
      const text = res.choices[0]?.message?.content ?? "";
      const parsed = ROLE_OUTPUT.verification.safeParse(lastJson(text));
      if (!parsed.success) {
        report(false, `live verification ${c.file}`, `${ms} ms schema: ${parsed.error.message}`);
        continue;
      }
      const u = res.usage;
      const failedChecks = parsed.data.checks.filter((k) => !k.pass).map((k) => k.name).join(",") || "none";
      report(
        parsed.data.verdict === c.expect,
        `live verification ${c.file}`,
        `verdict=${parsed.data.verdict} expected=${c.expect} ${ms} ms tokens=${u?.prompt_tokens ?? "?"}/${u?.completion_tokens ?? "?"} failed_checks=${failedChecks} reason="${parsed.data.reason}"`,
      );
    } catch (e) {
      report(false, `live verification ${c.file}`, `${Date.now() - t0} ms ${(e as Error).message}`);
    }
  }
}

live().then(() => {
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAIL`);
  process.exit(failed === 0 ? 0 : 1);
});
