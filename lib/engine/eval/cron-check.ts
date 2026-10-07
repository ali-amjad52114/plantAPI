// Real check of the Agent37 cron API: create a far-future one-shot cron, run it now, read the run + session, delete it.
// Run: npx tsx lib/engine/eval/cron-check.ts
import { loadEnv } from "../../db/env";
loadEnv();
async function main() {
  const c = await import("../../agent37/crons");
  const id = "pfd5d7eukw";
  const cron = await c.createCron(id, { name: "plantapi-cron-check", prompt: 'Reply with exactly: {"ack_received":false,"evidence":null}', schedule: c.oneShotSchedule(new Date(Date.now() + 30 * 86400_000)) });
  console.log("created", cron.id, cron.schedule, cron.next_run);
  try {
    const run = await c.runCronNow(id, cron.id);
    console.log("run", JSON.stringify(run).slice(0, 300));
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const runs = await c.cronRuns(id, cron.id);
      const r = runs[0];
      if (r?.session_id) {
        try {
          const s = await c.getSession(id, r.session_id);
          const strs = c.allStrings(s).filter((x) => x.includes("ack_received"));
          if (strs.length > 1 || (strs.length && i > 3)) { console.log("run status", r.status, "session", r.session_id, "| last:", strs.at(-1)?.slice(0, 200)); console.log("session keys", Object.keys(s as object)); break; }
        } catch (e) { console.log("session err", String(e).slice(0, 200)); }
      }
    }
  } finally {
    console.log("delete", await c.deleteCron(id, cron.id));
  }
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
