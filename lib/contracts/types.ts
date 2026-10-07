// PlantAPI shared contract. Owned by the lead (session L). Workers import, never edit.
import { z } from "zod";

export const INCIDENT_STATUSES = [
  "NEW",
  "TRIAGING",
  "PLANNING",
  "WAITING_APPROVAL",
  "APPROVED",
  "EXECUTING",
  "WAITING_REPAIR",
  "VERIFYING",
  "CLOSED",
  "REJECTED",
  "FAILED",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const TASK_STATUSES = ["QUEUED", "RUNNING", "COMPLETE", "FAILED", "WAITING"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Slice 1 agents first; wave A adds the rest (names reserved now so UI and DB never change).
export const AGENT_ROLES = [
  "triage",
  "materials",
  "coordinator",
  "erp",
  "verification",
  // wave A
  "reliability",
  "production",
  "workforce",
  "risk",
  "procurement",
  "dispatch",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
export const SLICE1_ROLES: AgentRole[] = ["triage", "materials", "coordinator", "erp", "verification"];

export const SPONSORS = ["agent37", "openai", "supabase", "monid", "instacloud"] as const;
export const SYSTEMS = [...SPONSORS, "fiix", "odoo", "rs", "slack", "google"] as const;
export type SystemName = (typeof SYSTEMS)[number];

export type AuthorityRule = "AUTO" | "APPROVAL" | "DENY";

// ---------- Role outputs (every agent turn must end with exactly this JSON) ----------

export const TriageOutput = z.object({
  asset_id: z.string(), // "CV-104"
  failure_category: z.enum(["electrical", "mechanical", "instrumentation", "process", "unknown"]),
  suspected_component: z.string(), // "contactor"
  suspected_part: z.string(), // "LC1D09BD"
  confidence: z.number().min(0).max(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  required_trade: z.enum(["electrician", "millwright", "instrumentation"]),
  estimated_repair_minutes: z.number().int().positive(),
  recommended_action: z.string(),
  summary: z.string(),
});
export type TriageOutput = z.infer<typeof TriageOutput>;

export const SupplierOption = z.object({
  supplier: z.string(),
  part: z.string(),
  price: z.number(),
  currency: z.string().default("USD"),
  stock: z.number().nullable(),
  lead_time: z.string(),
  url: z.string().url().nullable(),
  source: z.enum(["monid", "odoo", "browser"]),
});
export type SupplierOption = z.infer<typeof SupplierOption>;

export const MaterialsOutput = z.object({
  part: z.string(),
  internal_stock: z.number(),
  odoo_product_id: z.number().nullable(),
  monid_tool: z.string().nullable(), // e.g. "litescrape /google/shopping"
  suppliers: z.array(SupplierOption).min(1),
  recommended_index: z.number().int().min(0),
  summary: z.string(),
});
export type MaterialsOutput = z.infer<typeof MaterialsOutput>;

export const PlanAction = z.object({
  action: z.string(), // "Create Fiix work order"
  system: z.enum(SYSTEMS),
  rule: z.enum(["AUTO", "APPROVAL", "DENY"]),
});

export const RepairPlan = z.object({
  asset_id: z.string(),
  asset_name: z.string(),
  diagnosis: z.string(),
  part: z.string(),
  internal_stock: z.number(),
  supplier: SupplierOption,
  technician: z.string(), // "Sarah Chen"
  technician_trade: z.string(),
  window_start: z.string(), // ISO 8601
  window_end: z.string(),
  expected_downtime_minutes: z.number().int(),
  production_impact: z.enum(["none", "low", "medium", "high"]),
  safety: z.array(z.string()), // ["LOTO required"]
  confidence: z.number().min(0).max(1),
  actions: z.array(PlanAction),
  rationale: z.string(), // how disagreements were resolved
});
export type RepairPlan = z.infer<typeof RepairPlan>;

export const ErpOutput = z.object({
  fiix_wo_code: z.string(), // Fiix WO code/number as shown in Fiix
  fiix_wo_status: z.string(),
  odoo_block_ref: z.string().nullable(), // id of the Odoo record that blocks Crushing Line 2
  screenshot_path: z.string().nullable(), // path on the Agent37 instance
  summary: z.string(),
});
export type ErpOutput = z.infer<typeof ErpOutput>;

export const VerificationCheck = z.object({ name: z.string(), pass: z.boolean(), detail: z.string() });
export const VerificationOutput = z.object({
  verdict: z.enum(["accept", "reject"]),
  checks: z.array(VerificationCheck).min(1),
  reason: z.string(),
  fiix_closed: z.boolean(),
  odoo_unblocked: z.boolean(),
});
export type VerificationOutput = z.infer<typeof VerificationOutput>;

export const ROLE_OUTPUT = {
  triage: TriageOutput,
  materials: MaterialsOutput,
  coordinator: RepairPlan,
  erp: ErpOutput,
  verification: VerificationOutput,
} as const;
export type Slice1Role = keyof typeof ROLE_OUTPUT;
export type RoleOutput<R extends Slice1Role> = z.infer<(typeof ROLE_OUTPUT)[R]>;

// ---------- Live events (rows in agent_events; UI feed + graph read these) ----------

export type EventKind = "status" | "log" | "tool" | "output" | "error";
export interface AgentEvent {
  id?: string;
  incident_id: string;
  agent: AgentRole | "system" | "human";
  kind: EventKind;
  system: SystemName | null; // which sponsor/system badge to show
  message: string; // one human-readable line for the feed
  data?: Record<string, unknown>;
  created_at?: string;
}

// ---------- DB rows (see supabase/migrations; columns must match) ----------

export interface Incident {
  id: string;
  plant_id: string;
  asset_id: string | null;
  title: string;
  alarm_text: string;
  photo_url: string | null;
  status: IncidentStatus;
  triage: TriageOutput | null;
  materials: MaterialsOutput | null;
  plan: RepairPlan | null;
  erp: ErpOutput | null;
  verification: VerificationOutput | null;
  agent37_session_ids: Record<string, string>; // role -> Agent37 session id
  created_at: string;
  updated_at: string;
}

export interface AgentTask {
  id: string;
  incident_id: string;
  role: AgentRole;
  status: TaskStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  agent37_response_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  incident_id: string;
  decision: "approve" | "reject";
  decided_by: string;
  note: string | null;
  created_at: string;
}

export interface RepairEvent {
  id: string;
  incident_id: string;
  kind: "completion_submitted" | "verification_rejected" | "verification_accepted";
  notes: string | null;
  actual_downtime_minutes: number | null;
  photo_url: string | null;
  created_at: string;
}
