---
name: sheets
description: Read the Crushing Line 2 production schedule from Google Sheets (managed Composio on this Agent37 instance) to find the lowest-impact downtime window. Read only.
---

# Google Sheets — production schedule (Production role)

Read only. This skill never writes, clears, appends to or creates a spreadsheet.

## How you call it (Agent37 managed Composio)

This instance (`agent37-hermes`) registers the managed Composio MCP server at boot
(`$AGENT37_COMPOSIO_MCP_URL`, bearer `$AGENT37_MANAGED_TOKEN`). You see a few **meta-tools**, not one tool per action:

| Meta-tool | Use |
|---|---|
| `COMPOSIO_SEARCH_TOOLS` | find a tool + see the toolkit's connection status (free) |
| `COMPOSIO_GET_TOOL_SCHEMAS` | exact input schema for a slug (free) — use it if an argument is rejected |
| `COMPOSIO_MULTI_EXECUTE_TOOL` | run tools: `{"tools":[{"tool_slug":"...","arguments":{...}}],"sync_response_to_workbench":false,"thought":"..."}` ($0.000114/call) |

Do **not** call `COMPOSIO_MANAGE_CONNECTIONS` — it starts a new OAuth link. Connections are made by the human, not by you.

Shell fallback (only if the meta-tools are not in your tool list):

```bash
curl -sS "$AGENT37_COMPOSIO_MCP_URL" -H "Authorization: Bearer $AGENT37_MANAGED_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"COMPOSIO_MULTI_EXECUTE_TOOL","arguments":{"tools":[{"tool_slug":"GOOGLESHEETS_VALUES_GET","arguments":{"spreadsheet_id":"<id>","range":"Schedule!A1:K50"}}],"sync_response_to_workbench":false}}}'
```

Never print `$AGENT37_MANAGED_TOKEN`.

## The sheet (mirrors `seed/production_schedule.csv`)

- Spreadsheet title: **PlantAPI Production Schedule**; worksheet **Schedule**. Use `$PLANTAPI_SCHEDULE_SHEET_ID` as `spreadsheet_id`.
  IDs live in `~/plantapi/plant.env` on the instance — run `set -a; . ~/plantapi/plant.env; set +a` (or `grep PLANTAPI_ ~/plantapi/plant.env`) first; never echo other keys from that file.
- Row 1 headers, columns A–K, exactly as the CSV:
  `Date | Line | Asset | Window Start | Window End | Status | Planned Throughput (t/h) | Production Impact If Down | Available Downtime | Maintenance Reserved | Notes`
- Times are plant local time (America/New_York, UTC-04:00 on 2026-10-07/08).

## Steps

1. Find the spreadsheet id (skip if the env var is set):
   `GOOGLESHEETS_SEARCH_SPREADSHEETS` `{"query":"PlantAPI Production Schedule","search_type":"name","max_results":5}`
   → take the exact-title match. Zero or several matches → BLOCKED (say which).
2. Read the rows: `GOOGLESHEETS_VALUES_GET`
   `{"spreadsheet_id":"<id>","range":"Schedule!A1:K50","value_render_option":"FORMATTED_VALUE"}`
3. Keep rows where `Line == "Crushing Line 2"` (asset CV-104) and `Date` is today or tomorrow.
4. Candidate windows = rows with `Available Downtime == "YES"` and `Maintenance Reserved == "NO"`.
   Rank by `Production Impact If Down` (`Lowest` < `None` < `Low` < `Medium` < `High`), then earliest start.
5. Report every candidate with its impact and notes; the lowest-impact window is the Production role's pick.
   (Today's data: today 18:00–20:00 `Low`; tomorrow 07:00–08:00 `Lowest`.) Quote values exactly as read — never from the CSV or this file.

## Output (add to the role JSON)

```json
{"source":"googlesheets","spreadsheet_id":"<id>","range":"Schedule!A1:K50","rows_read":9,
 "windows":[{"date":"2026-10-08","start":"07:00","end":"08:00","impact":"Lowest","notes":"..."}],
 "recommended_window":{"date":"...","start":"...","end":"...","impact":"..."}}
```

## Authority

| Action | Level |
|---|---|
| Search / read the schedule | AUTO |
| Mark a window "Maintenance Reserved" or any edit | not in this skill — APPROVAL, lead must add it |

## Real only

Every row comes from the live sheet in this call. Do not fall back to `seed/production_schedule.csv`, memory or this
file's example values. Max 2 retries per call, then stop.

## If not connected

If `COMPOSIO_SEARCH_TOOLS` shows `googlesheets` without an active connection, or execute returns an auth /
"no connected account" error, a `402` (`instance_budget_exhausted` / `insufficient_balance`) or any other error:
stop and return

```json
{"status":"BLOCKED","system":"googlesheets","error":"<exact error text from the tool>"}
```

Do not guess a window and do not start a connection yourself.
