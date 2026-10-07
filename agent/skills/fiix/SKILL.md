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
~/plantapi/fiix-browser.sh login                 # prints the URL; ok when it is *.macmms.com / *.fiix.software (not auth.fiix.software)
~/plantapi/fiix-browser.sh history               # CV-104 work-order list text (Code, Description, Asset, Status...)
~/plantapi/fiix-browser.sh create "<summary>"    # creates WO on CV-104, prints "Work Order Administration: WO <code>"
~/plantapi/fiix-browser.sh shot ~/shots/fiix-wo-<code>.png
```

If the helper is missing, do the same by hand: `agent-browser open "$FIIX_URL"`, fill Email/Password
from the decoded env values inside a shell command (never in your reply), click "Log In".

## Manual UI map (Fiix legacy UI, verified 2026-10-07)

- Left nav **Maintenance** → Work Orders list (search box "Hit ENTER to start search").
- **New** opens "Work Order Administration: WO <n>"; a mobile-app popup may appear → click "close".
- **Asset** field: click it, type `CV-104`, a lookup opens → click the row "CV-104 Conveyor".
- **Summary of Issue** (General tab) textarea → the failure text.
- **Assigned To User** (General tab, right side): click, type the technician name, pick the row (assign Sarah if she exists as a user; otherwise leave empty and say so).
- **Save** (top bar). Saved when "Create Scheduled Maintenance" becomes enabled. The WO code is the number after "WO".
- **Close**: open the WO from the list, set **Work Order Status** to `Closed`/`Complete`, on the **Completion** tab fill notes, Save.
- Use `agent-browser snapshot -i` to see refs; `agent-browser screenshot <path>` for evidence (save under `~/shots/`).

## Output

End your reply with the ERP JSON (`fiix_wo_code`, `fiix_wo_status`, `screenshot_path`, ...). The WO code must be the one
Fiix shows after Save — never invent one. If a step fails twice, stop and report the exact page text/error.
