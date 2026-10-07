# D1 (Agent37 image + live view) - resume notes

Paused by lead at ~14:50 on 2026-10-07.

## Done
- Read PLAN.md (S4 kickoff, wave B row) and CONTRACTS.md (REAL ONLY, limits).
- Confirmed .env in this repo has AGENT37_API_KEY, AGENT37_BASE_URL, AGENT37_INSTANCE_ID (values not printed).
- No files written yet in agent/image/ or lib/agent37/provision/ (only this note).
- No Agent37 API calls made. No instance created. No templates built. Spend $0.

## Template ids
- None yet.

## Stopped at
- Step 0: searching docs/ for Agent37 API notes (template build, instances, budgets, auto-sleep, live view).
  Known from PLAN.md: screenshot via POST /v1/instances/{id}/exec + GET /v1/files/content works;
  live view needs a hermes-vnc-desktop template build (untested).

## Next command
- Find the API spec: `curl -s "$AGENT37_BASE_URL/openapi.json"` (or /docs) with the key from .env loaded via env,
  then locate the template-build and instance endpoints before writing
  agent/image/plantapi-agent/, agent/image/hermes-vnc-desktop/, lib/agent37/provision/templates.ts and build-templates.ts.
- Live-view test (max 1 new instance, auto-sleep, $1 budget, delete after) still needs the lead's go-ahead to resume.
