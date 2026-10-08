# Agent37 in PlantAPI: how the whole team runs on it

PlantAPI's 11 maintenance agents all run on **one Agent37 instance, the "plant" (`pfd5d7eukw`, template `agent37-hermes`)**. Every agent step is a real Agent37 turn on that instance, and so is every browser session in Fiix, every Google Sheets/Calendar/Gmail/Slack call, every Monid search and every follow-up check. Our own backend is only the **referee**: it keeps the incident state in Supabase, starts the next turn, asks a human for the one approval, and re-checks what the agents claim against the real systems.

This page describes exactly how we use Agent37: which endpoints, what they return, how a turn is built and checked, and what we learned. Everything here was run for real during the hackathon. The IDs below are real records.

- [Architecture](#architecture)
- [The two Agent37 hosts](#the-two-agent37-hosts)
- [Every Agent37 feature we use](#every-agent37-feature-we-use)
- [Life of one agent turn](#life-of-one-agent-turn)
- [The plant instance: skills, seed data, environment](#the-plant-instance-skills-seed-data-environment)
- [The 11-agent incident on Agent37](#the-11-agent-incident-on-agent37)
- [Agent37 depth: checkpoints, crons, cost](#agent37-depth-checkpoints-crons-cost)
- [Real numbers](#real-numbers)
- [API notes and quirks we hit](#api-notes-and-quirks-we-hit)
- [Check it yourself](#check-it-yourself)
- [Limits](#limits)

---

## Architecture

```
 Operator / Supervisor (browser)
        │  upload photo · Approve · "done" photo
        ▼
 Next.js app + API routes (InstaCloud)  ──────►  Supabase (state machine, Realtime feed, approvals, audit, evidence photos)
                                                   ▲            │
                                                   │ events     │ agent_tasks (QUEUED)
                                                   │            ▼
                                     Engine worker (worker/index.ts, lib/engine/)
                                       │ claims a task, builds the turn, checks the result
          ┌────────────────────────────┼──────────────────────────────────────────────┐
          ▼ control plane              ▼ instance gateway                            ▼ instance gateway
  api.agent37.com/v1            pfd5d7eukw.agent37.app/v1                      (inside the turn)
  exec · usage · budget ·       responses (agent turns) ·                      Agent37 browser → Fiix CMMS
  backups · crons · templates · sessions · files                               Composio → Sheets, Calendar, Gmail, Slack
  instances · signed-url                                                       shell → Odoo JSON-2 API, Monid CLI
```

The worker never calls Fiix, Google, Slack or Monid itself. Those calls all happen **inside Agent37 turns** on the plant instance. The backend calls Odoo only to *re-check* an agent's claim (see [referee checks](#4-check-the-result-real-only)).

## The two Agent37 hosts

Agent37 has two hosts, and an endpoint only works on one of them. This cost us a 404 on day one.

| Host | Base URL | What lives there |
|---|---|---|
| **Control plane** | `https://api.agent37.com/v1` | `instances/{id}/exec`, `instances/{id}/usage`, `instances/{id}/budget`, `instances/{id}/backups`, `instances/{id}/crons…`, `instances/{id}/metrics`, `instances/{id}/signed-url`, `instances`, `templates`, `template-builds` |
| **Instance gateway** | `https://{instanceId}.agent37.app/v1` | `responses` (agent turns), `sessions/{id}`, `files/content?path=` |

Both use `Authorization: Bearer $AGENT37_API_KEY`. `POST https://api.agent37.com/v1/responses` returns **404**; turns go to the instance gateway.

## Every Agent37 feature we use

| # | Feature | Endpoint (verified) | What PlantAPI does with it | Code |
|---|---|---|---|---|
| 1 | **Agent turns** | `POST {inst}/v1/responses` `{input, session_id?, reasoning_effort?}` → `{id, session_id, status, output_text, usage:{input_tokens, output_tokens, cost_usd}}` | Every step of all 11 agents is one turn on the plant. There is also one retry turn when the reply has no valid JSON. | `lib/agent37/index.ts` (`runTurn`), `lib/engine/index.ts` |
| 2 | **Sessions (memory)** | `session_id` on the turn; `GET {inst}/v1/sessions/{id}` → `{id, agent, history:[{role, content, created_at}]}` | The session id per role is stored on the incident (`agent37_session_ids`). The JSON retry reuses the same session, so the agent answers from the work it already did. We read a cron firing's answer from its session history. | `lib/engine/index.ts`, `lib/agent37/crons.ts` (`getSession`, `lastAssistantText`) |
| 3 | **Skills on the instance** | Files API | 11 role skills plus the Fiix, Odoo, Monid, Calendar, Sheets, Gmail and Slack skills, at `~/plantapi/agent/skills/` | `agent/skills/`, `lib/agent37/sync-instance.ts` |
| 4 | **Files** | `PUT {inst}/v1/files/content?path=` (raw body), `GET …/files/content?path=` (raw bytes; 404 `file_not_found`) | Upload skills, seed files, `plant.env` and the Monid login; download browser screenshots as evidence | `lib/agent37/index.ts` (`uploadFile`, `readFile`) |
| 5 | **Exec** | `POST api/v1/instances/{id}/exec` `{command}` → `{exit_code, stdout, stderr, truncated}` | `mkdir`, file permissions, installing the Monid CLI, backend-side screenshots. A call wakes a sleeping instance. | `lib/agent37/index.ts` (`exec`), `sync-instance.ts` |
| 6 | **Built-in browser** | inside the turn | **Fiix has no API on our plan.** The ERP, Reliability and Verification agents log in to Fiix and create, assign, read and close work orders in the Agent37 browser. | `agent/skills/fiix/SKILL.md`, `scripts/smoke-fiix.ts` |
| 7 | **Managed app connections (Composio)** | inside the turn | Google Sheets (production schedule), Google Calendar (technician availability and booking), Gmail (notices), Slack (notices, ack check, reminder). We set up no OAuth app of our own. | `agent/skills/{sheets,calendar,gmail,slack}.md` |
| 8 | **Platform crons** | `POST api/v1/instances/{id}/crons` `{name, prompt, schedule, timezone}` → `{id, next_run, …}`; `POST …/crons/{cid}/run`; `GET …/crons/{cid}/runs` → `[{id, status, session_id, …}]`; `DELETE …/crons/{cid}` | A one-shot "did the technician acknowledge in Slack?" check fires 10 min after Dispatch, even if the instance is asleep. No ack means one Slack reminder plus one Gmail notice. | `lib/agent37/crons.ts`, `lib/engine/depth.ts` |
| 9 | **Backups (checkpoints)** | `POST api/v1/instances/{id}/backups` (blocks until done, at most 1 per 15 min), `GET …/backups` | One checkpoint of the whole plant **after approval, before any real system is touched**. The parallel executors all wait for the same checkpoint. | `lib/agent37/provision/backup.ts`, `lib/engine/depth.ts` (`ensureCheckpoint`) |
| 10 | **Usage** | `GET api/v1/instances/{id}/usage` → `{period, total_micros, by_integration:{llm, composio, brave, …}}` (live) | Cost per incident (see [cost](#cost-per-incident)), plus the spend by integration on the `/plant` page | `lib/engine/cost.ts` |
| 11 | **Budgets** | `GET/PUT api/v1/instances/{id}/budget` → `{monthly_cap_micros, monthly_consumed_micros, monthly_remaining_micros, …}` | Spend cap per plant: $3 per month on the demo plant, $1 on test plants | `lib/agent37/provision/budget.ts` |
| 12 | **Custom templates** | `/v1/templates`, `/v1/template-builds/{id}/start`, `…/logs` | `plantapi-agent@1` = the hermes base + the Monid CLI + the skills directory | `agent/image/`, `lib/agent37/provision/build-templates.ts` |
| 13 | **Instances ("Add plant")** | `POST/GET/DELETE api/v1/instances` | A new plant gets its own instance from the template, with skills preloaded, auto-sleep and its own budget | `lib/agent37/provision/add-plant.ts` |
| 14 | **Live view** | `GET api/v1/instances/{id}/signed-url` → noVNC | `hermes-vnc-desktop@1` lets a supervisor watch the agent's browser | `agent/image/hermes-vnc-desktop/`, `templates.ts` |
| 15 | **Metrics and health** | `GET api/v1/instances/{id}/metrics`, `GET {inst}/v1/health` | Shown on the `/plant` page | `app/(dashboard)/plant/` |

S4's endpoint notes for templates, instances and live view are in [`agent/image/AGENT37_API.md`](../agent/image/AGENT37_API.md).

## Life of one agent turn

Every role (Triage … Verification) goes through the same path in `lib/engine/index.ts`:

### 1. Claim
The worker (`worker/index.ts`, up to **4 concurrent turns**) atomically claims a `QUEUED` row in `agent_tasks`: an update guarded by `status = 'QUEUED'`. A unique index (migration 002) allows only one open task per role per incident, so two planners finishing at the same moment can't start the Coordinator twice.

### 2. Build the turn text (`lib/engine/prompts.ts`)
- **Setup block:** `source ~/plantapi/plant.env`, where the skills and SOPs live on the instance, and "only report values from your own tool runs; if a tool is unavailable say BLOCKED."
- **Role instructions:** the role's skill file `agent/skills/roles/<role>.md`, plus **engine overrides** that win over the skill text:
  - Workforce reads only the configured calendar id;
  - Production reads only the configured Sheet;
  - ERP: a future Odoo block shows "normal" until it starts;
  - Verification ends the *same* block record;
  - Dispatch still books a plan that is "conditional on part arrival";
  - Risk requires APPROVAL for conditional plans.
- **The Coordinator** gets an engine brief instead of its skill file. It decides **only** from Triage + Materials + the planners' outputs, never reads seed files, never plans in the past, and needs a window at least as long as the repair estimate.
- **Incident context** as JSON.
- **The output contract:** the role's JSON Schema (generated from the zod schema). The reply must end with exactly that JSON object.

### 3. Run it on Agent37
`POST https://pfd5d7eukw.agent37.app/v1/responses`. Before and after the turn, the engine reads the instance's live usage total for the cost per incident. The feed gets one event when the turn starts and one when it ends.

### 4. Check the result (REAL ONLY)
- **Parse:** take the last JSON object in the reply and validate it with zod. **No second model is ever asked to "repair" the output**, because it could invent a valid-looking result.
- **One retry in the same session:** if the JSON is missing or invalid, the engine sends one more turn in the same Agent37 session: "reply with only the JSON from the work you already did; do not run the tools again; never invent ids". If that is still invalid, the task is **FAILED**. A task is never COMPLETE without valid output from Agent37.
- **Referee checks:**
  - The plan's supplier must be one that Materials actually found.
  - The plan window must not be blank, must not start in the past, and must be at least as long as the repair estimate.
  - ERP must report a real Fiix work order. The backend reads the **real Odoo block record** and checks that it is on Crushing Line 2 and matches the plan window (±5 min, UTC).
  - Verification's "accept" requires that the same Odoo block was really ended and the Fiix work order was closed.
- **Text fix:** cp1252-mangled characters ("18:47â€“19:32") are repaired before anything is stored.

### 5. Advance
The output goes on the incident row, Supabase Realtime pushes it to the control room, and the next tasks are queued.

## The plant instance: skills, seed data, environment

`lib/agent37/sync-instance.ts` runs **every time the worker starts** (about 8–10 s). It can also be run on its own:

| On the instance | From | Purpose |
|---|---|---|
| `~/plantapi/agent/skills/**` | `agent/skills/` | Role skills plus the tool skills (Fiix, Odoo, Monid, Sheets, Calendar, Gmail, Slack) |
| `~/plantapi/seed/**` | `seed/` (no photos) | SOPs (LOTO, contactor), technician roster |
| `~/plantapi/plant.env` (chmod 600, sourced from `.bashrc`/`.profile`) | `.env` + `.env.local` | `ODOO_*`, `MONID_API_KEY`, `FIIX_*`, and **every** `PLANTAPI_*` setting (Sheet id, Calendar id, notice email, Slack channel …) |
| `~/.config/monid/{config,credentials}.yaml` | local Monid login | The `monid` CLI is logged in on the instance |
| `monid` 0.1.7 | `npm i -g @monid-ai/cli` if missing | Supplier search (Materials) and AgentMail (Procurement) |

Only key **names** are logged, never values. Before this ran on every start, merged skill fixes didn't reach the instance (WO 6 stayed unassigned). That's why the worker now always syncs first.

## The 11-agent incident on Agent37

```
upload ─► Triage ─┬─► Reliability ─┐
                  ├─► Materials ───┤   (4 Agent37 turns in parallel; a failed Materials stops the incident,
                  ├─► Production ──┤    the others may fail without stopping the team)
                  └─► Workforce ───┘
                         └─► Coordinator ─► Risk ─► WAITING_APPROVAL ─► [human: Approve]
                                                         │ (stale plans refused: 409 "plan is stale — re-plan")
                                                         ▼
                                     Agent37 backup checkpoint (once per incident)
                                                         ▼
                                     ERP ∥ Procurement ──► (ERP done) ──► Dispatch
                                                         ▼                     └─► Agent37 cron: Slack ack check in 10 min
                                     WAITING_REPAIR ─► [technician: "done" + photo] ─► Verification ─► CLOSED
                                                                                        (wrong part → back to WAITING_REPAIR)
```

| Step | Agent37 features in play |
|---|---|
| Triage | turn + OpenAI vision notes; Fiix asset list in the browser |
| Reliability | turn + **browser** (Fiix work order history) + SOP files on the instance |
| Materials | turn + shell (Odoo JSON-2 stock) + **Monid CLI** on the instance |
| Production | turn + **Composio Google Sheets** (live schedule) |
| Workforce | turn + **Composio Google Calendar** ("PlantAPI Technicians" calendar) |
| Coordinator, Risk | turns; decide from the planners' outputs only |
| Approve | **backup checkpoint** before execution |
| ERP | turn + **browser** (create and assign the Fiix WO) + Odoo block record for the window |
| Procurement | turn + **Monid AgentMail** expedite email (idempotent by subject `[PlantAPI <incident_id>]`), never a purchase |
| Dispatch | turn + **Composio Calendar** booking + **Composio Slack** notice that @-mentions the technician's stand-in; then a **platform cron** |
| Ack check | **cron** fires on the instance, reads Slack through Composio, answers `{ack_received, evidence}` in its session; the worker reads the session and deletes the cron |
| No ack | dispatch follow-up turn: one Slack reminder plus one Gmail notice (no phone calls) |
| Verification | turn + OpenAI vision notes + **browser** (close the Fiix WO) + end the same Odoo block record |
| Cost | **usage** read around every turn; stored on the incident |

## Agent37 depth: checkpoints, crons, cost

### Checkpoint (backup)
After approval, the first execution turn calls `createCheckpoint(instance, "incident-<id>")`. That is a real `POST /v1/instances/{id}/backups`, which blocks about 15–20 s for the ~260 MB instance. ERP, Procurement and Dispatch all wait for this same promise. The result is written to `audit_logs` (`checkpoint.saved`), so a worker restart doesn't take a second one. Agent37 allows one on-demand backup per 15 min; on `rate_limited` the previous manual backup is used, and the feed says so. Feature flag: `PLANTAPI_AGENT37_DEPTH=1`.

### Platform cron for the technician's acknowledgement
- **Schedule:** a cron is recurring, so we make it effectively one-shot with a schedule that fires on one date: `"M H D Mo *"` in UTC (`oneShotSchedule`), and we delete it after it fires.
- **Prompt:** read the Slack channel for the technician's ack after time X; read-only; end with `{"ack_received": bool, "evidence": "…"}`.
- **Answer:** the worker checks every 30 s. After the firing it gets `runs[0].session_id`, reads `GET {inst}/v1/sessions/{sid}` and takes the **last `assistant` entry** of `history`. The prompt itself contains the same JSON keys, so the reply must come from an assistant entry.
- Real check: the cron fired on the instance, read the real Slack channel and answered `{"ack_received":false,"evidence":"…only '<@U0BK7QB7674> has joined the channel'…"}`, and the cron was deleted.

### Cost per incident
- **Per-turn tokens don't work:** `/v1/responses` reports tokens for the gateway exchange only. A full agent turn reported **3 input / 9 output tokens**, because the agent's inner LLM calls aren't counted there.
- **Measuring instead:** the engine reads the instance's live `total_micros` (LLM + compute + Composio + search) when an incident's first turn starts and when its last running turn ends. The difference is that incident's spend. Parallel turns of one incident are counted once. `incidents.cost` = `{agent37_usd, agent37_micros, periods, shared_instance, source}`, plus a feed event "Cost so far: $X on Agent37".
- **Limit:** `shared_instance: true` flags periods when another incident ran on the instance at the same time, so its spend was mixed in.

## Real numbers

| | |
|---|---|
| Plant instance | `pfd5d7eukw`, `agent37-hermes`, 2 vCPU / 4 GB, auto-sleep, $3/month budget |
| Model behind the agents (from usage `by_model`) | `openai/gpt-6-luna` |
| Agent37 usage this month (whole hackathon) | **$0.86** total: LLM $0.84 (1,391 calls, 31.2 M input / 0.53 M output tokens), Composio $0.016 (137 calls), Brave $0.005 |
| Cost of one full 11-agent incident | **$0.08–0.13** (`ed54ca93` $0.129, `604da17b` $0.124, `c462b8fc` $0.079) |
| Real Agent37 agent turns stored as COMPLETE | 65 (plus evals and smoke runs) |
| Coordinator eval | 7 real Agent37 coordinator turns, 9–33 s each, **7/7** picked the earliest feasible window long enough for the repair |
| Checkpoint | backup `0bf72f6cc5ee1c4f538e`, 262 MB, 15.4 s |
| Cron | `6a8f63c4eb01` (ack check after Dispatch), `21b03f637dac` (real ack prompt check) |
| Reminder | Gmail `1a1188cc00050c99`, Slack ts `1791413402.635529` with an @-mention |
| Fiix work orders created by agents in the Agent37 browser | WO 6, 9, 10, 13 (CV-104, assigned to the user as Sarah's stand-in) |
| Odoo block records created by agents | `mrp.workcenter.productivity` 6, 9 (window-bounded) |

## API notes and quirks we hit

| What we saw | What we do |
|---|---|
| `POST api.agent37.com/v1/responses` → 404 | Turns, sessions and files go to `https://{id}.agent37.app/v1` |
| `GET {inst}/v1/files?path=` (listing) → 500 | We only use `files/content` (GET/PUT) |
| `usage` on a turn: 3 / 9 tokens for a real agent turn | Cost from the instance usage total (see above) |
| Instance usage is per instance per month, but **live** | Snapshot it around each incident's turns |
| `exec` has no timeout parameter | Client-side timeout only; long work goes in turns, not exec |
| On-demand backups: 1 per 15 min, the call blocks | One checkpoint per incident, shared by the parallel executors; reuse the previous manual backup on 429 |
| Crons are recurring; no one-shot field | Date-specific schedule in UTC plus delete after firing |
| A cron's answer isn't in the run record | Read `history` of `runs[0].session_id`, last `assistant` entry |
| Agents sometimes end without the JSON, or with invalid JSON | One retry turn in the same session; then FAILED. No model repair. |
| Agent text arrives cp1252-mangled ("â€“") | Our decoding is UTF-8; we repair the text and tell agents to use ASCII hyphens |
| Skill fixes merged in git didn't reach the instance | The worker syncs the instance on every start |
| A worker restart left turns "RUNNING" forever | A reaper marks RUNNING > 10 min (and not in this process) FAILED; drain mode stops claiming before deploys |
| Agents read seed files instead of the live calendar | The Coordinator sees only the planners' outputs; Workforce/Production are pinned to the configured Calendar/Sheet with no seed fallback |
| The technician (Sarah) has no Slack/Fiix account | The user's own accounts stand in: Fiix WO assigned to them, Slack @-mention found by email |

## Check it yourself

All commands run from the repo root with `.env` + `.env.local` filled in. **Each one makes real calls.**

```bash
npx tsx lib/agent37/smoke.ts                      # exec + file round trip + one tiny turn on the plant
npx tsx lib/agent37/sync-instance.ts              # push skills, seed, plant.env, Monid login to the instance
npx tsx scripts/smoke-core.ts                     # one real Triage turn end to end (Supabase + OpenAI + Agent37)
npx tsx lib/engine/eval/coordinator-eval.ts       # 7 real coordinator turns, checks the window logic
npx tsx lib/engine/eval/cron-check.ts             # create a cron, run it now, read its session, delete it
npx tsx lib/engine/eval/ack-cron-check.ts         # the real Slack-ack prompt on a cron (reads Slack only)
npx tsx lib/engine/eval/odoo-block-check.ts <id>  # read-only referee check of an incident's Odoo block
```

`lib/engine/eval/reminder-check.ts <incident>` **sends a real Slack message and email**; add `--slack-only` to skip the email.

## Limits

- **One plant instance.** All incidents share `pfd5d7eukw`, so cost per incident is exact only when one incident runs at a time (`shared_instance` flags the rest). "Add plant" creates more instances, but the demo uses one.
- **No streaming yet.** Turns are non-streaming, so the feed shows each turn's start and end, not every tool call inside it.
- **The RS product page** is behind a bot wall (DataDome/Akamai) for the instance's datacenter IP. We don't try to get around it; the Monid search result is the supplier evidence.
- **Demo people:** Sarah Chen is a demo technician. The user's own Fiix, Slack and email accounts stand in for her.
