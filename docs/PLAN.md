# PlantAPI — living plan (final)

> One plan, edited in place. Follows `C:\AI\Projects\neon\docs\HACKATHON_PLAYBOOK.md`.
> Two kinds of "agent" in this file: **build sessions/workers** (Claude Code, building the product) and **product agents** (the 11 PlantAPI agents that run on Agent37).

## 0. Playbook check (learnings from the last hackathon)

| # | Playbook rule | Status | Action |
|---|---|---|---|
| 1 | Name, story, deploy rule, model provider before code | ✅ **PlantAPI** everywhere: plan, `package.json`, app text, InstaCloud project, GitHub repo `ali-amjad52114/plantAPI` (private, first commit 14:12 2026-10-07). Local folder stays `C:\AI\agent37` (renaming breaks sessions) | Model names fixed at spike. |
| 2 | Human-only steps on day 0, first | ⚠️ partly done | §7 list (Odoo apps ✅, Fiix seed ✅; Monid, Odoo API key, Slack/Google workspace open) |
| 3 | Test every key in first 30 min | ✅ read-only done today (OpenAI, Supabase, Monid, InstaCloud, Agent37) | `scripts/check-apis` at 0:00 and before demo |
| 4 | Contracts before workers | ⚠️ drafted only | Lead writes `docs/CONTRACTS.md` + stubs 0:30–0:50, before any worker |
| 5 | Thin end-to-end slice first | ✅ phase 2 slice with real sponsors | — |
| 6 | One worker per folder; only lead edits shared files | ✅ ownership table §8 | — |
| 7 | Isolate parallel work | ⚠️ one Agent37 plant, one Supabase project | Worktree + port per session; reserved migration numbers; Agent37 quota in STATUS |
| 8 | Evidence, not "done" | ✅ gate per phase + verifier | — |
| 9 | Control the demo target | ⚠️ RS Online + supplier search are live/external | Pin search query; Materials accepts any RS listing; backup video |
| 10 | One living plan + status board | ⚠️ this file is the **only** plan; `docs/STATUS.md` + `docs/HANDOFF.md` not created yet | Create at 0:00; never add another plan file |
| 11b | Prepare generic tooling before the event | ⚠️ | Tonight: local files only (§7) — no cloud resources |
| Anti | Placeholder name renamed halfway | ⚠️ | see rule 1 |
| Anti | Two model providers after credits run out | ✅ OpenAI only; check balance at 0:00 | — |
| Anti | CLI silently adds auto-deploy | ⚠️ InstaCloud | Check `.github/` after every `insta` command; deploy only by lead |
| Anti | Agent clicking cloud consoles | ✅ human does sign-ins (Google, Slack, Odoo) | — |
| Anti | Specs before reading the code they extend | ✅ Agent37 spike (phase 0.5) before contracts | — |
| Anti | Secrets pasted in chat | ❌ happened (OpenAI, Agent37, Supabase) | Rotate all after the event |
| Anti | AI thresholds tuned by feel | ⚠️ | 5-case eval for coordinator (must pick 18:00), 10 phrasings for triage |
| Anti | Late features edit shared files | ✅ extension slots in contracts (header actions, incident panels, post-step hooks) | — |

## 1. Decisions

| Decision | Value |
|---|---|
| Story | A plant's own digital maintenance team on Agent37 takes a failure from photo to closed work order, with one human approval. |
| Lines | "Your maintenance technician should repair equipment, not spend hours coordinating the repair." · "Agent37 runs the workers. OpenAI makes them think. Supabase keeps them coordinated. Monid gives them tools. InstaCloud keeps the product running safely." |
| Sponsor priority | **Agent37 deepest** — every product-agent turn, tool call, memory, file, schedule and plant runs there; backend is only the referee. |
| Model | OpenAI only (fast + smart names fixed at spike). |
| Systems | Real only, no fake adapters. Safety net: `check-apis` + backup video. |
| CMMS | **Fiix via the Agent37 browser** (no API: the plant agent logs in at `https://ali52114.macmms.com/` → `ali52114.fiix.software`; credentials in `.env.local` → instance env). Fiix owns assets, failure history and work orders. Seeded 2026-10-06: 5 assets + 2 closed CV-104 contactor WOs. Fallback if browser is too slow/brittle: Odoo Maintenance. |
| ERP | **Odoo** `https://evr52114.odoo.com` (DB `evr52114`, 20.0+e, trial locks ~2026-10-20): inventory (LC1D09BD stock 0), Crushing Line 2 work centre block/unblock, procurement record. **Read + write via Odoo JSON-2 API** (`POST /json/2/<model>/<method>`, `Authorization: bearer $ODOO_API_KEY` — verified 2026-10-06: create + search_read work). Odoo MCP (`/mcp`, `$ODOO_MCP_TOKEN`) is read-only (search, read_group, fields, models, context) — usable as an MCP server for the Agent37 agents. Seeded: product `LC1D09BD` (storable, qty 0), work centre `Crushing Line 2` (CL2), equipment `CV-104 Conveyor` → CL2. |
| Supplier | RS Online: Monid finds the listing → Agent37 browser opens the product page (price/stock, no login needed). Optional login to add to basket/quote — never checkout. |
| Intake | Operator reports in **Slack to the plant agent** (Agent37 messaging) or uploads in the dashboard. No separate service desk. |
| Deploy | InstaCloud project `5111d812-…`, lead deploys only; no auto-deploy until phase 5. |
| Scope | One scenario (CV-104 / LC1D09BD), single plant in demo + "Add plant", no login, never complete a purchase. |

## 2. Sponsors — one job each

| Sponsor | Job | Functions |
|---|---|---|
| **Agent37** | Workforce + runtime | Plant instance, custom `plantapi-agent` image, 11 role skills, `/v1/responses` + streaming, sessions (memory), files (SOPs, photos, reports), app connections (Odoo, Calendar, Sheets, Gmail, Slack), browser, crons (follow-ups), messaging (Slack intake/acks), webhooks (alarm), budgets + usage (cost per incident), backups (checkpoint), logs + metrics, fork/"Add plant" |
| **OpenAI** | Intelligence | Vision diagnosis, strict-JSON diagnosis/plan/risk, model behind the Agent37 agents, coordinator, evidence check |
| **Supabase** | Shared memory | Tables + state machine, Realtime → dashboard + agent graph, approvals, audit log |
| **Monid** | Outside world | `discover`, Google Shopping search (supplier), AgentMail (supplier email), Saperly (technician call). Search/email/calls go **only** through Monid. |
| **InstaCloud** | Hosting + governance | Hosts dashboard/API/webhook + secrets; **evidence archive** (storage: upload ALLOW, delete APPROVE); **incident-analysis branch env** (create ALLOW, delete APPROVE); agent policy with real approval IDs (scale/prod change APPROVE, delete project DENY); protected `main`; audit panel |
| Fiix (browser) | CMMS | Asset lookup, CV-104 failure history, create/assign/close work order |
| Odoo | ERP | Inventory, work-centre block/unblock, procurement record |
| Google Sheets / Calendar / Gmail | Schedule / people / formal comms | Downtime windows; book Sarah; supervisor notice + summary |
| Slack | Team comms + intake | Report failure, approval request, acks |
| RS Online | Supplier | Price, stock, lead time — read only |

## 3. Product agents (11, all on the Agent37 plant instance)

| Phase | Agent | Does | Uses |
|---|---|---|---|
| Intake | Triage | Asset, failure class, severity, trade | OpenAI vision, Fiix asset |
| Plan ∥ | Reliability | History, pattern, root cause | Fiix WO history, SOP files, plant memory |
| Plan ∥ | Materials | Stock, external sourcing | Odoo, **Monid**, Agent37 browser |
| Plan ∥ | Production | Lowest-impact window | Sheets, Odoo work centres |
| Plan ∥ | Workforce | Skill + availability | Calendar |
| Decide | Coordinator | Resolves disagreement → one plan | OpenAI strict JSON |
| Decide | Risk | AUTO / APPROVAL / DENY, LOTO | Authority rules |
| Execute ∥ | Procurement | Supplier record + expedite email | **Monid** AgentMail |
| Execute ∥ | ERP | Fiix WO (create + assign Sarah), block Line 2 in Odoo | Fiix browser, Odoo |
| Execute ∥ | Dispatch | Book Sarah, notices, call if no ack | Calendar, Slack, Gmail, **Monid** call, Agent37 cron |
| Close | Verification | Evidence check, update all systems, close | OpenAI, Fiix (close WO), Odoo (unblock), Sheets, Supabase |

Scripted disagreement from seed data: Production → tomorrow 07:00; Materials → part today 17:00; Workforce → Sarah 18:00; Reliability → recurring, repair ASAP. Coordinator → **18:00 today**.

## 4. Incident flow

`NEW → TRIAGING → PLANNING → WAITING_APPROVAL → APPROVED → EXECUTING → WAITING_REPAIR → VERIFYING → CLOSED`

1 Slack/dashboard report (Agent37 webhook/messaging, photo → plant files, evidence → InstaCloud storage) → 2 Triage → 3–6 four planners in parallel → 7 Coordinator + Risk → 8 human approval (Supabase; Slack request; Agent37 backup checkpoint) → 9 Procurement ∥ ERP ∥ Dispatch → 10 Agent37 cron follow-up, Monid call if no ack → 11 Sarah "done" in Slack + photo → 12 Verification closes everywhere, cost per incident shown.
Side moment: InstaCloud governance (create analysis env ALLOW → scale service APPROVE with approval id → delete project DENY).

## 5. Supabase

Tables: `plants` (`agent37_instance_id`), `assets`, `incidents`, `agent_tasks`, `agent_events`, `repair_plans`, `approvals`, `parts`, `technicians`, `repair_events`, `audit_logs`, `infra_actions`.
`agent_tasks.status`: `QUEUED | RUNNING | COMPLETE | FAILED | WAITING`. Realtime on `incidents`, `agent_tasks`, `agent_events`, `infra_actions`.
Reserved migrations: 001–009 Session A · 010–019 Session C · 020–029 Session D · 100+ lead.

## 6. Authority rules

AUTO: read history/SOP/inventory, supplier search, availability, draft WO · APPROVAL: purchase, block production, schedule outage, safety-critical · DENY: bypass safety, delete records · Infra (InstaCloud): analysis env ALLOW, prod change APPROVE, delete DENY · Spend (Agent37): budget cap per plant.

## 7. Pre-hackathon checklist (the only to-do list; tick here)

**Done**
- [x] Read-only key checks: OpenAI (133 models), Supabase token (0 projects), Monid (logged in, $1), InstaCloud (logged in, policy readable), Agent37 (templates, app catalog, crons, backups, usage)
- [x] Odoo apps installed — `https://evr52114.odoo.com`, DB `evr52114`, 20.0+e (version endpoint answers)
- [x] Fiix seeded: 5 assets + 2 closed CV-104 contactor WOs
- [x] `.env` (OpenAI, Agent37, Supabase token) + `.env.local` (Fiix, RS logins); `.gitignore` covers `.env` and `.env.*`

**Human — before the event**
- [x] Agent37 instance `plantops-plant-demo` deleted (only the old `agent37-qm` instance remains)
- [x] Name: **PlantAPI** — plan, package, app text, InstaCloud project and GitHub repo `plantAPI` renamed
- [x] Hackathon started 14:00 2026-10-07; repo pushed after start
- [x] Agent37 partial spike (other session, test instance `pfd5d7eukw`, hermes, $3 cap, auto-sleep): two browsers in parallel on one instance ✅; backend screenshot via `POST /v1/instances/{id}/exec` + `GET /v1/files/content` ✅ (asking the agent to screenshot ❌ unreliable); live view/take-over needs a `hermes-vnc-desktop` template build (untested) and shares one browser per instance
- [x] `MONID_API_KEY` in `.env` (copied from Monid CLI credentials); top-up still optional for phone-call rehearsals
- [x] Odoo MCP URL + token (read-only) and `ODOO_API_KEY` (read/write JSON-2) in `.env`; both verified
- [x] Odoo seeded via API: LC1D09BD (qty 0), work centre Crushing Line 2, 5 equipment (CV-104, MTR-104, MCC-03 → CL2; P-302, FV-221), vendor RS Components with LC1D09BD price $29.49 / 2-day lead (Purchase app not installed)
- [x] Local seed files in `seed/`: `production_schedule.csv` (today 18:00–20:00 low impact; tomorrow 07:00 lowest), `technicians.json`, `calendar_events.json` (Sarah free 18:00, busy tomorrow 07:00), `alarm.txt`, `sop/LOTO-CV104.md`, `sop/contactor-LC1D09BD.md`
- [x] Demo photos in `seed/photos/` + `CREDITS.md`: `failure-burned-contactor.jpg` (burned Schneider contactor, CC BY-SA 4.0); `completion-wrong-part.jpg` (CHNT NCH8-63 63 A — **deliberate wrong-part beat**: Verification rejects it); `completion-correct-part.jpg` (TeSys-D-style 9 A contactor, "Prom Power" brand, 3D render, no part number visible, CC BY-SA 4.0). Verification rule: part number comes from technician notes + Fiix WO; photo must show a new 3-pole TeSys-D-type contactor and must **not** show a contradicting label.
- [ ] Slack + Google: connected through Agent37 app connections at 0:00 — you only need the Slack workspace and Google account to sign in with
- [x] OpenAI credit confirmed by user
- [ ] Event rules: is preparing code/docs before the start allowed? Submission format (repo public? video? deadline?)

**Claude — local files only, no cloud (say go)**
- [ ] `docs/CONTRACTS.md` draft, `docs/STATUS.md`, `docs/HANDOFF.md`, `docs/DEMO_SCRIPT.md`
- [ ] `.env.example`, `scripts/check-apis` (read-only, PASS/FAIL per service)
- [ ] 11 role-skill drafts + Fiix/Odoo/Monid skill drafts, seed data files, kickoff prompts (lead / worker / verifier)

**After the event**
- [ ] Rotate OpenAI, Agent37, Supabase keys and the Fiix/RS password (all pasted in chat)

## 8. Build plan — multi-session, multi-agent (Slice 1 first)

**Slice 1 (the only goal until its gate passes):** dashboard upload (photo + alarm) → **Triage** (Agent37 + OpenAI vision) → **Materials** (Odoo stock 0 → **Monid** finds RS $29.49) → **Coordinator** plan card (OpenAI strict JSON) → **Approve** → **ERP** (Fiix WO via Agent37 browser + Odoo block Line 2) → "done" + photo → **Verification** (rejects wrong-part photo, accepts correct) → Fiix WO closed, Odoo unblocked → **CLOSED**. Every step appears live in a plain activity feed (Supabase Realtime). Deployed on InstaCloud.
Deferred to waves A/B: Slack intake, Reliability/Production/Workforce/Risk, Procurement email, Dispatch + Monid call, crons, Calendar/Sheets/Gmail, animated graph, InstaCloud governance, Agent37 depth features.

**Stack lock (lead installs; workers never add packages):** TypeScript · Next.js (App Router) for UI + API routes · `worker/` Node process that runs the engine (polls `agent_tasks`, long agent turns never block HTTP) · `@supabase/supabase-js` · `openai` · `zod` · Vitest · one Dockerfile running `next start` + worker for InstaCloud.

**Rules for every session:** own git worktree + branch + port; touch only owned paths; code against `docs/CONTRACTS.md` + `lib/contracts/*`; ask the lead for contract changes; finish each worker with typecheck green + a test or smoke script + a 5-line report. Lead merges one branch at a time, typecheck + tests after each. Secrets only in `.env`/`.env.local` (copied into each worktree by the lead, never committed).

### Sessions and the agents inside them

| Session | Where | Subagents (parallel, inside the session) | Owns |
|---|---|---|---|
| **L — Lead** (this session) | `C:\AI\agent37`, branch `main`, port 3000 | L1 **check-apis** writer · L2 **Verifier** (runs gates, never writes product code) · L3 **Eval** (Triage/Verification prompt checks on the 3 photos) | `docs/`, `lib/contracts/`, `package.json`, Dockerfile, merges, deploys |
| **S1 — Core engine** | `C:\AI\plantapi-core`, branch `s/core`, port 3001 | A1 **Data**: Supabase migrations 001–009, seed (plant, assets, technicians, parts), Realtime · A2 **Agent37 client**: responses + SSE stream + sessions + files + exec, mirror events → `agent_events` · A3 **AI gateway**: `chat`, `chatJSON` (zod, retry once), `vision`; Triage/Coordinator/Verification schemas · A4 **Engine**: slice state machine, worker loop, approval + "done" API routes | `supabase/`, `lib/agent37/`, `lib/ai/`, `lib/engine/`, `worker/`, `app/api/` |
| **S2 — Tools & skills** | `C:\AI\plantapi-tools`, branch `s/tools`, port 3002 | C1 **Fiix browser skill**: login, create WO on CV-104 + assign, close WO — tested on Agent37 `pfd5d7eukw` · C2 **Odoo skill**: stock lookup, block/unblock Crushing Line 2 (JSON-2 API) · C3 **Monid skill**: `discover` → supplier search for LC1D09BD, returns supplier/price/stock/URL · C4 **Role skills**: Triage, Materials, ERP, Verification instructions + output formats; latency per turn | `agent/skills/`, `scripts/smoke-*` |
| **S3 — UI & deploy** | `C:\AI\plantapi-ui`, branch `s/ui`, port 3003 | B1 **Incident pages**: upload, incident list, detail, plan card, Approve, technician "done" + photo — built from Supabase rows / fixtures · B2 **Live activity feed**: Realtime list of `agent_events` with sponsor badge · B3 **Deploy prep**: Dockerfile (next + worker), InstaCloud deploy script, env/secret mapping (lead runs the deploy) | `app/(dashboard)/`, `app/components/`, `infra/`, `scripts/deploy*` |

Max 4 sessions side by side; ≤4 subagents each. Shared quotas (`docs/STATUS.md`): Agent37 = one instance `pfd5d7eukw` (S2 tests, S1 integration); Monid ≤ $1 until topped up; Supabase = one project, migrations 001–009 S1 only.

### Kickoff prompts (paste one into each new session, opened in its folder)

**S1 — Core engine**
> You are session S1 (core engine) for PlantAPI. Read `docs/PLAN.md` §8 and `docs/CONTRACTS.md`. Work only in `supabase/`, `lib/agent37/`, `lib/ai/`, `lib/engine/`, `worker/`, `app/api/` on branch `s/core`, port 3001, env from `.env` + `.env.local`. Spawn 4 subagents in parallel: A1 Data, A2 Agent37 client, A3 AI gateway, A4 Engine, exactly as in the §8 table; each touches only its own folder. Code against the contracts and stubs; do not add dependencies or edit other paths — report contract needs to the lead. Done = typecheck green, unit tests for schemas/state machine, a smoke script that runs one Triage turn on Agent37 instance `pfd5d7eukw` and writes events to Supabase. End with a 5-line report per subagent (works, how checked, mocked, open issues) appended to `docs/HANDOFF.md`.

**S2 — Tools & skills**
> You are session S2 (tools & skills) for PlantAPI. Read `docs/PLAN.md` §1, §8 and `docs/CONTRACTS.md`, and the seed files in `seed/`. Work only in `agent/skills/` and `scripts/smoke-*` on branch `s/tools`, port 3002, env from `.env` + `.env.local`. Spawn 4 subagents in parallel: C1 Fiix browser skill, C2 Odoo skill, C3 Monid skill, C4 Role skills, as in the §8 table. Test on Agent37 instance `pfd5d7eukw` only — never create instances; ask before any paid Monid run beyond discover + one search. Never complete a purchase. Fiix/Odoo writes only on CV-104 / Crushing Line 2 demo records. Done = one smoke script per integration printing PASS/FAIL with evidence (WO number, Odoo record ids, supplier result, screenshot path) and measured latency. Append a 5-line report per subagent to `docs/HANDOFF.md`.

**S3 — UI & deploy**
> You are session S3 (UI & deploy) for PlantAPI. Read `docs/PLAN.md` §8 and `docs/CONTRACTS.md`; reuse the look of `docs/ui-mockup.html`. Work only in `app/(dashboard)/`, `app/components/`, `infra/`, `scripts/deploy*` on branch `s/ui`, port 3003. Spawn 3 subagents in parallel: B1 Incident pages, B2 Live activity feed, B3 Deploy prep, as in the §8 table. Build from Supabase rows with a fixture mode (`?mock=1`) so you don't wait for S1. Do not deploy — the lead deploys. Done = typecheck green, pages render with fixtures, screenshots of upload → plan card → approve → done → closed, Dockerfile builds locally. Append a 5-line report per subagent to `docs/HANDOFF.md`.

### Command model
Session L (this one) is the **main session**: it writes contracts, assigns every task, merges, deploys and runs gates. Other sessions take work **only** from L (kickoff prompt, then follow-ups sent by L via session messages) and report back in `docs/HANDOFF.md`. Nobody else edits `docs/PLAN.md`, `docs/CONTRACTS.md` or `lib/contracts/`.

### Waves after the slice gate (same sessions, re-tasked by L)

| Wave | Goal | S1 Core | S2 Tools & skills | S3 UI | S4 Platform (new) | Gate |
|---|---|---|---|---|---|---|
| **A — Full team** | All 11 agents, parallel planning + execution, the disagreement | Parallel fan-out/fan-in; Reliability, Production, Workforce, Risk, Procurement, Dispatch in engine; coordinator eval (picks 18:00) | Skills: Fiix history read, Sheets schedule, Calendar booking, Gmail notice, Slack intake/approval/ack, Monid AgentMail | Animated agent graph; plan card shows the disagreement + resolution; Slack-origin incidents | — | Golden path ×3 with all 11 agents; Slack report starts it |
| **B — Agent37 depth + governance** | Show Agent37 everywhere; InstaCloud governance | Cost per incident (Agent37 usage); backup checkpoint before execution | Monid Saperly call on no-ack; Agent37 cron follow-up; RS page browser confirm + screenshot | Plant panels: files, memory, connected systems, cost, health, follow-ups; governance panel | `plantapi-agent` custom image; "Add plant" (new instance); budgets; live browser view (template build); InstaCloud policy `branch_specific` + protected `main`, approval ids, analysis branch env, evidence storage | Screenshot per feature; governance ALLOW / APPROVE / DENY live |
| **C — Ship** | Demo-proof | Fix verifier findings only | Fix verifier findings only | Polish, demo mode reset button | Deploy final | README (sponsors, honest status, diagram), demo 3× without a terminal, backup video, full-history secret scan |

## 9. Timeline and gates (T = when the lead finishes phase 1)

| Time | Phase | Who | Gate (evidence) |
|---|---|---|---|
| now → +25 min | 0 Lead prep | L (+L1) | `scripts/check-apis` all PASS; Supabase project created; Next.js scaffold + deps locked; `docs/CONTRACTS.md` + `lib/contracts/*` stubs; `STATUS.md`, `HANDOFF.md`; worktrees `plantapi-core/-tools/-ui` created with env files; typecheck green |
| T → T+75 min | 2 Slice build | S1, S2, S3 in parallel; L merges every ~15 min | Each session's done-criteria met (see prompts) |
| T+75 → T+100 | 2 Slice integration | L (+L2 verifier) | **Slice 1 runs end to end on the deployed InstaCloud URL** 3× — upload → Triage → Materials (Monid) → plan → Approve → Fiix WO + Odoo block → wrong photo rejected → correct photo → CLOSED; evidence: Fiix WO number, Odoo block record, Supabase rows, screenshots |
| after slice gate | 3 Wave A | S1/S2/S3 re-tasked | Slack intake, remaining 7 agents, parallel planning, disagreement, Calendar/Sheets/Gmail, animated graph |
| after slice gate | 4 Wave B | new S4 platform | Agent37 depth (image, Add plant, crons, budgets, backups, live view) + InstaCloud governance |
| last 30 min | 5 Ship | L (+L2) | README, demo 3× without terminal, backup video, history secret scan |

## 10. Demo (≈90 s)

0–10 Sarah's supervisor posts photo + alarm in Slack → 10–30 graph lights up, four planners in parallel → 30–45 Monid sources part, Agent37 browser confirms, agents disagree, coordinator decides → 45–55 plan, **Approve** → 55–75 WO, booking, block, notices, checkpoint, Monid call → 75–85 Sarah "done" + photo → 85–90 CLOSED, cost per incident. Then 15 s governance: ALLOW / APPROVE / DENY.
Closing line: *One failure. Eleven agents. One Agent37 plant team. Five sponsors. One approval. Closed.*
