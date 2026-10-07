// S1 smoke: one REAL Triage turn end to end — photo → Supabase storage, incident row,
// engine.start, worker-style claim + run (OpenAI vision + Agent37 turn), events in Supabase.
// Run: npx tsx scripts/smoke-core.ts
import { readFileSync } from "node:fs";
import { loadEnv } from "../lib/db/env";

loadEnv();

async function main() {
  const { supabaseAdmin } = await import("../lib/db");
  const { engine, claimNextTask, runTask, getIncident } = await import("../lib/engine");
  const db = supabaseAdmin();
  const t0 = Date.now();

  const key = `smoke/${Date.now()}-failure-burned-contactor.jpg`;
  const up = await db.storage.from("evidence").upload(key, readFileSync("seed/photos/failure-burned-contactor.jpg"), { contentType: "image/jpeg" });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  const photoUrl = db.storage.from("evidence").getPublicUrl(key).data.publicUrl;

  const plant = await db.from("plants").select("id").limit(1).single();
  if (plant.error) throw new Error(plant.error.message);
  const alarm = readFileSync("seed/alarm.txt", "utf8").trim();
  const ins = await db.from("incidents").insert({ plant_id: plant.data.id, title: "SMOKE " + alarm.split("\n")[0].slice(0, 80), alarm_text: alarm, photo_url: photoUrl, status: "NEW" }).select("id").single();
  if (ins.error) throw new Error(ins.error.message);
  const id = ins.data.id as string;
  console.log("incident", id);

  await engine.start(id);
  const task = await claimNextTask();
  if (!task || task.incident_id !== id) throw new Error(`claimed wrong task: ${task?.incident_id}`);
  await runTask(task);

  const inc = await getIncident(id);
  const ev = await db.from("agent_events").select("agent,kind,system,message").eq("incident_id", id).order("created_at");
  const tasks = await db.from("agent_tasks").select("role,status,agent37_response_id,error").eq("incident_id", id).order("created_at");
  console.log("status:", inc.status);
  console.log("triage:", JSON.stringify(inc.triage, null, 2));
  console.log("tasks:", tasks.data);
  for (const e of ev.data ?? []) console.log(`  [${e.system}] ${e.agent}/${e.kind}: ${e.message}`);
  console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const ok = inc.status === "PLANNING" && inc.triage !== null;
  console.log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
