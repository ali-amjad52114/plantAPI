// S1/A4: polls agent_tasks (QUEUED) and runs each as one real Agent37 turn via the engine.
import { hostname } from "node:os";
import { loadEnv } from "@/lib/db/env";

loadEnv();
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);

async function main() {
  const { claimNextTask, runTask, checkFollowUps, reapStaleTasks } = await import("@/lib/engine");
  let lastFollowUpCheck = 0;
  let lastReap = 0;
  let lastBeat = 0;
  const { supabaseAdmin } = await import("@/lib/db");
  const workerId = process.env.PLANTAPI_WORKER_ID ?? `${hostname()}:${process.pid}`;
  const startedAt = new Date().toISOString();
  // Heartbeat for GET /api/health (one row per worker; last_poll every 15 s).
  const heartbeat = async (busy: number, drainingNow: boolean) => {
    const { error } = await supabaseAdmin()
      .from("worker_heartbeat")
      .upsert({ id: workerId, last_poll: new Date().toISOString(), started_at: startedAt, info: { pid: process.pid, running: busy, draining: drainingNow, concurrency: CONCURRENCY, full_team: process.env.PLANTAPI_FULL_TEAM === "1", agent37_depth: process.env.PLANTAPI_AGENT37_DEPTH === "1" } });
    if (error) console.error("worker heartbeat failed:", error.message);
  };
  // Merged skill/seed/env changes reach the plant instance only via this sync — run it on every start.
  try {
    const { syncInstance } = await import("@/lib/agent37/sync-instance");
    const r = await syncInstance();
    console.log(`worker: synced ${r.files} files to the Agent37 instance in ${r.ms} ms (env keys: ${r.envKeys.join(", ")}; monid ${r.monid})`);
  } catch (err) {
    console.error("worker: instance sync FAILED, running with what is on the instance:", err instanceof Error ? err.message : err);
  }
  let running = 0;
  // Drain: stop claiming new tasks, let running Agent37 turns finish (deploys must not kill turns).
  // Sources: PLANTAPI_WORKER_DRAIN=1 at start, worker_control.drain in Supabase (checked every 5 s), or SIGTERM/SIGINT.
  let signalled = false;
  let draining = process.env.PLANTAPI_WORKER_DRAIN === "1";
  let lastControl = 0;
  const onSignal = (sig: string) => {
    signalled = true;
    console.log(`worker: ${sig} — draining, ${running} task(s) still running`);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  console.log(`worker: polling every ${POLL_MS} ms, concurrency ${CONCURRENCY}${draining ? " (DRAINING from start)" : ""}`);
  for (;;) {
    try {
      if (Date.now() - lastControl > 5_000) {
        lastControl = Date.now();
        const ctl = await supabaseAdmin().from("worker_control").select("drain").eq("id", "global").maybeSingle();
        const want = signalled || process.env.PLANTAPI_WORKER_DRAIN === "1" || ctl.data?.drain === true;
        if (want !== draining) console.log(want ? `worker: draining — no new tasks, ${running} running` : "worker: drain off — claiming tasks again");
        draining = want;
      }
      if (signalled && running === 0) {
        console.log("worker: drained, exiting");
        await heartbeat(0, true).catch(() => {});
        process.exit(0);
      }
      while (!draining && running < CONCURRENCY) {
        const task = await claimNextTask();
        if (!task) break;
        running++;
        console.log(`worker: ${task.role} for incident ${task.incident_id}`);
        runTask(task).finally(() => running--);
      }
      if (Date.now() - lastBeat > 15_000) {
        lastBeat = Date.now();
        await heartbeat(running, draining);
      }
      if (Date.now() - lastReap > 60_000) {
        lastReap = Date.now();
        const n = await reapStaleTasks();
        if (n) console.log(`worker: reaped ${n} stale RUNNING task(s)`);
      }
      if (Date.now() - lastFollowUpCheck > 30_000) {
        lastFollowUpCheck = Date.now();
        await checkFollowUps();
      }
    } catch (err) {
      console.error("worker poll error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

void main();
