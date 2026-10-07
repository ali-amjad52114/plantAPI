// Extension slot: run after each engine step (wave A/B add hooks; never edit the engine for them).
import type { AgentRole, Incident } from "@/lib/contracts/types";

export const postStepHooks: Array<(incident: Incident, role: AgentRole) => Promise<void>> = [];
