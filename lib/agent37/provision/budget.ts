// S4: per-instance managed-spend budget (REAL API: https://www.agent37.com/docs/agents-api/budgets).
// GET/PATCH /v1/instances/{id}/budget. Money is integer micros on the wire ($1 = 1_000_000); this module
// exposes USD alongside the raw micros. Safety: setBudget refuses to set a cap below current month spend.

import { send, type Agent37Config, type ApiRequest } from "./templates";

const MICROS = 1_000_000;

/** Raw budget object exactly as the API returns it. */
export interface BudgetRaw {
  monthly_cap_micros: number;
  monthly_consumed_micros: number;
  monthly_remaining_micros: number;
  monthly_period: string; // YYYY-MM (UTC)
  credit_remaining_micros: number;
  updated_at: number; // epoch seconds
}

export interface Budget {
  instanceId: string;
  monthlyCapUsd: number;
  /** Managed spend counted against the cap this UTC month. */
  spentUsd: number;
  remainingUsd: number;
  creditRemainingUsd: number;
  period: string;
  updatedAt: number;
  raw: BudgetRaw;
}

export function cfgFromEnv(env: NodeJS.ProcessEnv = process.env): Agent37Config {
  const apiKey = env.AGENT37_API_KEY;
  if (!apiKey) throw new Error("AGENT37_API_KEY is not set");
  return { apiKey, baseUrl: env.AGENT37_BASE_URL || undefined };
}

export function apiBase(cfg: Agent37Config): string {
  return (cfg.baseUrl ?? "https://api.agent37.com/v1").replace(/\/+$/, "");
}

export const usdToMicros = (usd: number): number => Math.round(usd * MICROS);
export const microsToUsd = (m: number): number => m / MICROS;

export function getBudgetRequest(cfg: Agent37Config, instanceId: string): ApiRequest {
  return {
    method: "GET",
    url: `${apiBase(cfg)}/instances/${encodeURIComponent(instanceId)}/budget`,
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  };
}

export function setBudgetRequest(cfg: Agent37Config, instanceId: string, capUsd: number): ApiRequest {
  if (!Number.isFinite(capUsd) || capUsd < 0) throw new Error(`invalid cap ${capUsd}: must be a non-negative number`);
  return {
    method: "PATCH",
    url: `${apiBase(cfg)}/instances/${encodeURIComponent(instanceId)}/budget`,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    json: { monthly_cap_micros: usdToMicros(capUsd) },
  };
}

export function toBudget(instanceId: string, raw: BudgetRaw): Budget {
  return {
    instanceId,
    monthlyCapUsd: microsToUsd(raw.monthly_cap_micros),
    spentUsd: microsToUsd(raw.monthly_consumed_micros),
    remainingUsd: microsToUsd(raw.monthly_remaining_micros),
    creditRemainingUsd: microsToUsd(raw.credit_remaining_micros),
    period: raw.monthly_period,
    updatedAt: raw.updated_at,
    raw,
  };
}

/** GET /v1/instances/{id}/budget */
export async function getBudget(instanceId: string, cfg: Agent37Config = cfgFromEnv()): Promise<Budget> {
  return toBudget(instanceId, await send<BudgetRaw>(getBudgetRequest(cfg, instanceId)));
}

export interface SetBudgetResult {
  before: Budget;
  after: Budget;
}

/**
 * PATCH /v1/instances/{id}/budget {monthly_cap_micros}. Reads the budget first and refuses a cap below the
 * current month's spend (that would cut the instance off). Returns before/after so callers can log old -> new.
 */
export async function setBudget(
  instanceId: string,
  capUsd: number,
  cfg: Agent37Config = cfgFromEnv(),
): Promise<SetBudgetResult> {
  const before = await getBudget(instanceId, cfg);
  if (usdToMicros(capUsd) < before.raw.monthly_consumed_micros) {
    throw new Error(
      `refusing cap $${capUsd} for ${instanceId}: below current month spend $${before.spentUsd} (${before.period})`,
    );
  }
  const after = toBudget(instanceId, await send<BudgetRaw>(setBudgetRequest(cfg, instanceId, capUsd)));
  return { before, after };
}
