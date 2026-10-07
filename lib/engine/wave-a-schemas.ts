// Wave A role outputs (proposal — the lead promotes these into lib/contracts/types.ts).
// Every wave A agent turn must end with exactly this JSON.
import { z } from "zod";
import { ROLE_OUTPUT, SYSTEMS, type AgentRole } from "../contracts/types";

export const ReliabilityOutput = z.object({
  asset_id: z.string(),
  recurring: z.boolean(),
  failures_last_12_months: z.number().int().min(0),
  pattern: z.string(), // "3rd contactor failure on CV-104 in 12 months"
  root_cause: z.string(),
  recommendation: z.string(),
  urgency: z.enum(["asap", "next_window", "planned"]),
  sources: z.array(z.string()), // Fiix WO codes, SOP files actually read
  summary: z.string(),
});
export type ReliabilityOutput = z.infer<typeof ReliabilityOutput>;

export const WindowOption = z.object({
  start: z.string(), // ISO 8601
  end: z.string(),
  impact: z.enum(["none", "low", "medium", "high"]),
  note: z.string(),
});

export const ProductionOutput = z.object({
  workcenter: z.string(), // "Crushing Line 2"
  recommended: WindowOption,
  alternatives: z.array(WindowOption),
  source: z.string(), // where the schedule came from (Sheets id / file path)
  summary: z.string(),
});
export type ProductionOutput = z.infer<typeof ProductionOutput>;

export const WorkforceOutput = z.object({
  technician: z.string(), // "Sarah Chen"
  trade: z.string(),
  qualifications: z.array(z.string()),
  available_from: z.string(), // ISO 8601
  conflicts: z.array(z.string()),
  alternatives: z.array(z.object({ technician: z.string(), available_from: z.string() })),
  source: z.string(), // calendar id / file path
  summary: z.string(),
});
export type WorkforceOutput = z.infer<typeof WorkforceOutput>;

export const RiskOutput = z.object({
  decision: z.enum(["AUTO", "APPROVAL", "DENY"]), // overall: strictest rule among the actions
  loto_required: z.boolean(),
  hazards: z.array(z.string()),
  actions: z.array(
    z.object({ action: z.string(), system: z.enum(SYSTEMS), rule: z.enum(["AUTO", "APPROVAL", "DENY"]), reason: z.string() }),
  ),
  summary: z.string(),
});
export type RiskOutput = z.infer<typeof RiskOutput>;

export const WAVE_A_OUTPUT = {
  reliability: ReliabilityOutput,
  production: ProductionOutput,
  workforce: WorkforceOutput,
  risk: RiskOutput,
} as const;
export type WaveARole = keyof typeof WAVE_A_OUTPUT;
export const WAVE_A_ROLES = Object.keys(WAVE_A_OUTPUT) as WaveARole[];

/** Output schema for any role the engine can run. */
export function schemaFor(role: AgentRole): z.ZodType<unknown> {
  const s = (ROLE_OUTPUT as Record<string, z.ZodType<unknown>>)[role] ?? (WAVE_A_OUTPUT as Record<string, z.ZodType<unknown>>)[role];
  if (!s) throw new Error(`no output schema for role ${role}`);
  return s;
}
