// COPY of plantapi-core lib/engine/wave-a-schemas.ts (s/core bee906a) — not on main yet, so S2 smokes use this copy.
// Delete and import from ../../lib/engine/wave-a-schemas once s/core is merged.
// Deltas vs core (requested from lead, marked CHANGE): expedite_email.body, Notice.status "drafted".
import { z } from "zod";
import { SYSTEMS } from "../../lib/contracts/types";

export const ReliabilityOutput = z.object({
  asset_id: z.string(),
  recurring: z.boolean(),
  failures_last_12_months: z.number().int().min(0),
  pattern: z.string(),
  root_cause: z.string(),
  recommendation: z.string(),
  urgency: z.enum(["asap", "next_window", "planned"]),
  sources: z.array(z.string()),
  summary: z.string(),
});

export const WindowOption = z.object({
  start: z.string(),
  end: z.string(),
  impact: z.enum(["none", "low", "medium", "high"]),
  note: z.string(),
});

export const ProductionOutput = z.object({
  workcenter: z.string(),
  recommended: WindowOption,
  alternatives: z.array(WindowOption),
  source: z.string(),
  summary: z.string(),
});

export const WorkforceOutput = z.object({
  technician: z.string(),
  trade: z.string(),
  qualifications: z.array(z.string()),
  available_from: z.string(),
  conflicts: z.array(z.string()),
  alternatives: z.array(z.object({ technician: z.string(), available_from: z.string() })),
  source: z.string(),
  summary: z.string(),
});

export const RiskOutput = z.object({
  decision: z.enum(["AUTO", "APPROVAL", "DENY"]),
  loto_required: z.boolean(),
  hazards: z.array(z.string()),
  actions: z.array(
    z.object({ action: z.string(), system: z.enum(SYSTEMS), rule: z.enum(["AUTO", "APPROVAL", "DENY"]), reason: z.string() }),
  ),
  summary: z.string(),
});

export const ProcurementOutput = z.object({
  supplier: z.string(),
  part: z.string(),
  price: z.number(),
  currency: z.string(),
  supplier_record_ref: z.string().nullable(),
  expedite_email: z
    .object({
      to: z.string(),
      subject: z.string(),
      body: z.string(), // CHANGE: the composed text (needed for dry run review)
      message_id: z.string().nullable(),
      sent: z.boolean(),
    })
    .nullable(),
  purchased: z.literal(false),
  blocked: z.array(z.string()),
  summary: z.string(),
});

export const Notice = z.object({
  channel: z.enum(["slack", "gmail", "calendar", "phone", "agent37_cron"]),
  to: z.string(),
  ref: z.string().nullable(),
  status: z.enum(["sent", "booked", "scheduled", "drafted", "blocked", "failed"]), // CHANGE: + "drafted" (dry run)
  detail: z.string(),
});

export const DispatchOutput = z.object({
  technician: z.string(),
  booked_start: z.string(),
  booked_end: z.string(),
  notices: z.array(Notice),
  ack_received: z.boolean(),
  follow_up: z.string().nullable(),
  summary: z.string(),
});

export const WAVE_A_OUTPUT = {
  reliability: ReliabilityOutput,
  production: ProductionOutput,
  workforce: WorkforceOutput,
  risk: RiskOutput,
  procurement: ProcurementOutput,
  dispatch: DispatchOutput,
} as const;
export type WaveARole = keyof typeof WAVE_A_OUTPUT;
