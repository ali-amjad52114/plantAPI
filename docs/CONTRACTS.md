# PlantAPI — contracts (owned by the lead, session L)

Code lives in `lib/contracts/types.ts` (domain types, statuses, role output schemas, events) and `lib/contracts/interfaces.ts` (module interfaces). Workers import them and never edit them; ask the lead in `docs/HANDOFF.md` for a change.

## Time boxes and limits (apply to every session and every subagent)

- Every task has a **time box**. At the box: stop, commit what works, write the 5-line report in `docs/HANDOFF.md`, mark unfinished items `BLOCKED` or `TODO`. Never keep going silently.
- A subagent that is not done at **its** box returns a partial result; the session decides, it does not extend itself.
- **No new cloud resources** (Agent37 instances, Supabase projects, InstaCloud services, domains, paid plans) unless the task names them. No purchases ever.
- Spend caps per session: Agent37 turns ≤ $1, Monid ≤ $0.50, OpenAI ≤ $2. Log spend in the report.
- Retry a failing external call at most **2** times, then report it; no loops.
- Only edit owned paths. No new dependencies (report the need). No force-push, no history rewrite, no `main` commits — branches only; the lead merges.

## Stack

TypeScript · Next.js 15 App Router (UI + API routes) · `worker/index.ts` (tsx) runs the engine, polling `agent_tasks` · `@supabase/supabase-js` · `openai` · `zod` · Vitest · one Dockerfile (`next start` + worker) on InstaCloud.

## Environment (`.env` + `.env.local`, never committed)

`OPENAI_API_KEY`, `OPENAI_MODEL_FAST`, `OPENAI_MODEL_SMART` · `AGENT37_API_KEY`, `AGENT37_BASE_URL`, `AGENT37_INSTANCE_ID` (=`pfd5d7eukw` for now) · `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` · `MONID_API_KEY` · `ODOO_URL`, `ODOO_DB`, `ODOO_API_KEY`, `ODOO_MCP_URL`, `ODOO_MCP_TOKEN` · `FIIX_URL`, `FIIX_USERNAME`, `FIIX_PASSWORD`, `RS_USERNAME`, `RS_PASSWORD`.

## Database (Supabase, migrations `supabase/migrations/001–009`, S1/A1)

| Table | Columns (all have `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`) |
|---|---|
| `plants` | `name`, `agent37_instance_id` |
| `assets` | `plant_id`, `code` (CV-104…), `name`, `fiix_code`, `odoo_equipment_id`, `workcenter` |
| `technicians` | `name`, `trade`, `title`, `shift`, `phone`, `slack`, `email` |
| `parts` | `code` (LC1D09BD), `name`, `odoo_product_id` |
| `incidents` | see `Incident` in types.ts; `status text` checked against `INCIDENT_STATUSES`; JSON columns `triage`, `materials`, `plan`, `erp`, `verification`, `agent37_session_ids jsonb default '{}'`; `updated_at` |
| `agent_tasks` | see `AgentTask` |
| `agent_events` | see `AgentEvent` (`data jsonb`) |
| `approvals` | see `Approval` |
| `repair_events` | see `RepairEvent` |
| `audit_logs` | `incident_id`, `actor`, `action`, `system`, `detail jsonb` |

Realtime on `incidents`, `agent_tasks`, `agent_events`. RLS off for the single-user demo; browser reads with the anon key; all writes go through API routes or the worker with the service-role key. Storage bucket `evidence` (public read) for photos.

## API routes (S1/A4, `app/api/`)

| Route | Body | Result |
|---|---|---|
| `POST /api/incidents` | multipart: `photo` (file), `alarm_text` | `{ incident_id }`, status `NEW`, engine starts |
| `POST /api/incidents/:id/approve` | `{ decision: "approve" \| "reject", by, note? }` | `{ ok: true }` |
| `POST /api/incidents/:id/complete` | multipart: `notes`, `actual_downtime_minutes`, `photo` | `{ ok: true }`, status `VERIFYING` |
| `POST /api/demo/reset` | — | demo data back to seed (wave C) |

## Slice 1 engine flow

`NEW` → task `triage` → `TRIAGING` → task `materials` → `PLANNING` → task `coordinator` → `WAITING_APPROVAL` → approve → `APPROVED` → task `erp` → `EXECUTING` → `WAITING_REPAIR` → complete → task `verification` → `VERIFYING` → accept: `CLOSED` / reject: back to `WAITING_REPAIR` with the reason as an event.

Each task = one Agent37 turn on the plant instance (`AGENT37_INSTANCE_ID`) with the role skill `agent/skills/roles/<role>.md` uploaded to the instance at `~/plantapi/skills/`. The agent's reply must end with the role's JSON (`ROLE_OUTPUT[role]`); `AiGateway.parseAgentOutput` extracts + validates it. Every stream event becomes an `agent_events` row with the right `system` badge. The backend then re-checks key outcomes with `OdooReader` / `FiixChecker`.

## Ownership

| Path | Owner |
|---|---|
| `docs/`, `lib/contracts/`, `package.json`, `tsconfig.json`, `next.config.*`, `app/layout.tsx` | L (lead) |
| `supabase/`, `lib/agent37/` (except `provision/`), `lib/ai/`, `lib/engine/`, `worker/`, `app/api/` | S1 core |
| `agent/skills/`, `lib/tools/`, `scripts/smoke-*` | S2 tools |
| `app/(dashboard)/`, `app/components/` | S3 UI |
| `agent/image/`, `lib/agent37/provision/`, `lib/infra/`, `infra/`, `scripts/deploy*`, `app/(admin)/` | S4 platform |

## Extension slots (wave A/B plug in without editing shared files)

UI: incident detail renders panels from `app/components/panels/index.ts` (array); header actions from `app/components/header-actions.ts`. Engine: `lib/engine/hooks.ts` exports `postStepHooks: Array<(incident, role) => Promise<void>>`. Feature flags in `lib/contracts/flags.ts`.
