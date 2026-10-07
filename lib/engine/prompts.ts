// Builds the task text for each role's Agent37 turn. The reply must end with the role's JSON.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ROLE_OUTPUT, type Incident, type Slice1Role } from "../contracts/types";

const ROLE_BRIEF: Record<Slice1Role, string> = {
  triage:
    "You are the Triage agent of a plant maintenance team. Identify the failed asset, failure category, suspected component and part, severity and the trade needed. Plant assets: CV-104 Conveyor, MTR-104 motor, MCC-03 motor control centre (all Crushing Line 2), P-302 pump, FV-221 valve. Known history: CV-104 has had two contactor failures (LC1D09BD, Schneider TeSys D 9 A). `suspected_part` must be a manufacturer part number (e.g. LC1D09BD), not a description.",
  materials:
    "You are the Materials agent. Check internal stock of the part in Odoo (JSON-2 API, env ODOO_URL / ODOO_API_KEY, model product.product, field qty_available, default_code = the part) and find an external supplier with Monid (CLI `monid`, e.g. a Google Shopping search for the part number; prefer RS Online). Report every supplier you actually found with price, stock, lead time and URL.",
  coordinator:
    "You are the Coordinator. Merge the triage and materials findings into ONE repair plan. Technician: Sarah Chen (electrician, free today 18:00). Lowest-impact window today: 18:00–20:00 on Crushing Line 2. LOTO is required on CV-104. Tag every action AUTO or APPROVAL (purchase, block production, schedule outage, safety-critical need APPROVAL).",
  erp:
    "You are the ERP agent. The plan was approved. (1) In Fiix (browser; login with env FIIX_URL / FIIX_USERNAME / FIIX_PASSWORD) create a work order on asset CV-104 for the repair and assign it to Sarah Chen. (2) In Odoo (JSON-2 API) block work centre 'Crushing Line 2' for the repair window. Take a screenshot of the Fiix work order. Report the real WO code and Odoo record id.",
  verification:
    "You are the Verification agent. The technician reported the repair done. Check the completion evidence: the part number must come from the technician notes and the Fiix WO; the photo must show a new 3-pole TeSys-D-type contactor and must NOT show a contradicting label (e.g. a different brand/rating). If it passes: close the Fiix WO and unblock 'Crushing Line 2' in Odoo, then verdict accept. If it fails: change nothing, verdict reject with the reason.",
};

/** Role skill from S2 if it exists locally (uploaded to the instance at ~/plantapi/skills/), else the inline brief. */
export function roleInstructions(role: Slice1Role): string {
  for (const dir of [path.join(process.cwd(), "agent/skills/roles")]) {
    const file = path.join(dir, `${role}.md`);
    if (existsSync(file)) return readFileSync(file, "utf8");
  }
  return ROLE_BRIEF[role];
}

export function outputSchemaText(role: Slice1Role): string {
  return JSON.stringify(z.toJSONSchema(ROLE_OUTPUT[role]), null, 2);
}

export function buildTaskText(role: Slice1Role, incident: Incident, extra: Record<string, unknown> = {}): string {
  const context = {
    incident_id: incident.id,
    alarm_text: incident.alarm_text,
    photo_url: incident.photo_url,
    triage: incident.triage,
    materials: incident.materials,
    plan: incident.plan,
    erp: incident.erp,
    ...extra,
  };
  return [
    "## Setup on this instance",
    "Run `source ~/plantapi/plant.env` before any Odoo/Monid/Fiix command (ODOO_*, MONID_API_KEY, FIIX_* are set there; the `monid` CLI is installed and logged in).",
    "Skill files referenced as `agent/skills/...` live at `~/plantapi/agent/skills/...`; seed/SOP files at `~/plantapi/seed/`. Fiix browser helper: `~/plantapi/fiix-browser.sh`.",
    "Only use values from your own tool runs or from the incident context below — if a tool is unavailable, say so and report BLOCKED rather than filling in seed or example values.",
    "",
    roleInstructions(role),
    "",
    "## Incident context (JSON)",
    JSON.stringify(context, null, 2),
    "",
    "## Output",
    "Do the work with your real tools. Never invent record ids, prices or WO codes — only report what you actually saw.",
    "End your reply with exactly one JSON object matching this JSON Schema (no text after it):",
    outputSchemaText(role),
  ].join("\n");
}
