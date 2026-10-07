// S1/A4: polls agent_tasks (QUEUED) and runs each as one real Agent37 turn via the engine.
import { loadEnv } from "@/lib/db/env";

loadEnv();
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);

async function main() {
  const { claimNextTask, runTask } = await import("@/lib/engine");
  // Merged skill/seed/env changes reach the plant instance only via this sync — run it on every start.
  try {
    const { syncInstance } = await import("@/lib/agent37/sync-instance");
    const r = await syncInstance();
    console.log(`worker: synced ${r.files} files to the Agent37 instance in ${r.ms} ms (env keys: ${r.envKeys.join(", ")}; monid ${r.monid})`);
  } catch (err) {
    console.error("worker: instance sync FAILED, running with what is on the instance:", err instanceof Error ? err.message : err);
  }
  let running = 0;
  let stopping = false;
  process.on("SIGINT", () => (stopping = true));
  process.on("SIGTERM", () => (stopping = true));
  console.log(`worker: polling every ${POLL_MS} ms, concurrency ${CONCURRENCY}`);
  while (!stopping) {
    try {
      while (running < CONCURRENCY) {
        const task = await claimNextTask();
        if (!task) break;
        running++;
        console.log(`worker: ${task.role} for incident ${task.incident_id}`);
        runTask(task).finally(() => running--);
      }
    } catch (err) {
      console.error("worker poll error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

void main();
