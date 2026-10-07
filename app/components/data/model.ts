// UI-side view of one incident: exactly the rows the engine writes (incidents, agent_tasks, agent_events).
// Both the live Supabase source and the mock replay produce this shape, so every component renders the same way.
import type { AgentEvent, AgentRole, AgentTask, Incident } from "@/lib/contracts/types";

export interface IncidentView {
  incident: Incident;
  tasks: Partial<Record<AgentRole, AgentTask>>;
  events: AgentEvent[]; // oldest first
  followUp?: AgentTask; // dispatch ack-follow-up watch row (Agent37 cron), if any
}

export interface IncidentActions {
  approve(decision: "approve" | "reject", note?: string): Promise<void>;
  complete(input: { notes: string; downtimeMinutes: number; photo: File | null; mockPhoto?: "wrong" | "right" }): Promise<void>;
}

// Demo-only controls (mock replay). Live mode leaves this undefined.
export interface MockControls {
  playing: boolean;
  started: boolean;
  speed: number;
  play(): void;
  pause(): void;
  setSpeed(n: number): void;
  reset(): void;
  holdRole(role: AgentRole | null): void; // "take control": pauses only that agent
}

export const LANES: { name: string; roles: AgentRole[] }[] = [
  { name: "Intake", roles: ["triage"] },
  { name: "Plan", roles: ["reliability", "materials", "production", "workforce"] },
  { name: "Decide", roles: ["coordinator", "risk"] },
  { name: "Execute", roles: ["procurement", "erp", "dispatch"] },
  { name: "Close", roles: ["verification"] },
];

export const ROLE_LABEL: Record<AgentRole, string> = {
  triage: "Triage", reliability: "Reliability", materials: "Materials", production: "Production", workforce: "Workforce",
  coordinator: "Coordinator", risk: "Risk", procurement: "Procurement", erp: "ERP", dispatch: "Dispatch", verification: "Verification",
};

// Agents that drive a browser on the Agent37 instance (Fiix, RS). The rest work through tool calls.
export const WEB_ROLES: AgentRole[] = ["triage", "reliability", "materials", "erp", "verification"];

export const SYSTEM_LABEL: Record<string, string> = {
  agent37: "AGENT37", openai: "OPENAI", supabase: "SUPABASE", monid: "MONID", instacloud: "INSTACLOUD",
  fiix: "FIIX", odoo: "ODOO", rs: "RS", slack: "SLACK", google: "GOOGLE",
};
