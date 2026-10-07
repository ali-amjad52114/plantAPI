// Real check of the no-ack reminder: one dispatch follow-up turn (Slack reminder + Gmail notice) for an
// existing incident, run directly on Agent37 — no DB writes. Run: npx tsx lib/engine/eval/reminder-check.ts <incident_id>
import { loadEnv } from "../../db/env";
loadEnv();
async function main() {
  const { getIncident } = await import("../index");
  const { buildTaskText } = await import("../prompts");
  const { reminderAction } = await import("../depth.pure");
  const { agent37 } = await import("../../agent37");
  const { schemaFor } = await import("../wave-a-schemas");
  const { extractLastJson } = await import("../../ai");
  const incident = await getIncident(process.argv[2]);
  const { supabaseAdmin } = await import("../../db");
  const a = (await supabaseAdmin().from("approvals").select("decision,decided_by,note,created_at").eq("incident_id", incident.id).order("created_at", { ascending: false }).limit(1)).data?.[0];
  if (!a || a.decision !== "approve") throw new Error("incident has no approval — the reminder only runs for approved plans");
  const approval = { decision: a.decision, decided_by: a.decided_by, note: a.note, decided_at: a.created_at };
  const input = buildTaskText("dispatch", incident, { approval, follow_up: true, reason: "no Slack ack (reminder check)", action: process.argv.includes("--slack-only") ? reminderAction().split(" (2) ")[0] + " (2) Gmail: skip in this check — report it with status blocked, detail \"skipped by check\". Do NOT place any phone call." : reminderAction() });
  const t0 = Date.now();
  const turn = await agent37.runTurn({ instanceId: process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw", role: "dispatch", incidentId: incident.id, input }, () => {});
  const out = schemaFor("dispatch").safeParse(extractLastJson(turn.outputText));
  console.log(`turn ${turn.responseId} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(out.success ? JSON.stringify((out.data as { notices: unknown }).notices, null, 2) : turn.outputText.slice(-1500));
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
