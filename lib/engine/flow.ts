// Slice 1 state machine: pure, no I/O (unit-tested).
import type { Incident, IncidentStatus, Slice1Role } from "../contracts/types";

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
export function checkOutput(role: Slice1Role, output: unknown, incident: Pick<Incident, "materials">): string | null {
  const o = output as Record<string, any>;
  if (role === "coordinator") {
    const s = o.supplier ?? {};
    const found = (incident.materials?.suppliers ?? []).some(
      (m) => (m.url && m.url === s.url) || (m.supplier === s.supplier && m.price === s.price),
    );
    if (!found) return `plan supplier "${s.supplier}" ${s.price} is not one of the suppliers Materials actually found`;
  }
  if (role === "erp" && !String(o.fiix_wo_code ?? "").trim()) return `no Fiix work order created: ${o.summary ?? ""}`;
  if (role === "verification" && o.verdict === "accept" && !o.fiix_closed) return "verdict accept but the Fiix WO was not closed";
  return null;
}
