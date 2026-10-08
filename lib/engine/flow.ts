// Slice 1 state machine: pure, no I/O (unit-tested).
import { offsetOf, overlappingConflict } from "./conflicts.pure";
import type { AgentRole, Incident, IncidentStatus, Slice1Role } from "../contracts/types";

export type Transition = { status: IncidentStatus; next: Slice1Role | null };

/** Status while a role's task runs. */
export const RUNNING_STATUS: Record<Slice1Role, IncidentStatus> = {
  triage: "TRIAGING",
  materials: "PLANNING",
  coordinator: "PLANNING",
  erp: "EXECUTING",
  verification: "VERIFYING",
};

/** Where the incident goes after a role's task completes. */
export function afterTask(role: Slice1Role, output?: { verdict?: string }): Transition {
  switch (role) {
    case "triage":
      return { status: "PLANNING", next: "materials" };
    case "materials":
      return { status: "PLANNING", next: "coordinator" };
    case "coordinator":
      return { status: "WAITING_APPROVAL", next: null };
    case "erp":
      return { status: "WAITING_REPAIR", next: null };
    case "verification":
      return output?.verdict === "accept" ? { status: "CLOSED", next: null } : { status: "WAITING_REPAIR", next: null };
  }
}

export function afterApproval(decision: "approve" | "reject"): Transition {
  return decision === "approve" ? { status: "EXECUTING", next: "erp" } : { status: "REJECTED", next: null };
}

/** Which statuses accept which human action. */
export const CAN_APPROVE: IncidentStatus[] = ["WAITING_APPROVAL"];
export const CAN_COMPLETE: IncidentStatus[] = ["WAITING_REPAIR"];

/** Incident column that stores each role's output. */
export const OUTPUT_COLUMN: Record<Slice1Role, "triage" | "materials" | "plan" | "erp" | "verification"> = {
  triage: "triage",
  materials: "materials",
  coordinator: "plan",
  erp: "erp",
  verification: "verification",
};

/** REAL ONLY guards: reject outputs that claim results the agent did not actually produce. Returns the problem or null. */
export function checkOutput(
  role: Slice1Role,
  output: unknown,
  incident: Pick<Incident, "materials"> & Partial<Pick<Incident, "triage">>,
  now: number = Date.now(),
  team?: { workforce?: { available_from?: string; conflicts?: unknown } } | null,
): string | null {
  const o = output as Record<string, any>;
  if (role === "coordinator") {
    if (/^s*NO FEASIBLE WINDOW/i.test(String(o.rationale ?? ""))) return `no feasible repair window — needs replanning (${String(o.rationale).slice(0, 300)})`;
    const s = o.supplier ?? {};
    const found = (incident.materials?.suppliers ?? []).some(
      (m) => (m.url && m.url === s.url) || (m.supplier === s.supplier && m.price === s.price),
    );
    if (!found) return `plan supplier "${s.supplier}" ${s.price} is not one of the suppliers Materials actually found`;
    for (const k of ["window_start", "window_end"]) if (!o[k] || Number.isNaN(Date.parse(o[k]))) return `plan ${k} is blank or not a timestamp (${JSON.stringify(o[k])})`;
    const need = incident.triage?.estimated_repair_minutes;
    const have = Math.round((Date.parse(o.window_end) - Date.parse(o.window_start)) / 60_000);
    if (need && have < need) return `plan window is ${have} min but triage estimates ${need} min of repair`;
    if (Date.parse(o.window_start) < now - 5 * 60_000) return `plan window starts in the past (${o.window_start})`;
    const wf = team?.workforce;
    if (wf) {
      const tz = offsetOf(wf.available_from) ?? offsetOf(o.window_start) ?? process.env.PLANTAPI_TZ_OFFSET ?? "-04:00";
      const hit = overlappingConflict(wf.conflicts, Date.parse(o.window_start), Date.parse(o.window_end), now, tz);
      if (hit) return `plan window overlaps the technician's conflict "${hit.label}"`;
      const from = wf.available_from ? Date.parse(wf.available_from) : NaN;
      if (!Number.isNaN(from) && Date.parse(o.window_start) < from - 60_000) return `plan window starts before the technician is available (${wf.available_from})`;
    }
  }
  if (role === "erp" && !String(o.fiix_wo_code ?? "").trim()) return `no Fiix work order created: ${o.summary ?? ""}`;
  // odoo_block_ref is verified against the real Odoo record (window bounds) in odoo-check.ts.
  if (role === "verification" && o.verdict === "accept" && !o.fiix_closed) return "verdict accept but the Fiix WO was not closed";
  return null;
}

// ---------- Wave A: full team (behind FLAGS.fullTeam) ----------
// triage → [reliability ∥ materials ∥ production ∥ workforce] → coordinator → risk → WAITING_APPROVAL

export const PLANNERS: AgentRole[] = ["reliability", "materials", "production", "workforce"];
export const EXECUTORS: AgentRole[] = ["erp", "procurement", "dispatch"];

export type Steps = { status: IncidentStatus; next: AgentRole[] };

export function runningStatus(role: AgentRole): IncidentStatus {
  return (RUNNING_STATUS as Partial<Record<AgentRole, IncidentStatus>>)[role] ?? (EXECUTORS.includes(role) ? "EXECUTING" : "PLANNING");
}

/**
 * Where the incident goes after `role` completes. `settledPlanners` = planner roles whose task for this
 * incident is COMPLETE or FAILED (including this one); the coordinator starts once all four settled.
 */
export function nextSteps(role: AgentRole, output: unknown, fullTeam: boolean, settled: AgentRole[] = []): Steps {
  if (!fullTeam) {
    const t = afterTask(role as Slice1Role, output as { verdict?: string });
    return { status: t.status, next: t.next ? [t.next] : [] };
  }
  if (role === "triage") return { status: "PLANNING", next: [...PLANNERS] };
  if (PLANNERS.includes(role)) {
    const all = PLANNERS.every((p) => settled.includes(p));
    return { status: "PLANNING", next: all ? ["coordinator"] : [] };
  }
  if (role === "coordinator") return { status: "PLANNING", next: ["risk"] };
  if (role === "risk") {
    return (output as { decision?: string })?.decision === "DENY" ? { status: "REJECTED", next: [] } : { status: "WAITING_APPROVAL", next: [] };
  }
  // erp ∥ procurement ∥ dispatch: wait for all three, then the technician repairs.
  if (EXECUTORS.includes(role)) {
    const all = EXECUTORS.every((p) => settled.includes(p));
    // Dispatch waits for ERP so its notice + calendar event carry the real Fiix WO code.
    const next: AgentRole[] = role === "erp" && !settled.includes("dispatch") ? ["dispatch"] : [];
    return { status: all ? "WAITING_REPAIR" : "EXECUTING", next };
  }
  const t = afterTask(role as Slice1Role, output as { verdict?: string });
  return { status: t.status, next: t.next ? [t.next] : [] };
}

/** After approval: slice runs ERP; the full team runs ERP, Procurement and Dispatch in parallel. */
export function approvalSteps(decision: "approve" | "reject", fullTeam: boolean): Steps {
  const t = afterApproval(decision);
  if (!t.next) return { status: t.status, next: [] };
  // erp ∥ procurement now; dispatch follows erp (nextSteps).
  return { status: t.status, next: fullTeam ? ["erp", "procurement"] : [t.next] };
}

/** A failed planner doesn't stop the team (allSettled), except Materials: no part, no plan. */
export function plannerFailureIsFatal(role: AgentRole, fullTeam: boolean): boolean {
  if (!fullTeam) return true;
  if (PLANNERS.includes(role)) return role === "materials"; // no part, no plan
  if (EXECUTORS.includes(role)) return role === "erp"; // no WO / no block, no repair
  return true;
}

/** Bump whenever the coordinator rules (COORDINATOR_BRIEF / plan guards) change; plans without it are stale. */
export const PLAN_RULES_VERSION = "2026-10-08.1"; // .1: technician conflicts hard + plant-time timestamps

/** Why a plan can no longer be approved as-is (null = still fine). */
export function stalePlanReason(
  plan: { window_start: string; window_end: string } | null,
  repairMinutes: number | undefined,
  planRules: string | null | undefined,
  now: number,
): string | null {
  if (!plan) return "no plan";
  if (planRules !== PLAN_RULES_VERSION) return `plan was made under older engine rules (${planRules ?? "none"}; current ${PLAN_RULES_VERSION})`;
  const ws = Date.parse(plan.window_start);
  const we = Date.parse(plan.window_end);
  if (we <= now) return `the planned window ended at ${plan.window_end}`;
  const left = Math.round((we - Math.max(now, ws)) / 60_000);
  if (repairMinutes && left < repairMinutes) return `only ${left} min of the planned window are left, the repair needs ${repairMinutes} min`;
  return null;
}
