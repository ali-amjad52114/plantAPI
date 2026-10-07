---
name: fiix
description: Use Fiix CMMS (no API) through the instance browser (agent-browser) to read CV-104 work-order history, create a work order on CV-104, assign it, close it, and take screenshot evidence.
---

# Fiix CMMS via the browser

Fiix has no API for us. You drive it with the `agent-browser` CLI on this instance.
Only touch asset **CV-104 (CV-104 Conveyor)** demo records. Never delete anything.

## Credentials (never type them into chat, never echo them)

They are in `~/plantapi/fiix.env` (`FIIX_URL`, `FIIX_USERNAME_B64`, `FIIX_PASSWORD_B64`).
Always use the helper, which reads that file itself:

```bash
~/plantapi/fiix-browser.sh login                     # prints the URL; ok when *.macmms.com (not auth.fiix.software)
~/plantapi/fiix-browser.sh history                   # ALL CV-104 WOs, one per line: code | description | ... | status | user
~/plantapi/fiix-browser.sh create "<summary>"        # creates WO on CV-104, prints "Work Order Administration: WO <code>"
~/plantapi/fiix-browser.sh users <code>              # Fiix users offered in "Assigned To User"
~/plantapi/fiix-browser.sh assign <code> "<full name>"   # prints assigned_to=<name>
~/plantapi/fiix-browser.sh close <code>              # sets "Closed, Completed"; prints status=..., still_active=no
~/plantapi/fiix-browser.sh shot ~/shots/fiix-wo-<code>.png
```

Assignee: Fiix users today are only **ali amjad** (+ group placeholders). Sarah Chen is NOT a Fiix user, so assign
to "ali amjad" and say in the summary that the job is for Sarah Chen (electrician). Each call ~10-30 s.

If the helper is missing, do the same by hand: `agent-browser open "$FIIX_URL"`, fill Email/Password
from the decoded env values inside a shell command (never in your reply), click "Log In".

## Manual UI map (Fiix legacy UI, verified 2026-10-07)

- Left nav **Maintenance** → Work Orders list (search box "Hit ENTER to start search").
- **New** opens "Work Order Administration: WO <n>"; a mobile-app popup may appear → click "close".
- **Asset** field: click it, type `CV-104`, a lookup opens → click the row "CV-104 Conveyor".
- **Summary of Issue** (General tab) textarea → the failure text.
- **Assigned To User** (General tab, right side): click the arrow right of the field → USERS dialog → click the full-name row → Save (returns to the list).
- **Save** (top bar). Saved when "Create Scheduled Maintenance" becomes enabled. The WO code is the number after "WO".
- **Close**: open the WO, click the arrow right of **Work Order Status** → pick `Closed, Completed` → Save ("Completed By User" auto-fills). A closed WO leaves the "Status group: Active" list; use the status-group filter → "All work orders" to see it.
- Use `agent-browser snapshot -i` to see refs; `agent-browser screenshot <path>` for evidence (save under `~/shots/`).

## Output

End your reply with the ERP JSON (`fiix_wo_code`, `fiix_wo_status`, `screenshot_path`, ...). The WO code must be the one
Fiix shows after Save — never invent one. If a step fails twice, stop and report the exact page text/error.
