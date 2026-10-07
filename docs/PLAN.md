# PlantAPI — living plan (final)

> One plan, edited in place. Follows `C:\AI\Projects\neon\docs\HACKATHON_PLAYBOOK.md`.
> Two kinds of "agent" in this file: **build sessions/workers** (Claude Code, building the product) and **product agents** (the 11 PlantAPI agents that run on Agent37).

## 0. Playbook check (learnings from the last hackathon)

| # | Playbook rule | Status | Action |
|---|---|---|---|
| 1 | Name, story, deploy rule, model provider before code | ✅ **PlantAPI** everywhere: plan, `package.json`, app text, InstaCloud project (renamed 2026-10-06). Only the local folder is still `agent37` | At 0:00 `git init` in a new folder `C:\AI\plantapi` (copy `.env`, `.env.local`, `docs/`, `.insta/`). Model names fixed at spike. |
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
- [x] Name: **PlantAPI** — plan, package, app text and InstaCloud project renamed; repo folder `C:\AI\plantapi` created at 0:00
- [x] `MONID_API_KEY` in `.env` (copied from Monid CLI credentials); top-up still optional for phone-call rehearsals
- [x] Odoo MCP URL + token (read-only) and `ODOO_API_KEY` (read/write JSON-2) in `.env`; both verified
- [x] Odoo seeded via API: LC1D09BD (qty 0), work centre Crushing Line 2, 5 equipment (CV-104, MTR-104, MCC-03 → CL2; P-302, FV-221), vendor RS Components with LC1D09BD price $29.49 / 2-day lead (Purchase app not installed)
- [x] Local seed files in `seed/`: `production_schedule.csv` (today 18:00–20:00 low impact; tomorrow 07:00 lowest), `technicians.json`, `calendar_events.json` (Sarah free 18:00, busy tomorrow 07:00), `alarm.txt`, `sop/LOTO-CV104.md`, `sop/contactor-LC1D09BD.md`
- [x] Demo photos in `seed/photos/` + `CREDITS.md`: `failure-burned-contactor.jpg` (burned Schneider contactor, CC BY-SA 4.0); `completion-wrong-part.jpg` (CHNT NCH8-63 63 A — **deliberate wrong-part beat**: Verification rejects it); `completion-correct-part.jpg` (TeSys-D-style 9 A contactor, "Prom Power" brand, 3D render, no part number visible, CC BY-SA 4.0). Verification rule: part number comes from technician notes + Fiix WO; photo must show a new 3-pole TeSys-D-type contactor and must **not** show a contradicting label.
- [ ] Slack + Google: connected through Agent37 app connections at 0:00 — you only need the Slack workspace and Google account to sign in with
- [x] OpenAI credit confirmed by user
- [ ] Event rules: is preparing code/docs before the start allowed? Submission format (repo public? video? deadline?)
- [ ] Demo photos: CV-104 operator photo (tripped contactor/alarm), completion photo

**Claude — local files only, no cloud (say go)**
- [ ] `docs/CONTRACTS.md` draft, `docs/STATUS.md`, `docs/HANDOFF.md`, `docs/DEMO_SCRIPT.md`
- [ ] `.env.example`, `scripts/check-apis` (read-only, PASS/FAIL per service)
- [ ] 11 role-skill drafts + Fiix/Odoo/Monid skill drafts, seed data files, kickoff prompts (lead / worker / verifier)

**After the event**
- [ ] Rotate OpenAI, Agent37, Supabase keys and the Fiix/RS password (all pasted in chat)

## 8. Build sessions and their workers

Max 4 sessions side by side, ≤6 workers each (playbook §6). Each session: own git worktree + branch, own port, reserved migrations. Merges only through the lead, one at a time, typecheck + tests after each.

### Session L — Lead (main checkout, branch `main`, port 3000)
Owns: `docs/`, `lib/contracts/`, shared UI slots, merges, deploys. Writes no product code.
| Worker | Job |
|---|---|
| L1 Spike runner | Phase 0.5: eight Agent37 proofs (turn with skill, OpenAI as model, Monid in instance, Odoo via app connection, streaming, cron, Fiix browser login + read CV-104, RS LC1D09BD page) + latency |
| L2 Verifier | Runs every gate N× with evidence; never writes product code |
| L3 Eval | Coordinator 5-case eval, triage 10-phrasing eval |

### Session A — Core engine (branch `s/core`, port 3001)
| Worker | Owns | Builds |
|---|---|---|
| A1 Data | `supabase/` | Schema, migrations 001–009, seed (plant, assets, technicians, parts), Realtime |
| A2 Agent37 client | `lib/agent37/` | Responses + streaming + sessions + files client; mirror stream → `agent_events` |
| A3 Intelligence | `lib/ai/` | OpenAI gateway (`chat`, `chatJSON`, vision), schemas, retry-once, coordinator |
| A4 Orchestrator | `lib/engine/` | State machine, parallel fan-out/fan-in, approval endpoint, post-step hooks |

### Session B — Experience (branch `s/ui`, port 3002)
| Worker | Owns | Builds |
|---|---|---|
| B1 Dashboard | `app/(dashboard)/` | Incident list, incident detail, plan card, Approve/Modify/Reject, technician "done" |
| B2 Agent graph + feed | `app/components/graph/` | Animated agent graph + live execution feed from Supabase Realtime, sponsor badge per event |
| B3 Plant panels | `app/components/plant/` | Workspace files, agent memory, connected systems, cost per incident, agent health, scheduled follow-ups, plant switcher |

### Session C — Integrations as Agent37 skills (branch `s/tools`, port 3003)
| Worker | Owns | Builds |
|---|---|---|
| C1 Fiix + Odoo | `agent/skills/fiix*`, `agent/skills/odoo*`, `seed/` | Fiix browser skills (login, read CV-104 history, create/assign/close WO); Odoo skills (inventory, work-centre block/unblock); seed both |
| C2 Google + Slack | `agent/skills/google*`, `agent/skills/slack*` | Sheets schedule, Calendar booking, Gmail notices, Slack intake/approval/acks (messaging channel) |
| C3 Monid | `agent/skills/monid*` | Monid on instance: discover → supplier search, AgentMail, Saperly call; browser confirm of RS page |
| C4 Role skills | `agent/skills/roles/` | 11 role skills (triage … verification) with strict output formats |

### Session D — Platform depth (wave, starts after slice gate; branch `s/platform`, port 3004)
| Worker | Owns | Builds |
|---|---|---|
| D1 Agent37 depth | `lib/agent37/provision/`, `agent/image/` | `plantapi-agent` custom image, "Add plant" (create instance), crons, budgets/usage, backups checkpoint, logs/metrics, webhook intake |
| D2 InstaCloud governance | `lib/infra/`, `app/(admin)/governance/` | Ops agent via `insta --agent`, policy `branch_specific` + protected `main`, approval ids, analysis branch env, audit panel |
| D3 InstaCloud platform | `infra/`, `scripts/deploy*` | Deploy, secrets, evidence storage bucket, health check |

Shared quotas (in `docs/STATUS.md`): Agent37 = 1 plant instance until D1 "Add plant"; Monid ≤ $3 of runs before demo; OpenAI shared key.

## 9. Phases, timeline, gates (relative to start; scale to event length)

| Time | Phase | Sessions | Gate (evidence) |
|---|---|---|---|
| 0:00–0:20 | 0 Day-0 | L + human | `check-apis` all PASS; Supabase project created; Slack/Google sign-ins approved; Odoo connected |
| 0:20–0:40 | 0.5 Spike | L (L1) | Eight Agent37 proofs (L1) + latency; Hermes vs OpenAI-Agents-SDK fallback decided; Fiix browser vs Odoo Maintenance fallback decided |
| 0:40–1:00 | 1 Contracts | L | `CONTRACTS.md`, stubs, ownership; typecheck green; CI + secret scan green |
| 1:00–2:15 | 2 Slice | A, B, C | Slack report → Triage → Materials (Monid) → Coordinator plan → Approve → Fiix WO → Verification → CLOSED, on deployed URL |
| 2:15–3:30 | 3 Wave A | A, B, C | All 11 agents, parallel planning + execution, disagreement, Calendar/Sheets/Gmail/Slack, graph; golden path ×3 |
| 2:15–3:30 | 4 Wave B | D | Each Agent37 depth feature + InstaCloud governance has a screenshot |
| 3:30–4:00 | 5 Ship | L (L2) | README (sponsors, honest status, diagram), demo 3× without terminal, backup video, history secret scan |

## 10. Demo (≈90 s)

0–10 Sarah's supervisor posts photo + alarm in Slack → 10–30 graph lights up, four planners in parallel → 30–45 Monid sources part, Agent37 browser confirms, agents disagree, coordinator decides → 45–55 plan, **Approve** → 55–75 WO, booking, block, notices, checkpoint, Monid call → 75–85 Sarah "done" + photo → 85–90 CLOSED, cost per incident. Then 15 s governance: ALLOW / APPROVE / DENY.
Closing line: *One failure. Eleven agents. One Agent37 plant team. Five sponsors. One approval. Closed.*
