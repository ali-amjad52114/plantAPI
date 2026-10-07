// PlantAPI module interfaces. Owned by the lead. Implementations live in the owning session's folder.
import type { z } from "zod";
import type { AgentEvent, AgentRole, Slice1Role, RoleOutput } from "./types";

// ---------- Agent37 (S1/A2 implements in lib/agent37/) ----------
export interface Agent37TurnRequest {
  instanceId: string;
  role: AgentRole;
  incidentId: string;
  input: string; // full task text; role skill path is referenced inside it
  sessionId?: string; // continue a role's session for this incident
  reasoningEffort?: "low" | "medium" | "high";
  files?: string[]; // paths on the instance to attach
}
export interface Agent37TurnResult {
  responseId: string;
  sessionId: string;
  outputText: string;
  costUsd: number | null;
  durationMs: number;
}
export interface Agent37Client {
  /** Runs one agentic turn with streaming; calls onEvent for each progress event. */
  runTurn(req: Agent37TurnRequest, onEvent: (e: Omit<AgentEvent, "incident_id">) => void): Promise<Agent37TurnResult>;
  uploadFile(instanceId: string, path: string, content: Buffer): Promise<void>;
  readFile(instanceId: string, path: string): Promise<Buffer>;
  exec(instanceId: string, command: string, timeoutMs?: number): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

// ---------- OpenAI gateway (S1/A3 implements in lib/ai/) ----------
export const MODELS = {
  fast: process.env.OPENAI_MODEL_FAST ?? "gpt-5.5",
  smart: process.env.OPENAI_MODEL_SMART ?? "gpt-5.5",
} as const;
export interface AiGateway {
  chat(prompt: string, opts?: { model?: keyof typeof MODELS; system?: string }): Promise<string>;
  /** Validates with schema; retries once with the validation error; then throws. */
  chatJSON<T>(prompt: string, schema: z.ZodType<T>, opts?: { model?: keyof typeof MODELS; system?: string; imageUrls?: string[] }): Promise<T>;
  /** Extracts the final JSON object from an agent's free-text reply and validates it (retry once via chatJSON repair). */
  parseAgentOutput<R extends Slice1Role>(role: R, outputText: string): Promise<RoleOutput<R>>;
}

// ---------- Independent verifiers (S2 implements in lib/tools/) ----------
// The agents do the work on Agent37; the backend re-checks outcomes itself (playbook §8).
export interface OdooReader {
  stock(defaultCode: string): Promise<{ productId: number; qty: number } | null>;
  workcenterBlocked(workcenterName: string): Promise<{ blocked: boolean; ref: string | null }>;
}
export interface FiixChecker {
  /** Screenshot of the WO page via Agent37 exec + agent-browser; returns instance path. */
  screenshotWorkOrder(instanceId: string, woCode: string): Promise<string>;
}

// ---------- Engine (S1/A4 implements in lib/engine/ + worker/) ----------
export interface Engine {
  start(incidentId: string): Promise<void>; // NEW -> TRIAGING ... -> WAITING_APPROVAL
  approve(incidentId: string, decision: "approve" | "reject", by: string, note?: string): Promise<void>; // -> EXECUTING -> WAITING_REPAIR
  complete(incidentId: string, input: { notes: string; actualDowntimeMinutes: number; photoUrl: string }): Promise<void>; // -> VERIFYING -> CLOSED | WAITING_REPAIR
}
