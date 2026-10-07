// Offline smoke test for the wave-A role files (S2/C6). No network, no Agent37 turns, no paid calls.
// Run: npx tsx scripts/smoke-roles-waveA.ts
// Checks: exactly one line-started ```json block per file, nothing after it, and it matches the wave-A schema
// (scripts/lib/wave-a-schemas.ts = copy of plantapi-core lib/engine/wave-a-schemas.ts until s/core is on main).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WAVE_A_OUTPUT } from "./lib/wave-a-schemas";

const ROOT = join(__dirname, "..");
const FENCE = "```";

export function jsonBlocks(text: string): string[] {
  const out: string[] = [];
  let cur: string[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (cur === null && line === FENCE + "json") cur = [];
    else if (cur !== null && line === FENCE) { out.push(cur.join("\n")); cur = null; }
    else if (cur !== null) cur.push(raw);
  }
  return out;
}

let failed = 0;
for (const [role, schema] of Object.entries(WAVE_A_OUTPUT)) {
  const md = readFileSync(join(ROOT, "agent/skills/roles", `${role}.md`), "utf8");
  const blocks = jsonBlocks(md);
  let msg = "";
  try {
    if (blocks.length !== 1) throw new Error(`expected 1 json block, got ${blocks.length}`);
    if (!md.trimEnd().endsWith(FENCE)) throw new Error("text after the json block");
    if (/schema needed from lead/i.test(md)) throw new Error('still says "schema needed from lead"');
    const r = schema.safeParse(JSON.parse(blocks[0]));
    if (!r.success) throw new Error(r.error.message);
  } catch (e) {
    msg = (e as Error).message;
  }
  if (msg) failed++;
  console.log(`${msg ? "FAIL" : "PASS"}  ${role}${msg ? "  " + msg : ""}`);
}
process.exit(failed ? 1 : 0);
