# HANDOFF — append-only (newest at bottom)

Format per entry:
## <session/subagent> — <time> · done | partial | blocked
DONE: … (evidence: test counts, URLs, ids, screenshot paths)
NEXT: …
BLOCKER: …
SPEND: Agent37 $… · Monid $… · OpenAI $…

## S4 platform — 14:47 · started
DONE: npm ci in C:\AI\plantapi-platform (s/platform); D1 Agent37 image+live view, D2 InstaCloud governance (dry-run only), D3 Dockerfile+deploy.sh+evidence plan running in parallel. User approved D1: 2 templates + 1 test instance (auto-sleep, $1, delete after).
NEXT: check-in 15:17, subagents stop 15:32, final report + commit by 16:17.
BLOCKER: none yet. Note: S4 messages to S1 are held (permission-mode mismatch) — S4 reports here only.
SPEND: Agent37 $0 · Monid $0 · OpenAI $0

## S2 tools (session "S4 availability for S1") — 2026-10-07 · started
DONE: took S2 slice from lead; npm ci OK in C:\AI\plantapi-tools (s/tools); C1 Fiix, C2 Odoo, C3 Monid, C4 Roles subagents running (45 min box).
NEXT: check-in at +30 min here; smoke-{fiix,odoo,monid,roles}.ts + latency table; commit to s/tools.
BLOCKER: none yet. Note: messages from this session to S1 are held (permission-mode mismatch) — reporting via this file.
## S3 UI (session S2-UI) — 14:50 · partial
DONE: branch s/ui. `/` = 3D site view (three.js from esm.sh CDN; open incidents from Supabase mark their asset down; click machine → its incident). `/incidents/[id]` = control room on REAL rows: incident + agent_tasks + agent_events via Supabase Realtime (anon key); upload dialog → POST /api/incidents → redirect; plan card from incident.plan + Approve/Modify/Reject → POST /api/incidents/:id/approve; done form (notes, actual downtime, photo) → POST /api/incidents/:id/complete; verdict banner from incident.verification; evidence block shows Monid tool, supplier URL, Odoo product id, Fiix WO code/status, Odoo block ref, WO screenshot path, Agent37 response id per task. Evidence: `npx tsc --noEmit` green; both routes 200 on :3003; live page reads the real `incidents` table (unknown id → "not found"). Removed app/page.tsx placeholder (lead note said S3 replaces it).
DEV ONLY: `?mock=1` replays a recorded run for UI work; never the default, not linked from the live path. Site view's non-seed machines (crushers, mills, thickeners) are 3D scenery only; status shown comes only from real incidents.
NOT TESTED: full live path upload → CLOSED (needs S1 engine + API routes on this branch's base); Realtime subscription against real inserts.
BLOCKER (lead): package.json `typescript ^7` breaks `next dev/build` ("TypeScript 7.0.2 is not supported by this version of Next.js") — set `typescript` to `^6`. I used `npm i -D typescript@^6 --no-save` locally. Please add `three@^0.170` so the site view stops loading it from esm.sh.
NEXT: run the live path end to end once S1's routes merge; fix the clipped plan headline in narrow widths.
SPEND: Agent37 $0 · Monid $0 · OpenAI $0

## S1 core — 14:55 · done (slice-1 core, committed to s/core: d585ede, a9e1c0e)
DONE: A1 Data — `supabase/migrations/001_core.sql` + `seed.sql` APPLIED to npbcyyudbftyklenxycr via `npx tsx supabase/apply.ts` (10 tables, realtime on incidents/agent_tasks/agent_events, `evidence` bucket public; seed 1 plant/5 assets/3 techs/1 part; re-run idempotent). `lib/db` exports supabaseAdmin/supabaseBrowser/loadEnv.
DONE: A2 Agent37 — `lib/agent37` real runTurn (non-streaming) / exec / uploadFile / readFile on pfd5d7eukw. NOTE turns + files live on the INSTANCE host `https://{id}.agent37.app/v1/responses` and `/v1/files/content?path=` (api.agent37.com/v1/responses = 404); exec is `api.agent37.com/v1/instances/{id}/exec`.
DONE: A3 OpenAI — `lib/ai` chat / chatJSON (strict json_schema from zod, retry once) / parseAgentOutput / vision; real gpt-5.5 vision call OK.
DONE: A4 Engine — `lib/engine` slice-1 state machine (flow.ts), runTask = OpenAI vision pre-check + real Agent37 turn + parseAgentOutput → incident column + events + audit; `worker/index.ts` poll loop (concurrency 3); routes POST /api/incidents, /:id/approve, /:id/complete (photos → evidence bucket).
EVIDENCE: `npx tsx scripts/smoke-core.ts` PASS — incident c535887f-837b-4cd6-869c-1ff0b47aff69 → triage COMPLETE (Agent37 response a2b83833cbfa416d93ca318d550a2109) → PLANNING, triage = CV-104 / electrical / LC1D09BD / high / electrician, 51.5 s; tsc green; vitest 7/7. Leftover queued materials task from the smoke run was cancelled (FAILED "smoke run: not continued").
NEXT/ASKS for lead: (1) tsconfig: TS 7 needs `"types": ["node"]` — I added `worker/node-types.d.ts` as a workaround; (2) vitest has no `@/` alias (no vitest.config) — tested files use relative imports; (3) UI needs NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in env; (4) Agent37 instance needs Fiix/Odoo/Monid env + S2 skills at ~/plantapi/skills/ for materials/erp/verification turns (engine prompts read `agent/skills/roles/<role>.md` if present, else inline brief); (5) assets.fiix_code / odoo ids null in seed; (6) Agent37 `usage.cost_usd` returned 0 — cost per incident needs another source.
NOT DONE: streaming SSE events (one start + one end event per turn only); materials→verification not yet run live (needs S2 skills + instance env).
SPEND: Agent37 ~$0 reported (4 small turns) · Monid $0 · OpenAI ≈ $0.10

## S2 tools — 2026-10-07 14:58 · done (slice), partial on Fiix close/assign
DONE (branch s/tools, last commit c07fdbc; main already merged in):
- C4 roles: agent/skills/roles/{triage,materials,coordinator,erp,verification}.md, each ends in one ROLE_OUTPUT json (examples labelled illustrative). scripts/smoke-roles.ts PASS: zod 5/5; OpenAI vision on verification.md → wrong-part.jpg REJECT (label CHNT NCH8-63 63A), correct-part.jpg ACCEPT.
- C2 Odoo (real JSON-2 API): lib/tools/odoo.ts (OdooReader + block/unblock, writes guarded to Crushing Line 2), agent/skills/odoo/SKILL.md, scripts/smoke-odoo.ts PASS: product.product:1 qty=0; block = mrp.workcenter.productivity:2 (loss "Equipment Failure" id 2) on mrp.workcenter:1; unblock = write date_end. Line left working_state=normal.
- C3 Monid (real): lib/tools/monid.ts searchSuppliers → SupplierOption[], tool litescrape /google/shopping; smoke-monid.ts PASS: RS - America $152.64 (from real response, fixture saved for free reruns, --live for new search).
- C1 Fiix (real, Agent37 pfd5d7eukw browser): agent/skills/fiix/SKILL.md, scripts/lib/fiix-browser.sh, scripts/smoke-fiix.ts PASS: created WO 4 on CV-104 (Open), screenshot /home/node/shots/fiix-wo-4-1791410219543.png; earlier WO 3 also Open. ~40 s end to end (create step 19 s).
NEXT / TODO:
- Fiix: close WO (steps in SKILL.md, untested); assign to technician (check user exists); history reads only "Active" group. WO 3 and 4 still open in Fiix.
- Fiix smoke uses Agent37 exec API + agent-browser directly, not a model turn; role skills tested via OpenAI directly, NOT yet as Agent37 turns on pfd5d7eukw (S1 engine path).
BLOCKER / for lead:
- tsc --noEmit: "Cannot find name 'process'" in 13 places incl. lib/contracts — tsconfig/types config (lead-owned); no other errors in S2 files.
- Monid real RS price $152.64 ≠ seed/SOP $29.49 → update demo line or confirm on RS page via browser; Monid gives no stock/lead_time and a Google Shopping URL (browser must click through).
- correct-part photo is PROM POWER LC1-D09 style, not Schneider — verification accepts on form factor/terminal markings; neither photo shows wiring.
- No Agent37 env/secrets endpoint (/env, /secrets 404): Fiix creds written to ~/plantapi/fiix.env (base64, chmod 600) via exec; request body carries them base64.
SPEND: Agent37 ~$0 (exec only) · Monid $0.0003 · OpenAI ~$0.10
