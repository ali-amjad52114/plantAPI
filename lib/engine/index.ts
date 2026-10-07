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
import { afterApproval, checkOutput, CAN_APPROVE, CAN_COMPLETE, nextSteps, OUTPUT_COLUMN, PLANNERS, plannerFailureIsFatal, runningStatus } from "./flow";
import { schemaFor, WAVE_A_ROLES } from "./wave-a-schemas";
import { postStepHooks } from "./hooks";
import { buildTaskText } from "./prompts";

const db = () => supabaseAdmin();

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export async function getIncident(id: string): Promise<Incident> {
  return must(await db().from("incidents").select("*").eq("id", id).single(), "load incident") as Incident;
}

export async function emit(e: AgentEvent): Promise<void> {
  const { error } = await db().from("agent_events").insert(e);
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

async function settledPlanners(incidentId: string): Promise<AgentRole[]> {
  const res = await db().from("agent_tasks").select("role,status").eq("incident_id", incidentId).in("role", PLANNERS).in("status", ["COMPLETE", "FAILED"]);
  return [...new Set((res.data ?? []).map((r) => r.role as AgentRole))];
}

/** Latest COMPLETE output per wave A role, for the coordinator / risk context. */
async function teamOutputs(incidentId: string): Promise<Record<string, unknown>> {
  const res = await db().from("agent_tasks").select("role,status,output,error").eq("incident_id", incidentId).in("role", ["reliability", "production", "workforce", "risk"]).order("created_at");
  const out: Record<string, unknown> = {};
  for (const r of res.data ?? []) out[r.role] = r.status === "COMPLETE" ? r.output : { unavailable: r.error ?? r.status };
  return out;
}

/** Slice 1 roles use the contract parser; wave A roles validate against wave-a-schemas (one repair call). */
async function parseOutput(role: AgentRole, text: string): Promise<unknown> {
  if ((OUTPUT_COLUMN as Record<string, string>)[role]) return ai.parseAgentOutput(role as Slice1Role, text);
  const schema = schemaFor(role);
  const first = schema.safeParse(extractLastJson(text));
  if (first.success) return first.data;
  return ai.chatJSON(`Extract the final ${role} JSON from this agent reply. Use only values present in the reply.

Error: ${first.error.message}

Reply:
${text}`, schema, { model: "fast" });
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

export async function runTask(task: AgentTask): Promise<void> {
  const role = task.role as AgentRole;
  const incidentId = task.incident_id;
  const team = fullTeam();
  try {
    const allowed: AgentRole[] = team ? [...SLICE1_ROLES, ...WAVE_A_ROLES] : SLICE1_ROLES;
    if (!allowed.includes(role)) throw new Error(`role ${role} not enabled (fullTeam=${team})`);
    let incident = await getIncident(incidentId);
    if (incident.status !== runningStatus(role)) await setStatus(incidentId, runningStatus(role));
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
    const turn = await agent37.runTurn(
      { instanceId, role, incidentId, input: buildTaskText(role, incident, extra), sessionId, reasoningEffort: "medium" },
      (e) => void emit({ ...e, incident_id: incidentId }),
    );

    const output = await parseOutput(role, turn.outputText);
    const problem = checkOutput(role as Slice1Role, output, incident);
    if (problem) throw new Error(`${role} output rejected: ${problem}`);
    must(
      await db()
        .from("agent_tasks")
        .update({ status: "COMPLETE", output, agent37_response_id: turn.responseId, finished_at: new Date().toISOString() })
        .eq("id", task.id)
        .select("id"),
      "complete task",
    );
    await audit(incidentId, role, `${role}.complete`, "agent37", { response_id: turn.responseId, cost_usd: turn.costUsd, duration_ms: turn.durationMs });

    incident = await getIncident(incidentId);
    const t = nextSteps(role, output, team, team ? await settledPlanners(incidentId) : []);
    const patch: Record<string, unknown> = { agent37_session_ids: { ...incident.agent37_session_ids, [role]: turn.sessionId } };
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
    for (const next of t.next) await enqueue(incidentId, next);

    const fresh = await getIncident(incidentId);
    for (const hook of postStepHooks) await hook(fresh, role).catch((err) => console.error("postStepHook:", err));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db().from("agent_tasks").update({ status: "FAILED", error: message, finished_at: new Date().toISOString() }).eq("id", task.id);
    await emit({ incident_id: incidentId, agent: role, kind: "error", system: "agent37", message: `${role} failed: ${message.slice(0, 300)}` });
    if (plannerFailureIsFatal(role, team)) {
      await setStatus(incidentId, "FAILED").catch(() => {});
    } else {
      // allSettled: the team goes on without this planner; coordinator starts once all four settled.
      const t = nextSteps(role, null, team, await settledPlanners(incidentId).catch(() => []));
      for (const next of t.next) await enqueue(incidentId, next).catch(() => {});
    }
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
    must(await db().from("approvals").insert({ incident_id: incidentId, decision, decided_by: by, note: note ?? null }).select("id"), "insert approval");
    await emit({ incident_id: incidentId, agent: "human", kind: "status", system: "supabase", message: `${by} ${decision === "approve" ? "approved" : "rejected"} the plan` });
    await audit(incidentId, by, `plan.${decision}`, "supabase", { note });
    const t = afterApproval(decision);
    if (decision === "approve") await setStatus(incidentId, "APPROVED");
    await setStatus(incidentId, t.status);
    if (t.next) await enqueue(incidentId, t.next, { approval: { decision, decided_by: by, note: note ?? null, decided_at: new Date().toISOString() } });
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
