---
name: calendar
description: Read technician availability and (only when authorized) book a repair slot in Google Calendar through managed Composio on this Agent37 instance.
---

# Google Calendar — technician availability + booking (Workforce / Dispatch roles)

## How you call it (Agent37 managed Composio)

The `agent37-hermes` template registers the managed Composio MCP server at boot (`$AGENT37_COMPOSIO_MCP_URL`,
bearer `$AGENT37_MANAGED_TOKEN`). Use its meta-tools:

- `COMPOSIO_SEARCH_TOOLS` — find tools + see whether `googlecalendar` is connected (free)
- `COMPOSIO_GET_TOOL_SCHEMAS` — exact input schema for a slug (free)
- `COMPOSIO_MULTI_EXECUTE_TOOL` — `{"tools":[{"tool_slug":"...","arguments":{...}}],"sync_response_to_workbench":false,"thought":"..."}`

Never call `COMPOSIO_MANAGE_CONNECTIONS` (it starts OAuth). Shell fallback if the meta-tools are missing: JSON-RPC
`tools/call` to `$AGENT37_COMPOSIO_MCP_URL` exactly as in `sheets.md`. Never print the token.

## Calendar convention

- Calendar: **`$PLANTAPI_CALENDAR_ID`** = the "PlantAPI Technicians" calendar (NOT `primary`). IDs live in `~/plantapi/plant.env` on the instance — run `set -a; . ~/plantapi/plant.env; set +a` (or `grep PLANTAPI_ ~/plantapi/plant.env`) first; never echo other keys from that file.
  If unset: `GOOGLECALENDAR_LIST_CALENDARS` and take the calendar whose `summary` is `PlantAPI Technicians`. Never read `primary` for technician data.
- Technicians are not Google users. Their events mirror `seed/calendar_events.json` and are titled
  **`<Technician>: <title>`** (e.g. `Sarah Chen: PM rounds - MCC-01/02`). Events titled `<Technician>: Available` are free time.
- Shifts and trades come from `technicians.json` / Supabase `technicians` (Sarah Chen, electrician, 14:00–22:00).
- Time zone: `America/New_York` (UTC-04:00 on 2026-10-07/08). Always send ISO times with the offset.

## 1. Read availability (Workforce role) — AUTO

`GOOGLECALENDAR_EVENTS_LIST`
```json
{"calendarId":"$PLANTAPI_CALENDAR_ID","query":"Sarah Chen","timeMin":"2026-10-07T00:00:00-04:00","timeMax":"2026-10-09T00:00:00-04:00",
 "singleEvents":true,"orderBy":"startTime","timeZone":"America/New_York","maxResults":50}
```
(`timeMin`/`timeMax` = now → +48 h; `query` = the technician needed for the trade.)

Busy = any event for that technician not titled `Available`. A slot is usable when it is inside the shift,
free of busy events and long enough for the job (default 60 min). Prefer explicit `Available` blocks.
Optional cross-check: `GOOGLECALENDAR_FIND_FREE_SLOTS` `{"items":["$PLANTAPI_CALENDAR_ID"],"time_min":"...","time_max":"...","timezone":"America/New_York"}`
(only meaningful for the calendar as a whole, not per technician).

Report the event ids and times you saw; with today's data Sarah is busy 14:00–17:30, available 18:00–20:00, off site tomorrow 07:00–12:00 — but report what the calendar returns, not this line.

## 2. Book the repair (Dispatch role) — APPROVAL only

Only when the incident has an **approved** plan (`incidents.status` APPROVED/EXECUTING and an `approvals` row with
`decision = "approve"`) and the task input says you are the Dispatch role. Otherwise do not create anything; return the proposed booking only.

1. Re-read the slot (step 1) right before booking; if it is no longer free → BLOCKED with the conflicting event.
2. Check for a duplicate: `GOOGLECALENDAR_EVENTS_LIST` with `"query":"PlantAPI <incident_id>"` in the slot window — reuse it if found.
3. `GOOGLECALENDAR_CREATE_EVENT`
```json
{"calendar_id":"$PLANTAPI_CALENDAR_ID","summary":"Sarah Chen: PlantAPI repair CV-104 contactor (LC1D09BD)",
 "start_datetime":"2026-10-07T18:00:00-04:00","end_datetime":"2026-10-07T19:00:00-04:00","timezone":"America/New_York",
 "description":"PlantAPI <incident_id> | Fiix WO <code> | LOTO-CV104 required | approved by <by>",
 "send_updates":"none","create_meeting_room":false,"transparency":"opaque"}
```
   Invites go **only** to `$PLANTAPI_NOTICE_EMAIL` — the connected Google account's own address (read it at runtime with
   `GMAIL_GET_PROFILE` `{"user_id":"me"}` → `emailAddress` if the env var is missing). Add it as the single attendee:
   `"attendees":["<that address>"]`. Sarah Chen / the supervisor are named in `summary`/`description` only — no other attendees, ever.
4. Return the event `id` and `htmlLink` from the response — never invent them.

Never delete, move or edit other events. Max 2 retries per call.

## Output (add to the role JSON)

```json
{"source":"googlecalendar","technician":"Sarah Chen","free_slots":[{"start":"...","end":"...","evidence_event_id":"..."}],
 "busy":[{"start":"...","end":"...","title":"..."}],
 "booking":{"status":"PROPOSED|BOOKED","event_id":"...","html_link":"...","start":"...","end":"..."}}
```

## Authority

| Action | Level |
|---|---|
| List events / free slots | AUTO |
| Create the booking event | APPROVAL (approved plan + Dispatch role) |
| Edit/delete any event | DENY |

## Real only + If not connected

All times and ids come from the live calendar call. Never fall back to `seed/calendar_events.json`.
If `googlecalendar` is not connected, a call returns an auth / no-connected-account error, a `402`
(`instance_budget_exhausted` / `insufficient_balance`), or any other failure after 2 retries, stop and return:

```json
{"status":"BLOCKED","system":"googlecalendar","error":"<exact error text from the tool>"}
```
