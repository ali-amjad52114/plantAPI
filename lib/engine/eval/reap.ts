// One-off reaper run (the worker also runs it on start + every minute). Run: npx tsx lib/engine/eval/reap.ts
import { loadEnv } from "../../db/env";
loadEnv();
import("../index").then(async ({ reapStaleTasks }) => console.log("reaped", await reapStaleTasks())).catch((e) => { console.error("FAIL", e); process.exit(1); });
