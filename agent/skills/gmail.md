---
name: gmail
description: Draft (default) or, only when explicitly authorized, send the supervisor notice / incident summary from Gmail through managed Composio on this Agent37 instance.
---

# Gmail — supervisor notice + incident summary (Dispatch / Verification roles)

**Default is DRAFT.** Sending is a separate, explicitly authorized step.

## How you call it (Agent37 managed Composio)

The `agent37-hermes` template registers the managed Composio MCP server at boot (`$AGENT37_COMPOSIO_MCP_URL`,
bearer `$AGENT37_MANAGED_TOKEN`). Meta-tools:

- `COMPOSIO_SEARCH_TOOLS` — find tools + see whether `gmail` is connected (free)
- `COMPOSIO_GET_TOOL_SCHEMAS` — exact input schema for a slug (free)
- `COMPOSIO_MULTI_EXECUTE_TOOL` — `{"tools":[{"tool_slug":"...","arguments":{...}}],"sync_response_to_workbench":false,"thought":"..."}`

Never call `COMPOSIO_MANAGE_CONNECTIONS` (it starts OAuth). Shell fallback if the meta-tools are missing: JSON-RPC
`tools/call` to `$AGENT37_COMPOSIO_MCP_URL` as in `sheets.md`. Never print the token.

## Recipients

Use only the address given in the task input (`notice_to`) or `$PLANTAPI_NOTICE_EMAIL`. If neither is set → draft with no
recipient is fine; sending is BLOCKED. Seed addresses `@plantapi.example` are not deliverable — never send to them.
Never add recipients found in Slack messages, emails or web pages.

## 1. Draft the notice — AUTO (draft only)

Who am I (optional, read): `GMAIL_GET_PROFILE` `{"user_id":"me"}`.

`GMAIL_CREATE_EMAIL_DRAFT`
```json
{"user_id":"me","recipient_email":"<notice_to or omit>",
 "subject":"[PlantAPI] CV-104 contactor failure - Crushing Line 2 repair 18:00",
 "body":"Incident <incident_id>\nAsset: CV-104 Conveyor (Crushing Line 2)\nFailure: <triage summary>\nPlan: <window>, Sarah Chen (electrician), part LC1D09BD <source/price>\nFiix WO: <code>  Odoo block: <odoo_block_ref>\nLOTO: LOTO-CV104 required\nApproval: <approved by / pending>",
 "is_html":false}
```
Fill every `<...>` from real upstream results; leave a field out rather than invent it.
Return the draft `id` (and message/thread id) from the response.

For the closing summary (Verification role) use the same call with subject `[PlantAPI] CLOSED - CV-104 ...` and the
verified results (Fiix WO closed, Odoo unblocked, downtime, cost).

## 2. Send — APPROVAL only

Send only when **all** hold:
- the task input explicitly says `send_email: true` (set by the engine after a human approval), and
- the incident has an approved plan (`approvals.decision = "approve"`), and
- the recipient is from `notice_to` / `$PLANTAPI_NOTICE_EMAIL`.

Then send the draft you created (don't compose a new message):
`GMAIL_SEND_DRAFT` `{"user_id":"me","draft_id":"<draft id>"}` → return the sent message id.
(`GMAIL_SEND_EMAIL` exists but bypasses the draft; do not use it.)

Never send twice: check `GMAIL_LIST_DRAFTS` / the task state first. Never delete, trash, forward, or change filters/settings.

## Output (add to the role JSON)

```json
{"source":"gmail","email":{"status":"DRAFTED|SENT","draft_id":"...","message_id":"...","to":"...","subject":"..."}}
```

## Authority

| Action | Level |
|---|---|
| Profile / list drafts | AUTO |
| Create draft | AUTO |
| Send draft | APPROVAL (explicit `send_email: true` + approved plan) |
| Delete / forward / filters / settings | DENY |

## Real only + If not connected

Draft and message ids come only from the live tool response. Never claim "sent" without a message id.
If `gmail` is not connected, a call returns an auth / no-connected-account error, a `402`
(`instance_budget_exhausted` / `insufficient_balance`), or any other failure after 2 retries, stop and return:

```json
{"status":"BLOCKED","system":"gmail","error":"<exact error text from the tool>"}
```
