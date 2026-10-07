// Real check of the ack follow-up: the real ack prompt on a real Agent37 cron, fired now, answer read
// from the firing's session, cron deleted. No DB writes. Run: npx tsx lib/engine/eval/ack-cron-check.ts [incident_id]
import { loadEnv } from "../../db/env";
loadEnv();
async function main() {
  const c = await import("../../agent37/crons");
  const { ackPrompt } = await import("../depth");
  const { extractLastJson } = await import("../../ai");
  const id = process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";
  const prompt = ackPrompt({ id: process.argv[2] ?? "dd94429f", plan: { technician: "Sarah Chen" } } as never, new Date(Date.now() - 3600_000).toISOString());
  const cron = await c.createCron(id, { name: "plantapi-ack-check", prompt, schedule: c.oneShotSchedule(new Date(Date.now() + 30 * 86400_000)) });
  console.log("cron", cron.id);
  try {
    const run = await c.runCronNow(id, cron.id);
    console.log("run", run.status, run.session_id);
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const text = c.lastAssistantText(await c.getSession(id, run.session_id!).catch(() => null));
      const j = text ? (extractLastJson(text) as { ack_received?: boolean } | null) : null;
      if (j && typeof j.ack_received === "boolean") { console.log("answer", JSON.stringify(j)); break; }
    }
  } finally {
    console.log("deleted", (await c.deleteCron(id, cron.id)).deleted);
  }
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
