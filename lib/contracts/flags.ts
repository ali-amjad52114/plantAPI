// Feature flags (lead-owned). Waves flip these on as their gates pass.
export const FLAGS = {
  slackIntake: false, // wave A
  fullTeam: false, // wave A: reliability, production, workforce, risk, procurement, dispatch
  agentGraph: false, // wave A
  agent37Depth: false, // wave B
  governance: false, // wave B
} as const;
