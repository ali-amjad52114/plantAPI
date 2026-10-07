// Worker side of the "Reset demo" button: claims a queued demo_resets row (never while an agent turn is
// RUNNING, one at a time) and runs S2's resetDemo() from lib/tools/demo.ts, writing every step into the row.
import { supabaseAdmin } from "@/lib/db";

type ResetDemo = (opts: { force?: boolean; onProgress?: (step: string, detail: string) => void }) => Promise<{ summary: string }>;
// S2 owns lib/tools/demo.ts (landing on main); loaded at runtime so s/core typechecks before that merge.
const DEMO_MODULE = "@/lib/tools/demo";

type ResetRow = { id: string; force: boolean };
type Step = { at: string; step: string; detail: string };

/** Claims the oldest queued reset if no agent task is running (null otherwise). */
export async function claimDemoReset(): Promise<ResetRow | null> {
  const db = supabaseAdmin();
  const queued = await db.from("demo_resets").select("id,force").eq("status", "queued").order("created_at").limit(1);
  if (!queued.data?.length) return null;
  const busy = await db.from("agent_tasks").select("id").eq("status", "RUNNING").limit(1);
  if (busy.data?.length) return null; // wait: a reset must not pull records out from under a live turn
  const res = await db.from("demo_resets").update({ status: "running" }).eq("id", queued.data[0].id).eq("status", "queued").select("id,force");
  return (res.data?.[0] as ResetRow | undefined) ?? null;
}

export async function runDemoReset(row: ResetRow, load: () => Promise<{ resetDemo: ResetDemo }> = () => import(/* webpackIgnore: true */ DEMO_MODULE)): Promise<void> {
  const db = supabaseAdmin();
  const steps: Step[] = [];
  let writing = Promise.resolve();
  const push = (step: string, detail: string) => {
    steps.push({ at: new Date().toISOString(), step, detail: String(detail).slice(0, 1000) });
    const snapshot = [...steps];
    // serialize writes so the row always has the latest full list
    writing = writing.then(async () => void (await db.from("demo_resets").update({ steps: snapshot }).eq("id", row.id)));
  };
  try {
    push("start", row.force ? "reset requested (force)" : "reset requested");
    const { resetDemo } = await load();
    const { summary } = await resetDemo({ force: row.force, onProgress: push });
    push("done", summary);
    await writing;
    await db.from("demo_resets").update({ status: "done", summary, steps }).eq("id", row.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const refused = /refus/i.test(message) || (err as { name?: string })?.name === "DemoResetRefused";
    push(refused ? "refused" : "error", message);
    await writing.catch(() => {});
    await db.from("demo_resets").update({ status: refused ? "refused" : "failed", error: message.slice(0, 2000), steps }).eq("id", row.id);
  }
}
