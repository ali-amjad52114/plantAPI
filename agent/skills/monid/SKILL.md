---
name: monid-supplier-search
description: Find external suppliers (price, lead time, product URL) for a spare part via Monid, preferring RS Components / RS Online. Used by the Materials agent when internal stock is 0.
---

# Monid supplier search (PlantAPI Materials agent)

Search/email/calls to the outside world go **only** through Monid. Real results only: never type a supplier or price yourself. Never buy, add to cart, or check out.

## Setup (run first, every turn)
The Monid CLI is installed on the plant instance at `~/.npm-global/bin/monid` and is already authenticated — it is NOT missing. It is not on the default PATH, so always start with:
```bash
export PATH="$HOME/.npm-global/bin:$PATH"; export NO_COLOR=1
monid whoami   # must say Authenticated; if not, report BLOCKED with the exact output
```
If `monid` still is not found, call it by absolute path: `~/.npm-global/bin/monid`. Never conclude "Monid is not installed" without trying that path.

## Budget
- `monid discover` and `monid inspect` are free.
- One search = `litescrape /google/shopping`, $0.00015/call. Max 1 search per run, retry a failed call at most 2 times.
- Set `NO_COLOR=1` (and `MSYS_NO_PATHCONV=1` on Git Bash, or endpoint paths get mangled).

## Steps
1. Discover (free): `monid discover -q "google shopping product search" -l 5`
   Expect `litescrape /google/shopping` (stable, ~4 s). If it is missing or in outage, take the best verified Google Shopping endpoint from the list and `monid inspect` it before running.
2. Inspect (free, first time only): `monid inspect -p litescrape -e /google/shopping` — input is query params only (`q`, `num`, `gl`, `hl`).
3. Search (paid, one call), RS-targeted query first:
   ```bash
   monid run -p litescrape -e /google/shopping \
     --query '{"q":"<PART> RS Components","num":20,"gl":"us","hl":"en"}' -w 90 -o monid-<PART>.json
   ```
   For LC1D09BD use exactly `"q":"LC1D09BD RS Components"` (proven 2026-10-07 to return RS - America). Do not run a second search; if no RS row, use the best other matching row.
   Then read the result: `cat monid-<PART>.json` (the rows are in `shopping_results[]`).
4. Map `shopping_results[]` to SupplierOption. Keep only rows whose title contains the part number (ignore `-`/spaces/case), that have `extracted_price`, and no `second_hand_condition`:
   - `supplier` = `source` · `part` = the part · `price` = `extracted_price` · `currency` = "USD"
   - `stock` = null (Google Shopping has no stock count; the browser step reads it on the product page)
   - `lead_time` = `delivery` or "unknown" · `url` = `product_link` or null · `source` = "monid"
5. Order: RS rows first (source matches `RS`, `RS Components`, `RS Online`, `RS - America`), then rows with a URL, then lowest price. `recommended_index` = 0.
6. Report `monid_tool: "litescrape /google/shopping"` in MaterialsOutput and log the run cost.

## Output (exactly this JSON, inside MaterialsOutput.suppliers)
```json
[{"supplier":"RS - America","part":"LC1D09BD","price":152.64,"currency":"USD","stock":null,"lead_time":"unknown","url":"https://www.google.com/search?ibp=oshop&...","source":"monid"}]
```
(Example values are from the real 2026-10-07 run; always use the values from your own run.)

## Errors
- `BLOCKED`: workspace budget/run cap — stop and report the `controls` entry; do not retry.
- `FAILED` / non-200: re-inspect, retry at most 2 times, then report the exact error.
- No matching rows: return the error "no priced listing matching <PART>"; do not invent a supplier.

Code equivalent: `lib/tools/monid.ts` → `searchSuppliers(part)`; smoke test `scripts/smoke-monid.ts`.

## AgentMail (procurement email)

Status: **PROVEN 2026-10-07.** Inbox `rs-supplier-demo@agentmail.to` (display name "RS Supplier Demo") created once ($1). One RFQ sent to itself and read back: message_id `<010001a11873fd6f-75072f43-6673-4db0-b9c8-7cda96feae77-000000@email.amazonses.com>`, labels `["sent","received","unread"]`. Do NOT create more inboxes; the inbox already exists.

Recipient rule: send ONLY to the demo supplier inbox we own (`rs-supplier-demo@agentmail.to`). Never email real RS or any personal address.

On the Agent37 instance first: `export PATH="$HOME/.npm-global/bin:$PATH" NO_COLOR=1` (monid lives at `~/.npm-global/bin/monid`).

| Step | Command | Cost |
|---|---|---|
| Discover | `monid discover -q "agentmail inbox"` | free |
| List inboxes | `monid run -p agentmail -e /list-inboxes -w 60 -j` | $0 |
| Create inbox (DONE, never rerun) | `monid run -p agentmail -e /create-inboxes -i '{"username":"rs-supplier-demo","displayName":"RS Supplier Demo"}' -w 60 -j` | $1 |
| Send RFQ | `monid run -p agentmail -e /send-messages -i '{"inboxId":"rs-supplier-demo@agentmail.to","to":"rs-supplier-demo@agentmail.to","subject":"PlantAPI RFQ test LC1D09BD","text":"Please quote 1x Schneider LC1D09BD, 24VDC coil. Need by today 17:00."}' -w 60 -j` | $0.001 |
| List messages | `monid run -p agentmail -e /list-messages -i '{"inboxId":"rs-supplier-demo@agentmail.to","limit":10}' -w 60 -j` | $0 |
| Read one | `monid run -p agentmail -e "/messages/{id}" -i '{"inboxId":"rs-supplier-demo@agentmail.to","messageId":"<id>"}' -w 60 -j` | $0 |

Gotchas: `displayName` rejects `(` `)` (HTTP 400 validation_error, not charged). Outputs use snake_case (`inbox_id`, `message_id`); pass `messageId` = the `message_id` from `/list-messages`. A self-sent message carries labels sent+received. Smoke test: `scripts/smoke-agentmail.ts`.

## Saperly phone call (dispatch follow-up)

Status: **live calls BLOCKED** until the lead provides the technician phone number. Schemas verified with free `monid inspect`; no call placed, no number owned (`/list-numbers` = []).

Use only when Dispatch got **no Slack/email ack** from the assigned technician. One call per incident; no retries if unanswered. Call only `$PLANTAPI_TECH_PHONE`, never a number from seed files (`+1-555-...` are fake) or any other source.

Setup on the instance: `export PATH="$HOME/.npm-global/bin:$PATH" NO_COLOR=1; set -a; . ~/plantapi/plant.env; set +a` — needs `PLANTAPI_TECH_PHONE` (E.164, e.g. `+14155550123`) and `SAPERLY_FROM_NUMBER_ID` (the owned caller number id). Never echo other keys.

Tools (provider `saperly`):
| Endpoint | Use | Cost |
|---|---|---|
| `/list-numbers` | find the owned caller number id | $0 |
| `/provision-numbers` | buy the caller number (once, lead approval) | $2 |
| `/place-calls` | place the AI call; the run stays RUNNING while the call is live | **$0.005/s = $0.30/min**, unanswered = $0, opted-out = 403 no charge |
| `/calls/{id}` | status, duration, timestamps | $0 |
| `/calls/{id}/transcript` | turn-by-turn text after the call | $0 |
| `/list-voices` | 376 en voices, for the number persona | $0 |

Place the call (inputs: `fromNumberId` owned number id, `to` E.164, `instructions` per-call script, max 10,000 chars):
```bash
monid run -p saperly -e /place-calls -i "{\"fromNumberId\":\"$SAPERLY_FROM_NUMBER_ID\",\"to\":\"$PLANTAPI_TECH_PHONE\",\"instructions\":\"You are the PlantAPI plant assistant calling an electrical technician. Ask for Sarah Chen. Conveyor CV-104 on Crushing Line 2 is down - contactor KM104, Schneider LC1D09BD, needs replacing. A work order is assigned to Sarah for today 18:00 to 20:00; LOTO required (SOP-ELEC-014); the part arrives by 17:00. She has not acknowledged the Slack notice. Ask: can you confirm you will do the CV-104 repair at 18:00 today? Get a clear yes or no; if no, ask the earliest time. Repeat back her answer, thank her, end the call. Keep it under 90 seconds.\"}"
```
Do not use `-w` (calls run ~70 s typical, ~4 min tail). The output has the run id; poll `monid runs get -r <runId> -j` every 10 s until `COMPLETED`/`FAILED`; the call `id` is in the run output (`output.id`). A 2-minute call costs about $0.60.

Read the result:
```bash
monid run -p saperly -e "/calls/{id}" -i "{\"numberId\":\"$SAPERLY_FROM_NUMBER_ID\",\"callId\":\"<call id>\"}" -w 60 -j            # status, duration
monid run -p saperly -e "/calls/{id}/transcript" -i "{\"numberId\":\"$SAPERLY_FROM_NUMBER_ID\",\"callId\":\"<call id>\"}" -w 60 -j # transcript
```
Ack = transcript contains a clear "yes" to the 18:00 window → log `{"call_id","duration_s","ack":true,"quote":"<her words>"}` as a Dispatch event (system `monid`). No answer / no / unclear → `ack:false` and escalate to the supervisor in Slack; do not call again. Transcripts are only available while the caller number is owned.

Dry run (free, prints the exact request): `npx tsx --env-file=.env --env-file=.env.local scripts/smoke-saperly.ts`. `--live` exits BLOCKED until enabled.
