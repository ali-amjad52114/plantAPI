// Wave B — Agent37 depth (behind FLAGS.agent37Depth / PLANTAPI_AGENT37_DEPTH=1). REAL ONLY.
// 1. Checkpoint: one Agent37 on-demand backup per incident after approval, before any execution turn
//    (S4's createCheckpoint). The parallel executors all await the same checkpoint.
// 2. Ack follow-up: after Dispatch, a real one-shot Agent37 platform cron fires N min later on the plant
//    instance and checks Slack for the technician's ack. The worker reads the firing's session; no ack →
//    a dispatch follow-up task is queued (one Slack reminder — no phone calls). The cron is deleted after it fired.
import { FLAGS } from "@/lib/contracts/flags";
import type { AgentEvent, AgentTask, Incident } from "@/lib/contracts/types";
import { supabaseAdmin } from "@/lib/db";
import { extractLastJson } from "@/lib/ai";
import { reminderAction } from "./depth.pure";
import { createCron, cronRuns, deleteCron, getSession, lastAssistantText, oneShotSchedule } from "@/lib/agent37/crons";

export const depthEnabled = () => FLAGS.agent37Depth || process.env.PLANTAPI_AGENT37_DEPTH === "1";
const instanceId = () => process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";
const db = () => supabaseAdmin();
const emit = async (e: AgentEvent) => void (await db().from("agent_events").insert(e));

// ---------- 1. Checkpoint ----------

type Checkpoint = { status: string; id?: string; durationMs?: number; retryAfterSeconds?: number };
type BackupModule = { createCheckpoint(instanceId: string, label: string): Promise<Checkpoint> };
// S4 owns lib/agent37/provision/backup.ts (lands on main from s/platform); loaded at runtime so s/core
// typechecks before that merge.
const BACKUP_MODULE = "@/lib/agent37/provision/backup";

const inflight = new Map<string, Promise<void>>();

/** Idempotent per incident: an existing checkpoint audit row means it was already taken. */
export function ensureCheckpoint(incidentId: string): Promise<void> {
  if (!inflight.has(incidentId)) inflight.set(incidentId, takeCheckpoint(incidentId).finally(() => setTimeout(() => inflight.delete(incidentId), 60_000)));
  return inflight.get(incidentId)!;
}

async function takeCheckpoint(incidentId: string): Promise<void> {
  const done = await db().from("audit_logs").select("id").eq("incident_id", incidentId).eq("action", "checkpoint.saved").limit(1);
  if (done.data?.length) return;
  await emit({ incident_id: incidentId, agent: "system", kind: "status", system: "agent37", message: "Saving Agent37 checkpoint before execution…" });
  const { createCheckpoint } = (await import(/* webpackIgnore: true */ BACKUP_MODULE)) as BackupModule;
  const cp = await createCheckpoint(instanceId(), `incident-${incidentId}`);
  const message =
    cp.status === "completed"
      ? `Checkpoint saved (backup ${cp.id})`
      : cp.status === "rate_limited"
        ? `Checkpoint: using previous backup ${cp.id ?? "none"} (Agent37 allows 1 per 15 min)`
        : `Checkpoint requested (backup still finishing on Agent37)`;
  await emit({ incident_id: incidentId, agent: "system", kind: "tool", system: "agent37", message, data: cp as unknown as Record<string, unknown> });
  await db().from("audit_logs").insert({ incident_id: incidentId, actor: "system", action: "checkpoint.saved", system: "agent37", detail: cp });
}

// ---------- 2. Ack follow-up cron ----------


const ACK_DELAY_MIN = () => Number(process.env.PLANTAPI_ACK_DELAY_MIN ?? 10);

export function ackPrompt(incident: Pick<Incident, "id" | "plan">, since: string): string {
  const tech = incident.plan?.technician ?? "the assigned technician";
  const channel = process.env.PLANTAPI_SLACK_CHANNEL ?? "the plant maintenance Slack channel";
  return [
    `PlantAPI follow-up for incident ${incident.id}.`,
    `Using only your Slack app connection, read ${channel} for messages after ${since}. Has ${tech} acknowledged the CV-104 repair job (e.g. "ack", "on it", "confirmed", a thumbs-up reply)?`,
    "Do not send any message and do not change anything. Never guess: if Slack cannot be read, set ack_received to false and put the exact error in evidence.",
    'End your reply with exactly one JSON object: {"ack_received": true|false, "evidence": "<message text + timestamp, or the error>"}',
  ].join("\n");
}

/** Called when a dispatch task completes: schedules the real cron and records it on the dispatch output. */
export async function scheduleAckFollowUp(incident: Incident, dispatchTask: Pick<AgentTask, "id" | "output">): Promise<void> {
  const fireAt = new Date(Date.now() + ACK_DELAY_MIN() * 60_000);
  fireAt.setUTCSeconds(0, 0);
  fireAt.setUTCMinutes(fireAt.getUTCMinutes() + 1); // never land in the current minute
  const cron = await createCron(instanceId(), {
    name: `plantapi-ack-${incident.id.slice(0, 8)}`,
    prompt: ackPrompt(incident, new Date().toISOString()),
    schedule: oneShotSchedule(fireAt),
  });
  const output = { ...(dispatchTask.output ?? {}), follow_up: cron.id };
  await db().from("agent_tasks").update({ output }).eq("id", dispatchTask.id);
  // Watch row for the worker (WAITING tasks are never claimed by the poller).
  await db()
    .from("agent_tasks")
    .insert({ incident_id: incident.id, role: "dispatch", status: "WAITING", input: { watch_cron: cron.id, fires_at: fireAt.toISOString(), follow_up: true } });
  await emit({
    incident_id: incident.id, agent: "dispatch", kind: "tool", system: "agent37",
    message: `Agent37 cron ${cron.id} will check Slack for the technician's ack at ${fireAt.toISOString().slice(11, 16)} UTC`,
    data: { cron_id: cron.id, schedule: cron.schedule, fires_at: fireAt.toISOString() },
  });
}

/** Worker loop: resolve WAITING cron watches whose firing has finished. */
export async function checkAckFollowUps(enqueue: (incidentId: string, input: Record<string, unknown>) => Promise<void>): Promise<void> {
  const res = await db().from("agent_tasks").select("*").eq("role", "dispatch").eq("status", "WAITING");
  for (const w of (res.data ?? []) as AgentTask[]) {
    const cronId = w.input.watch_cron as string | undefined;
    if (!cronId || Date.now() < Date.parse(String(w.input.fires_at))) continue;
    const runs = await cronRuns(instanceId(), cronId).catch(() => []);
    const run = runs[0];
    const ageMin = (Date.now() - Date.parse(String(w.input.fires_at))) / 60_000;
    if (!run?.session_id) {
      if (ageMin < 15) continue;
      await finish(w, cronId, { ack_received: false, evidence: `cron ${cronId} did not fire (${run?.status ?? "no run"} ${run?.reason ?? ""})` }, enqueue);
      continue;
    }
    const text = lastAssistantText(await getSession(instanceId(), run.session_id).catch(() => null));
    const parsed = text ? (extractLastJson(text) as { ack_received?: boolean; evidence?: string } | null) : null;
    if (!parsed || typeof parsed.ack_received !== "boolean") {
      if (ageMin < 15) continue; // turn still running
      await finish(w, cronId, { ack_received: false, evidence: `no readable answer from cron session ${run.session_id}` }, enqueue);
      continue;
    }
    await finish(w, cronId, { ack_received: parsed.ack_received, evidence: parsed.evidence ?? null, session_id: run.session_id }, enqueue);
  }
}

async function finish(
  w: AgentTask,
  cronId: string,
  result: { ack_received: boolean; evidence: string | null; session_id?: string },
  enqueue: (incidentId: string, input: Record<string, unknown>) => Promise<void>,
) {
  await db().from("agent_tasks").update({ status: "COMPLETE", output: result, finished_at: new Date().toISOString() }).eq("id", w.id);
  await deleteCron(instanceId(), cronId).catch(() => {});
  if (result.ack_received) {
    await emit({ incident_id: w.incident_id, agent: "dispatch", kind: "output", system: "slack", message: `Technician acknowledged: ${result.evidence ?? ""}`.slice(0, 300), data: result });
    return;
  }
  await emit({ incident_id: w.incident_id, agent: "dispatch", kind: "error", system: "agent37", message: `No ack after ${ACK_DELAY_MIN()} min (${result.evidence ?? ""}) — follow-up queued`.slice(0, 300), data: result });
  await enqueue(w.incident_id, {
    follow_up: true,
    reason: `no Slack ack within ${ACK_DELAY_MIN()} min`,
    action: reminderAction(),
    ack_check: result,
  });
}
