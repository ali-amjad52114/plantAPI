// S1 smoke: drives an incident through the REST of slice 1 with real turns.
// Run: npx tsx scripts/smoke-slice.ts <incident_id>   (incident must be in PLANNING with triage done, or later)
import { readFileSync } from "node:fs";
import { loadEnv } from "../lib/db/env";

loadEnv();

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("usage: smoke-slice.ts <incident_id>");
  const { supabaseAdmin } = await import("../lib/db");
  const { engine, claimNextTask, runTask, getIncident } = await import("../lib/engine");
  const db = supabaseAdmin();
  const t0 = Date.now();
  const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);

  // Runs this incident's tasks until it rests at a human step. The lead's worker may claim some
  // of them first (claims are atomic) — then we just wait for its result.
  const RESTING = ["WAITING_APPROVAL", "WAITING_REPAIR", "CLOSED", "REJECTED", "FAILED"];
  async function drain() {
    let last = "";
    for (;;) {
      const task = await claimNextTask(id);
      if (task) {
        log(`run ${task.role}`);
        await runTask(task);
      }
      const inc = await getIncident(id);
      if (inc.status !== last) log(`→ ${inc.status}`), (last = inc.status);
      if (inc.status === "FAILED") throw new Error("incident FAILED — see agent_events");
      const open = await db.from("agent_tasks").select("id").eq("incident_id", id).in("status", ["QUEUED", "RUNNING"]);
      if (!open.data?.length && RESTING.includes(inc.status)) return;
      if (!task) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  async function photo(file: string) {
    const key = `smoke/${Date.now()}-${file}`;
    const up = await db.storage.from("evidence").upload(key, readFileSync(`seed/photos/${file}`), { contentType: "image/jpeg" });
    if (up.error) throw new Error(up.error.message);
    return db.storage.from("evidence").getPublicUrl(key).data.publicUrl;
  }

  let inc = await getIncident(id);
  if (inc.status === "PLANNING" && !inc.materials) {
    await db.from("agent_tasks").insert({ incident_id: id, role: "materials", status: "QUEUED", input: {} });
  }
  await drain();
  inc = await getIncident(id);
  log(`materials: ${JSON.stringify(inc.materials?.suppliers?.[0])}`);
  log(`plan: ${inc.plan?.technician} ${inc.plan?.window_start} supplier ${inc.plan?.supplier.supplier} $${inc.plan?.supplier.price}`);

  if (inc.status === "WAITING_APPROVAL") await engine.approve(id, "approve", "Smoke Supervisor", "smoke run");
  await drain();
  inc = await getIncident(id);
  log(`erp: ${JSON.stringify(inc.erp)}`);

  if (inc.status === "WAITING_REPAIR") {
    await engine.complete(id, { notes: "Replaced KM104 contactor on CV-104 with new LC1D09BD, tested OK.", actualDowntimeMinutes: 40, photoUrl: await photo("completion-wrong-part.jpg") });
    await drain();
    inc = await getIncident(id);
    log(`wrong-part verdict: ${inc.verification?.verdict} — ${inc.verification?.reason}`);
  }
  if (inc.status === "WAITING_REPAIR") {
    await engine.complete(id, { notes: "Replaced KM104 contactor on CV-104 with new Schneider LC1D09BD (TeSys D 9A 24VDC), tested OK.", actualDowntimeMinutes: 45, photoUrl: await photo("completion-correct-part.jpg") });
    await drain();
    inc = await getIncident(id);
    log(`correct-part verdict: ${inc.verification?.verdict} — ${inc.verification?.reason}`);
  }
  log(`FINAL ${inc.status}`);
  process.exit(inc.status === "CLOSED" ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
