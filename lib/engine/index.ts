// S1/A4: Slice 1 engine. HTTP routes call start/approve/complete (fast, DB only);
// the worker claims QUEUED agent_tasks and runs each as one real Agent37 turn.
import { z } from "zod";
import type { Engine } from "@/lib/contracts/interfaces";
import {
  SLICE1_ROLES,
  type AgentEvent,
  type AgentRole,
  type AgentTask,
  type Incident,
  type IncidentStatus,
  type Slice1Role,
} from "@/lib/contracts/types";
import { agent37 } from "@/lib/agent37";
import { ai } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/db";
import { FLAGS } from "@/lib/contracts/flags";
import { extractLastJson } from "@/lib/ai";
import { ensureRequiredActions, PLAN_RULES_VERSION, stalePlanReason } from "./flow";
type RepairPlanLike = { asset_id?: string; actions?: Array<{ action: string; system: string; rule: string }> };
import { approvalSteps, checkOutput, CAN_APPROVE, CAN_COMPLETE, EXECUTORS, nextSteps, OUTPUT_COLUMN, PLANNERS, plannerFailureIsFatal, runningStatus } from "./flow";
import { schemaFor, WAVE_A_ROLES } from "./wave-a-schemas";
import { postStepHooks } from "./hooks";
import { beginTurn, endTurn } from "./cost";
import { checkAckFollowUps, depthEnabled, ensureCheckpoint, scheduleAckFollowUp } from "./depth";
import { buildTaskText, outputSchemaText } from "./prompts";
import { deepFixText, fixMojibake } from "./text.pure";
import { deepPlantTime, toPlantIso } from "./time.pure";
import { verifyErpBlock, verifyUnblocked } from "./odoo-check";

const db = () => supabaseAdmin();

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export class StalePlanError extends Error {
  constructor(public reason: string) {
    super(`plan is stale — re-plan (${reason})`);
  }
}

export class IncidentNotFoundError extends Error {
  constructor(id: string) {
    super(`incident not found: ${id}`);
  }
}

export async function getIncident(id: string): Promise<Incident> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id)) throw new IncidentNotFoundError(id);
  const row = must(await db().from("incidents").select("*").eq("id", id).maybeSingle(), "load incident");
  if (!row) throw new IncidentNotFoundError(id);
  return row as Incident;
}

/** For routes: throws IncidentNotFoundError / a 409-style Error before any side effect (e.g. photo upload). */
export async function assertCanComplete(id: string): Promise<void> {
  const incident = await getIncident(id);
  if (!CAN_COMPLETE.includes(incident.status)) throw new Error(`cannot complete in status ${incident.status}`);
}

export async function emit(e: AgentEvent): Promise<void> {
  const { error } = await db().from("agent_events").insert({ ...e, message: fixMojibake(e.message) });
  if (error) console.error("agent_events insert failed:", error.message);
}

async function setStatus(id: string, status: IncidentStatus, patch: Record<string, unknown> = {}) {
  must(await db().from("incidents").update({ status, ...patch }).eq("id", id).select("id"), "update incident");
  await emit({ incident_id: id, agent: "system", kind: "status", system: "supabase", message: `Status → ${status}` });
}

async function enqueue(incidentId: string, role: AgentRole, input: Record<string, unknown> = {}) {
  const res = await db().from("agent_tasks").insert({ incident_id: incidentId, role, status: "QUEUED", input }).select("id");
  // 23505 = migration 002's one-open-task-per-role index: a parallel planner already enqueued this step.
  if (res.error && (res.error as { code?: string }).code === "23505") return;
  must(res, "enqueue task");
}

/** Wave A full team: lead flips FLAGS.fullTeam; PLANTAPI_FULL_TEAM=1 enables it for local runs. */
export const fullTeam = () => FLAGS.fullTeam || process.env.PLANTAPI_FULL_TEAM === "1";

/** Planner/executor roles whose task for this incident is COMPLETE or FAILED (fan-in check). */
async function settledRoles(incidentId: string): Promise<AgentRole[]> {
  const res = await db().from("agent_tasks").select("role,status").eq("incident_id", incidentId).in("role", [...PLANNERS, ...EXECUTORS]).in("status", ["COMPLETE", "FAILED"]);
  return [...new Set((res.data ?? []).map((r) => r.role as AgentRole))];
}

/** Latest COMPLETE output per wave A role, for the coordinator / risk context. */
async function teamOutputs(incidentId: string): Promise<Record<string, unknown>> {
  const res = await db().from("agent_tasks").select("role,status,output,error").eq("incident_id", incidentId).in("role", ["reliability", "production", "workforce", "risk"]).order("created_at");
  const out: Record<string, unknown> = {};
  for (const r of res.data ?? []) out[r.role] = r.status === "COMPLETE" ? r.output : { unavailable: r.error ?? r.status };
  return out;
}

/**
 * REAL ONLY: the role JSON must come from the agent itself. No model "repair" call (it can invent a
 * schema-valid object from a reply that has none) — parseRole only extracts + validates.
 */
function parseRole(role: AgentRole, text: string): { ok: true; data: unknown } | { ok: false; error: string } {
  const json = extractLastJson(text);
  if (json == null) return { ok: false, error: "no JSON object at the end of the reply" };
  const r = schemaFor(role).safeParse(json);
  return r.success ? { ok: true, data: deepFixText(r.data) } : { ok: false, error: r.error.message.slice(0, 600) };
}

async function audit(incidentId: string, actor: string, action: string, system: string, detail: Record<string, unknown>) {
  await db().from("audit_logs").insert({ incident_id: incidentId, actor, action, system, detail });
}

// ---------- Vision pre-check (real OpenAI call; result goes into the agent's context) ----------
const PhotoObservation = z.object({
  observations: z.string(),
  visible_labels: z.array(z.string()),
  component_type: z.string(),
  looks_damaged: z.boolean(),
});

async function observePhoto(incidentId: string, agent: AgentRole, url: string | null | undefined, question: string) {
  if (!url) return null;
  try {
    const obs = await ai.chatJSON(question, PhotoObservation, { model: "smart", imageUrls: [url] });
    await emit({ incident_id: incidentId, agent, kind: "tool", system: "openai", message: `Vision: ${obs.observations.slice(0, 160)}`, data: obs });
    return obs;
  } catch (err) {
    await emit({ incident_id: incidentId, agent, kind: "error", system: "openai", message: `Vision failed: ${String(err).slice(0, 200)}` });
    return null;
  }
}

// ---------- Task runner (worker) ----------

/** Atomically claims the oldest QUEUED task (null if none); optionally only for one incident. */
export async function claimNextTask(incidentId?: string): Promise<AgentTask | null> {
  let q = db().from("agent_tasks").select("id").eq("status", "QUEUED");
  if (incidentId) q = q.eq("incident_id", incidentId);
  const { data } = await q.order("created_at").limit(1);
  if (!data?.length) return null;
  const res = await db()
    .from("agent_tasks")
    .update({ status: "RUNNING", started_at: new Date().toISOString() })
    .eq("id", data[0].id)
    .eq("status", "QUEUED")
    .select("*");
  return (res.data?.[0] as AgentTask | undefined) ?? null;
}

/** Tasks this process is running right now (the reaper never touches these). */
const inFlight = new Set<string>();

export async function runTask(task: AgentTask): Promise<void> {
  inFlight.add(task.id);
  try {
    await runTaskInner(task);
  } finally {
    inFlight.delete(task.id);
  }
}

/** RUNNING longer than STALE_MIN and not running in this process = orphaned by a worker restart. */
const STALE_MIN = Number(process.env.PLANTAPI_STALE_TASK_MIN ?? 10);
export async function reapStaleTasks(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MIN * 60_000).toISOString();
  const res = await db().from("agent_tasks").select("*").eq("status", "RUNNING").lt("started_at", cutoff);
  let n = 0;
  for (const task of (res.data ?? []) as AgentTask[]) {
    if (inFlight.has(task.id)) continue;
    const upd = await db()
      .from("agent_tasks")
      .update({ status: "FAILED", error: "worker restarted mid-turn", finished_at: new Date().toISOString() })
      .eq("id", task.id)
      .eq("status", "RUNNING")
      .select("id");
    if (!upd.data?.length) continue;
    n++;
    await emit({ incident_id: task.incident_id, agent: task.role, kind: "error", system: "agent37", message: `${task.role} was interrupted (worker restarted mid-turn) — marked FAILED` });
    await afterFailure(task, "worker restarted mid-turn", false);
  }
  return n;
}

/** Same consequences as a failed turn: fatal roles fail the incident, others let the team carry on. */
async function afterFailure(task: AgentTask, _message: string, _emitted: boolean): Promise<void> {
  const role = task.role as AgentRole;
  const team = fullTeam();
  if (task.input?.follow_up === true) return;
  if (plannerFailureIsFatal(role, team)) {
    await setStatus(task.incident_id, "FAILED").catch(() => {});
  } else {
    const t = nextSteps(role, null, team, await settledRoles(task.incident_id).catch(() => []));
    const cur = await getIncident(task.incident_id).catch(() => null);
    if (cur && cur.status !== t.status && cur.status !== "FAILED") await setStatus(task.incident_id, t.status).catch(() => {});
    for (const next of t.next) await enqueue(task.incident_id, next).catch(() => {});
  }
}

async function runTaskInner(task: AgentTask): Promise<void> {
  const role = task.role as AgentRole;
  const incidentId = task.incident_id;
  const team = fullTeam();
  try {
    const allowed: AgentRole[] = team ? [...SLICE1_ROLES, ...WAVE_A_ROLES] : SLICE1_ROLES;
    if (!allowed.includes(role)) throw new Error(`role ${role} not enabled (fullTeam=${team})`);
    let incident = await getIncident(incidentId);
    // A dispatch follow-up (no Slack ack) runs beside the repair: it never moves the incident.
    const followUp = task.input.follow_up === true;
    if (!followUp && incident.status !== runningStatus(role)) await setStatus(incidentId, runningStatus(role));
    if (depthEnabled() && EXECUTORS.includes(role) && !followUp) {
      await ensureCheckpoint(incidentId).catch((err) =>
        emit({ incident_id: incidentId, agent: "system", kind: "error", system: "agent37", message: `Checkpoint failed: ${String(err instanceof Error ? err.message : err).slice(0, 200)}` }),
      );
    }
    await emit({ incident_id: incidentId, agent: role, kind: "status", system: "agent37", message: `${role} started on Agent37` });

    const extra: Record<string, unknown> = { ...task.input };
    if (team && (role === "coordinator" || role === "risk")) extra.team = await teamOutputs(incidentId);
    if (role === "triage") {
      extra.photo_observation = await observePhoto(incidentId, role, incident.photo_url, "Describe this industrial equipment failure photo: component type, visible damage, any part numbers/brands/ratings on labels.");
    }
    if (role === "verification") {
      extra.completion_photo_observation = await observePhoto(
        incidentId,
        role,
        (task.input.completion as { photo?: string } | undefined)?.photo,
        "This is a technician's repair-completion photo. Describe the installed component: type, number of poles, whether it looks new, and every brand/model/rating label you can read.",
      );
    }

    const instanceId = process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";
    const sessionId = incident.agent37_session_ids?.[role];
    await beginTurn(incidentId);
    const turn = await agent37
      .runTurn(
        { instanceId, role, incidentId, input: buildTaskText(role, incident, extra), sessionId, reasoningEffort: "medium" },
        (e) => void emit({ ...e, incident_id: incidentId }),
      )
      .finally(() => endTurn(incidentId).catch((err) => console.error("cost:", err)));

    let parsed = parseRole(role, turn.outputText);
    if (!parsed.ok) {
      // One retry in the same Agent37 session, asking only for the JSON of the work it already did.
      await emit({ incident_id: incidentId, agent: role, kind: "log", system: "agent37", message: `${role}: reply had no valid JSON (${parsed.error.slice(0, 120)}) — asking the agent once more` });
      await beginTurn(incidentId);
      const again = await agent37
        .runTurn(
          {
            instanceId, role, incidentId, sessionId: turn.sessionId,
            input: `Your previous reply did not end with a valid ${role} JSON object (${parsed.error}). Reply now with ONLY that JSON object, built from the results of the work you already did above — do not run the tools again. If a step did not happen, say so in the fields (blocked / summary / status) — never invent ids, prices or messages.

JSON Schema:
${outputSchemaText(role)}`,
          },
          () => {},
        )
        .finally(() => endTurn(incidentId).catch(() => {}));
      parsed = parseRole(role, again.outputText);
      if (!parsed.ok) throw new Error(`no valid ${role} JSON after one retry: ${parsed.error}`);
    }
    let output = role === "coordinator" ? deepPlantTime(parsed.data) : parsed.data;
    if (role === "coordinator") {
      const req = ensureRequiredActions(output as RepairPlanLike);
      output = req.plan;
      if (req.added.length) {
        await emit({ incident_id: incidentId, agent: "system", kind: "log", system: "supabase", message: `Plan was missing required step(s), added by the engine: ${req.added.join("; ")}` });
      }
    }
    const problem = checkOutput(role as Slice1Role, output, incident, Date.now(), (extra.team as never) ?? null);
    if (problem) throw new Error(`${role} output rejected: ${problem}`);
    if (role === "erp" && incident.plan) {
      const o = output as { odoo_block_ref: string | null };
      const v = await verifyErpBlock(o.odoo_block_ref, incident.plan);
      if (v.problem) throw new Error(`erp output rejected: ${v.problem}`);
      if (v.adopted) await emit({ incident_id: incidentId, agent: role, kind: "log", system: "odoo", message: `Odoo block verified: ${v.ref} on Crushing Line 2 for the plan window (agent left the ref empty)` });
      else await emit({ incident_id: incidentId, agent: role, kind: "tool", system: "odoo", message: `Odoo block verified: ${v.ref} matches the plan window` });
      o.odoo_block_ref = v.ref;
    }
    if (role === "verification" && (output as { verdict?: string }).verdict === "accept") {
      const unblockProblem = await verifyUnblocked(incident.erp?.odoo_block_ref ?? null);
      if (unblockProblem) throw new Error(`verification output rejected: ${unblockProblem}`);
    }
    must(
      await db()
        .from("agent_tasks")
        .update({ status: "COMPLETE", output, agent37_response_id: turn.responseId, finished_at: new Date().toISOString() })
        .eq("id", task.id)
        .select("id"),
      "complete task",
    );
    await audit(incidentId, role, `${role}.complete`, "agent37", {
      response_id: turn.responseId,
      cost_usd: turn.costUsd,
      duration_ms: turn.durationMs,
      ...(role === "coordinator" ? { plan_rules: PLAN_RULES_VERSION } : {}),
      input_tokens: (turn as { inputTokens?: number | null }).inputTokens ?? null,
      output_tokens: (turn as { outputTokens?: number | null }).outputTokens ?? null,
    });

    incident = await getIncident(incidentId);
    if (followUp) {
      const notices = ((output as { notices?: Array<{ channel: string; status: string; ref: string | null }> }).notices ?? [])
        .map((n) => `${n.channel} ${n.status}${n.ref ? ` (${n.ref})` : ""}`)
        .join(", ");
      await emit({ incident_id: incidentId, agent: role, kind: "output", system: "slack", message: `Reminder sent: ${notices || "no notices reported"}`, data: output as Record<string, unknown> });
      return;
    }
    if (role === "dispatch" && depthEnabled()) {
      await scheduleAckFollowUp(incident, { id: task.id, output: output as Record<string, unknown> }).catch((err) =>
        emit({ incident_id: incidentId, agent: role, kind: "error", system: "agent37", message: `Ack follow-up cron failed: ${String(err instanceof Error ? err.message : err).slice(0, 200)}` }),
      );
    }
    const t = nextSteps(role, output, team, team ? await settledRoles(incidentId) : []);
    const patch: Record<string, unknown> = { agent37_session_ids: { ...incident.agent37_session_ids, [role]: turn.sessionId } };
    const src = (output as { source?: unknown }).source;
    if (typeof src === "string" && /seed/i.test(src)) {
      await emit({ incident_id: incidentId, agent: role, kind: "log", system: "google", message: `source: seed file (${src}) — ${role === "workforce" ? "Calendar" : "Sheets"} not connected yet` });
    }
    const column = (OUTPUT_COLUMN as Partial<Record<AgentRole, string>>)[role];
    if (column) patch[column] = output;
    if (role === "triage") {
      // Agent reports the asset code (CV-104); incidents.asset_id is the assets row uuid.
      const code = (output as { asset_id: string }).asset_id;
      const asset = await db().from("assets").select("id").eq("plant_id", incident.plant_id).eq("code", code).maybeSingle();
      if (asset.data) patch.asset_id = asset.data.id;
      else await emit({ incident_id: incidentId, agent: role, kind: "error", system: "supabase", message: `Unknown asset code ${code}` });
    }
    if (role === "verification") {
      const v = output as { verdict: string; reason: string };
      await db().from("repair_events").insert({ incident_id: incidentId, kind: v.verdict === "accept" ? "verification_accepted" : "verification_rejected", notes: v.reason });
      if (v.verdict !== "accept") await emit({ incident_id: incidentId, agent: role, kind: "error", system: "openai", message: `Rejected: ${v.reason}` });
    }
    await emit({ incident_id: incidentId, agent: role, kind: "output", system: "agent37", message: `${role} done`, data: output as Record<string, unknown> });
    if (t.status !== incident.status) await setStatus(incidentId, t.status, patch);
    else must(await db().from("incidents").update(patch).eq("id", incidentId).select("id"), "update incident");
    if (role === "risk" && t.status === "REJECTED") await emit({ incident_id: incidentId, agent: role, kind: "error", system: "agent37", message: `Risk DENY: ${(output as { summary?: string }).summary ?? ""}` });
    // erp → dispatch: dispatch needs the approval and (via incident.erp) the real Fiix WO code.
    for (const next of t.next) await enqueue(incidentId, next, next === "dispatch" ? { approval: task.input.approval ?? null } : {});

    const fresh = await getIncident(incidentId);
    for (const hook of postStepHooks) await hook(fresh, role).catch((err) => console.error("postStepHook:", err));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db().from("agent_tasks").update({ status: "FAILED", error: message, finished_at: new Date().toISOString() }).eq("id", task.id);
    await emit({ incident_id: incidentId, agent: role, kind: "error", system: "agent37", message: `${role} failed: ${message.slice(0, 300)}` });
    // allSettled: non-fatal planners/executors fail alone; the team goes on once all settled.
    await afterFailure(task, message, true);
  }
}

// ---------- Engine (called by API routes) ----------

export const engine: Engine = {
  async start(incidentId) {
    await setStatus(incidentId, "TRIAGING");
    await enqueue(incidentId, "triage");
  },

  async approve(incidentId, decision, by, note) {
    const incident = await getIncident(incidentId);
    if (!CAN_APPROVE.includes(incident.status)) throw new Error(`cannot ${decision} in status ${incident.status}`);
    if (decision === "approve") {
      const last = await db().from("audit_logs").select("detail").eq("incident_id", incidentId).eq("action", "coordinator.complete").order("created_at", { ascending: false }).limit(1);
      const rules = (last.data?.[0]?.detail as { plan_rules?: string } | undefined)?.plan_rules;
      const reason = stalePlanReason(incident.plan, incident.triage?.estimated_repair_minutes, rules, Date.now());
      if (reason) {
        await emit({ incident_id: incidentId, agent: "system", kind: "error", system: "supabase", message: `Approval refused: plan is stale — ${reason}. Re-plan first.` });
        throw new StalePlanError(reason);
      }
    }
    must(await db().from("approvals").insert({ incident_id: incidentId, decision, decided_by: by, note: note ?? null }).select("id"), "insert approval");
    await emit({ incident_id: incidentId, agent: "human", kind: "status", system: "supabase", message: `${by} ${decision === "approve" ? "approved" : "rejected"} the plan` });
    await audit(incidentId, by, `plan.${decision}`, "supabase", { note });
    const t = approvalSteps(decision, fullTeam());
    if (decision === "approve") await setStatus(incidentId, "APPROVED");
    await setStatus(incidentId, t.status);
    const approval = { decision, decided_by: by, note: note ?? null, decided_at: toPlantIso(Date.now()) };
    for (const next of t.next) {
      // Procurement really sends the expedite email only with approved:true and dry_run:false (S2 skill, idempotent by subject).
      const input = next === "procurement" ? { approval, approved: decision === "approve", dry_run: false } : { approval };
      await enqueue(incidentId, next, input);
    }
  },

  async complete(incidentId, input) {
    const incident = await getIncident(incidentId);
    if (!CAN_COMPLETE.includes(incident.status)) throw new Error(`cannot complete in status ${incident.status}`);
    must(
      await db()
        .from("repair_events")
        .insert({ incident_id: incidentId, kind: "completion_submitted", notes: input.notes, actual_downtime_minutes: input.actualDowntimeMinutes, photo_url: input.photoUrl })
        .select("id"),
      "insert repair event",
    );
    await emit({ incident_id: incidentId, agent: "human", kind: "status", system: "supabase", message: `Technician reported done: ${input.notes.slice(0, 120)}` });
    await setStatus(incidentId, "VERIFYING");
    await enqueue(incidentId, "verification", { completion: { notes: input.notes, actual_downtime_minutes: input.actualDowntimeMinutes, photo: input.photoUrl } });
  },
};

/** Worker: resolve Agent37 ack-check crons; no ack → queue a dispatch follow-up turn. */
export const checkFollowUps = () => checkAckFollowUps((incidentId, input) => enqueue(incidentId, "dispatch", input));

/** Re-plan a waiting incident with the current rules: the coordinator (then risk, with the full team) runs again. */
export async function replan(incidentId: string): Promise<void> {
  const incident = await getIncident(incidentId);
  if (!["WAITING_APPROVAL", "REJECTED"].includes(incident.status)) throw new Error(`cannot re-plan in status ${incident.status}`);
  if (!incident.triage || !incident.materials) throw new Error("cannot re-plan without triage and materials");
  await emit({ incident_id: incidentId, agent: "human", kind: "status", system: "supabase", message: "Re-plan requested" });
  await setStatus(incidentId, "PLANNING");
  await enqueue(incidentId, "coordinator", { replan: true });
}
