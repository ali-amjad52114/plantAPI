// Wave B: cost per incident from Agent37 usage.
// Agent37 only reports usage per instance (GET /v1/instances/{id}/usage, live, all-in: LLM + compute +
// Composio + search). Per-turn token counts from /v1/responses miss the agent's inner LLM calls, so we
// measure the instance's total_micros across each "busy period" of an incident: first turn of the
// incident starts → snapshot; last running turn of it ends → snapshot; the delta is added to
// incidents.cost (migration 003). Parallel planners of one incident are counted once. Turns of other
// incidents running at the same moment would bleed in — flagged as `shared_instance` in the record.
import { supabaseAdmin } from "@/lib/db";
import { addSpend } from "./cost.pure";

async function instanceTotalMicros(): Promise<number | null> {
  const id = process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";
  const base = process.env.AGENT37_BASE_URL ?? "https://api.agent37.com/v1";
  try {
    const res = await fetch(`${base}/instances/${id}/usage`, { headers: { Authorization: `Bearer ${process.env.AGENT37_API_KEY}` } });
    if (!res.ok) return null;
    return ((await res.json()) as { total_micros?: number }).total_micros ?? null;
  } catch {
    return null;
  }
}

const busy = new Map<string, { running: number; startMicros: number | null }>();

/** Call right before an Agent37 turn of this incident. */
export async function beginTurn(incidentId: string): Promise<void> {
  const b = busy.get(incidentId);
  if (b) {
    b.running++;
    return;
  }
  const entry = { running: 1, startMicros: null as number | null };
  busy.set(incidentId, entry);
  entry.startMicros = await instanceTotalMicros();
}

/** Call after the turn (success or failure). Closes the busy period when it was the last running turn. */
export async function endTurn(incidentId: string): Promise<void> {
  const b = busy.get(incidentId);
  if (!b) return;
  if (--b.running > 0) return;
  busy.delete(incidentId);
  const end = await instanceTotalMicros();
  if (b.startMicros == null || end == null) return;
  const db = supabaseAdmin();
  const cur = await db.from("incidents").select("cost").eq("id", incidentId).single();
  const cost = addSpend(cur.data?.cost ?? null, Math.max(0, end - b.startMicros), busy.size > 0);
  await db.from("incidents").update({ cost }).eq("id", incidentId);
  await db.from("agent_events").insert({
    incident_id: incidentId, agent: "system", kind: "log", system: "agent37",
    message: `Cost so far: $${cost.agent37_usd.toFixed(4)} on Agent37 (${cost.periods} busy periods)`,
    data: cost,
  });
}
