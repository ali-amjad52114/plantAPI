// Pure cost math for cost.ts (unit-tested without DB/network).
export type IncidentCost = {
  agent37_usd: number;
  agent37_micros: number;
  periods: number;
  shared_instance: boolean; // another incident was running on the instance during some period
  source: string;
  updated_at: string;
};

export function addSpend(prev: Partial<IncidentCost> | null, deltaMicros: number, shared: boolean): IncidentCost {
  const micros = (prev?.agent37_micros ?? 0) + deltaMicros;
  return {
    agent37_usd: micros / 1e6,
    agent37_micros: micros,
    periods: (prev?.periods ?? 0) + 1,
    shared_instance: Boolean(prev?.shared_instance) || shared,
    source: "agent37 GET /v1/instances/{id}/usage total_micros delta",
    updated_at: new Date().toISOString(),
  };
}
