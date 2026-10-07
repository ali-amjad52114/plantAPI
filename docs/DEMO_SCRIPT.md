# PlantAPI — 90-second demo script

**URL:** deployed **https://prod-slice-preview-app-868318-00p2nqk9qcz.compute.instacloud-edge.com** · fallback **http://localhost:3000**. Keep both open in tabs.

**Closing line:** *One failure. Eleven agents. One Agent37 plant team. Five sponsors. One approval. Closed.*

## Pre-demo checklist (T-10 min)

| Check | How | Pass |
|---|---|---|
| Demo reset | **The lead runs it:** `npx tsx --env-file=.env --env-file=.env.local scripts/demo-reset.ts`. It refuses with exit 2 if a run is live. | Prints `RESET OK`. Fiix shows 0 open CV-104 work orders. Odoo shows Crushing Line 2 with `blocked=false`. |
| App + worker health | `curl -s <URL>/api/health` | HTTP **200**, `ok: true`, `worker_ok: true`, `worker_age_s` < 60 |
| Monid balance | `monid whoami` (on the instance: `~/.npm-global/bin/monid whoami`) | Authenticated; balance at least $0.10. A run uses about $0.0012: one search plus one AgentMail send. |
| 4 Composio connections | `GET https://api.agent37.com/v1/instances/pfd5d7eukw/integrations/connections` | googlecalendar, googlesheets, gmail and slack all **ACTIVE** |
| Agent37 instance | `/plant` page, or `GET /v1/instances/pfd5d7eukw` | Status running. Budget has room left (cap $3). |
| Live data | Open the "PlantAPI Technicians" calendar | Sarah: busy 14:00–17:30, free 18:00–20:00, arc-flash training tomorrow 07:00–12:00 |
| Site view warm | Open `/` about 1 min before the demo. The 3D plant loads three.js from esm.sh and takes about 3 s on first load. | The plant renders with CV-104 marked down. |
| Files ready | `seed/photos/failure-burned-contactor.jpg`, `completion-wrong-part.jpg`, `completion-correct-part.jpg` on the desktop | — |
| Backup | Backup video and screenshots in `docs/screenshots/` | — |

## Beats

| Time | Do (click) | Say | Fallback |
|---|---|---|---|
| **0–10 s** | On `/`, upload `failure-burned-contactor.jpg` and the alarm text from `seed/alarm.txt`, then submit. The control room opens. | "Conveyor CV-104 just tripped. The operator sends one photo and the alarm. That's all the human input there is." | If the upload fails, open the last CLOSED incident (`ed54ca93`) and narrate from it. |
| **10–20 s** | Watch the agent graph and the live feed. Triage completes. | "Eleven agents on one Agent37 plant instance. Triage reads it as a burned contactor KM104, part LC1D09BD, electrical, high severity." | If Triage takes over 30 s, keep narrating over the feed. Every event has its sponsor badge. |
| **20–40 s** | The four planners light up in parallel. Point at the plan card's **disagreement**. | "Production reads the live Google Sheet and wants tomorrow at 07:00, the lowest-impact slot. Workforce reads the live calendar: Sarah, our only LOTO electrician, has arc-flash training then. **The agents disagree. The coordinator picks today, 18:00, while Sarah is free.** Materials shows zero stock in Odoo, and Monid finds RS at $152.64." | If a planner reports BLOCKED, show its banner and the real error: "Real systems only. When one is down, we say so." Then show screenshot `09-2d9b4671-disagreement-resolution.jpg`. |
| **40–50 s** | On the plan card, point at the AUTO, APPROVAL and DENY tags, then click **Approve**. | "Every action has an authority rule. Buying the part and stopping the line need a human. Jumpering the interlock is denied outright. One click." | — |
| **50–65 s** | ERP, Procurement and Dispatch run in parallel. Show the evidence panel: the Fiix WO number, the Odoo block record, the AgentMail message id, the Slack post in #plant-ops. | "The Agent37 browser opens the work order in Fiix, a CMMS with no API for us. Odoo blocks Crushing Line 2. Monid emails the supplier. Sarah gets the calendar booking and a Slack ping." | If the Fiix browser is slow (create takes about 20 s), show the WO from the evidence panel or screenshot `05-dd94429f-fiix-wo6-odoo-block-verifying.jpg`. If the window is blank, show the "WINDOW NOT SET" banner and its real reason (part lead time unknown). |
| **65–80 s** | Click **Report repair done** and upload `completion-wrong-part.jpg`. Show the **EVIDENCE REJECTED** banner. Then upload `completion-correct-part.jpg`. | "Wrong part: the label reads CHNT NCH8-63, 63 amps. Verification rejects it. Now the right contactor: accepted." | If Verification is slow, show screenshot `06-dd94429f-closed.jpg`. |
| **80–90 s** | Status turns **CLOSED**. Fiix WO is closed, Odoo is released, and the cost per incident shows (about $0.13 Agent37 on `ed54ca93`). | *"One failure. Eleven agents. One Agent37 plant team. Five sponsors. One approval. Closed."* | — |
| **+15 s governance** | Open `/governance`. | "InstaCloud governs the agents too. Creating a branch: ALLOW. Scaling a service: APPROVE, so a human gets asked. Deleting the project: DENY, 403. And when our own AI lead tried to approve its own request, InstaCloud said: *this operation requires a human request, 403*. The human ran it." | Screenshots `11-governance-allow-approve-deny.jpg` and `14-governance-lead-ai-refused.jpg`. |

## If something breaks live

- **Never fake a result.** Show the failure banner and the real error, then switch to the last CLOSED incident (`ed54ca93`) or the backup video.
- **Health is 503:** the worker is down. Switch to `http://localhost:3000`, where the lead runs the worker.
- **Agent37 turn fails:** the engine retries at most 2 times. Show the error event in the feed.
