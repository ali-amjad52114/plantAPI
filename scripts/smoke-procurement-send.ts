// Real procurement send + idempotency proof (S2, wave B).
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-procurement-send.ts [incident_id]
// 1) one real Agent37 procurement turn on the plant instance (approved plan) -> exactly one AgentMail send ($0.001)
// 2) independent check from here via Monid /list-messages (free): exactly 1 message tagged [PlantAPI <id>]
// 3) second turn with the same incident -> must NOT send (same message_id, count still 1)
// Recipient is fixed in the role to rs-supplier-demo@agentmail.to (our demo inbox). Spend cap $0.01 Monid.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { agent37 } from "../lib/agent37/index";
import { ProcurementOutput } from "./lib/wave-a-schemas";

const ROOT = join(__dirname, "..");
const ID = process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";
const HOME = "/home/node/plantapi";
const INBOX = "rs-supplier-demo@agentmail.to";
const API = process.env.MONID_BASE_URL || "https://api.monid.ai";
const OUT = join(tmpdir(), "plantapi-smoke-procurement");
const incident = process.argv[2] ?? `smoke-proc-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
const TAG = `[PlantAPI ${incident}]`;

function extractJson(text: string): unknown {
  const blocks: string[] = [];
  let cur: string[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (cur === null && line === "```json") cur = [];
    else if (cur !== null && line === "```") { blocks.push(cur.join("\n")); cur = null; }
    else if (cur !== null) cur.push(raw);
  }
  if (!blocks.length) throw new Error("no json block in reply");
  return JSON.parse(blocks[blocks.length - 1]);
}

async function monid(endpoint: string, body: unknown): Promise<any> {
  const key = process.env.MONID_API_KEY;
  if (!key) throw new Error("MONID_API_KEY missing");
  const res = await fetch(`${API}/v1/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "agentmail", endpoint, input: { body } }),
  });
  let r = await res.json();
  if (!res.ok) throw new Error(`${endpoint} -> ${res.status}: ${JSON.stringify(r).slice(0, 300)}`);
  for (let i = 0; i < 30 && !["COMPLETED", "FAILED", "BLOCKED", "STOPPED", "TIMED_OUT"].includes(r.status); i++) {
    await new Promise((s) => setTimeout(s, 2000));
    r = await (await fetch(`${API}/v1/runs/${r.runId}`, { headers: { Authorization: `Bearer ${key}` } })).json();
  }
  if (r.status !== "COMPLETED") throw new Error(`${endpoint} ${r.status}`);
  return r.output;
}

/** Messages in the demo inbox whose subject carries this incident's tag (free). */
async function tagged(): Promise<Array<{ message_id: string; subject: string }>> {
  const out = await monid("/list-messages", { inboxId: INBOX, limit: 50 });
  return (out.messages ?? []).filter((m: any) => String(m.subject ?? "").includes(TAG));
}

async function turn(label: string) {
  const plan = extractJson(readFileSync(join(tmpdir(), "plantapi-smoke-roles", "coordinator.txt"), "utf8"));
  const input = [
    `You are the PlantAPI procurement agent. Read and follow your role skill file ${HOME}/skills/roles/procurement.md exactly (use cat).`,
    `Tool skill: ${HOME}/skills/monid/SKILL.md (AgentMail section). (agent/skills/... in the role file means ${HOME}/skills/...)`,
    "Lead-authorized wave B test: the plan below is APPROVED; a real send to the fixed demo inbox is allowed, at most one per incident.",
    "## Incident context (JSON)",
    JSON.stringify({ incident_id: incident, plan, approval: { decision: "approve", decided_by: "lead (wave B test)", note: "real send test" } }, null, 2),
    "",
    "Real data only: never invent a message_id. End your reply with exactly one fenced ```json block, nothing after it.",
  ].join("\n");
  const r = await agent37.runTurn({ instanceId: ID, role: "procurement", incidentId: incident, input, reasoningEffort: "low" }, () => {});
  writeFileSync(join(OUT, `${label}.txt`), r.outputText);
  const parsed = ProcurementOutput.safeParse(extractJson(r.outputText));
  if (!parsed.success) throw new Error(`${label} schema: ${parsed.error.message.slice(0, 300)}`);
  console.log(`${label}: ${(r.durationMs / 1000).toFixed(1)}s sent=${parsed.data.expedite_email?.sent} id=${parsed.data.expedite_email?.message_id} blocked=${JSON.stringify(parsed.data.blocked)}`);
  return parsed.data;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const [src, dst] of [["agent/skills/roles/procurement.md", `${HOME}/skills/roles/procurement.md`], ["agent/skills/monid/SKILL.md", `${HOME}/skills/monid/SKILL.md`]])
    await agent37.uploadFile(ID, dst, readFileSync(join(ROOT, src)));
  console.log(`incident ${incident}; tagged before: ${(await tagged()).length}`);

  const a = await turn("send-1");
  const after1 = await tagged();
  const ok1 = a.expedite_email?.sent === true && !!a.expedite_email.message_id && a.expedite_email.to === INBOX && after1.length === 1;
  console.log(`${ok1 ? "PASS" : "FAIL"}  send: inbox has ${after1.length} tagged message(s): ${after1.map((m) => m.message_id).join(", ")}`);

  const b = await turn("send-2");
  const after2 = await tagged();
  const ok2 = after2.length === 1 && b.expedite_email?.message_id === a.expedite_email?.message_id && b.blocked.some((x) => x.startsWith("idempotent"));
  console.log(`${ok2 ? "PASS" : "FAIL"}  idempotent rerun: inbox still ${after2.length} tagged, same id=${b.expedite_email?.message_id === a.expedite_email?.message_id}`);
  process.exit(ok1 && ok2 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE FAIL", (e as Error).message);
  process.exit(1);
});
