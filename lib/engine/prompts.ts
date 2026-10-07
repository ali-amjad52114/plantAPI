// Builds the task text for each role's Agent37 turn. The reply must end with the role's JSON.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AgentRole, Incident } from "../contracts/types";
import { schemaFor } from "./wave-a-schemas";

const ROLE_BRIEF: Partial<Record<AgentRole, string>> = {
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
  // wave A (inline until S2 ships agent/skills/roles/<role>.md)
  reliability:
    "You are the Reliability agent. Read CV-104's failure history in Fiix (browser, `agent/skills/fiix/SKILL.md`: closed work orders on the asset) and the SOPs in `~/plantapi/seed/sop/`. Decide whether this failure is recurring, the likely root cause, and how urgent the repair is. List the WO codes and files you actually read in `sources`.",
  procurement:
    "You are the Procurement agent. The plan was approved (see `approval`). For the plan's supplier: record the sourcing decision in Odoo (JSON-2 API, `agent/skills/odoo/SKILL.md`) and send ONE expedite email to the supplier through Monid AgentMail (`agent/skills/monid/SKILL.md`). Never buy, never add to basket, never check out — `purchased` is always false. Anything you could not do for real goes in `blocked` with the reason.",
  dispatch:
    "You are the Dispatch agent. The plan was approved (see `approval`). Book the plan's technician for the plan window (Google Calendar), notify them and the supervisor (Slack / Gmail). Never place phone calls. The engine schedules the Slack-ack check itself. Report every notice with the real id the system returned; a channel that is not connected yet gets status `blocked` with the reason — never invent ids.",
  risk:
    "You are the Risk agent. Classify every action in the coordinator's plan with the authority rules — AUTO: read history/SOP/inventory, supplier search, availability, draft WO; APPROVAL: purchase, block production, schedule outage, safety-critical work; DENY: bypass safety, delete records. Overall `decision` = the strictest rule. CV-104 electrical work requires LOTO.",
};

// Production / Workforce: real Google Sheet / Calendar (Agent37 Composio app connections) when S2 has
// set them up; the seed files are only a bridge and the agent must say so in `source`.
export function productionBrief(): string {
  const sheet = process.env.PLANTAPI_SCHEDULE_SHEET_ID;
  const where = sheet
    ? `Read the production schedule from Google Sheet \`${sheet}\` (your Google Sheets app connection; id also in $PLANTAPI_SCHEDULE_SHEET_ID). Put \`google-sheets:${sheet}\` in \`source\`. Only if the Sheets connection fails, fall back to \`~/plantapi/seed/production_schedule.csv\` and put \`seed file\` plus the error in \`source\`.`
    : "Google Sheets is not connected yet: read `~/plantapi/seed/production_schedule.csv` and put `seed file ~/plantapi/seed/production_schedule.csv (Sheets not connected)` in `source`.";
  return `You are the Production agent. Find the lowest-impact downtime window for the affected work centre today/tomorrow. ${where} Recommend one window and list the alternatives with their impact.`;
}

export function workforceBrief(): string {
  const cal = process.env.PLANTAPI_CALENDAR_ID;
  const where = cal
    ? `Read availability from Google Calendar \`${cal}\` (your Google Calendar app connection; id also in $PLANTAPI_CALENDAR_ID). Put \`google-calendar:${cal}\` in \`source\`. Only if the Calendar connection fails, fall back to \`~/plantapi/seed/calendar_events.json\` and put \`seed file\` plus the error in \`source\`.`
    : "Google Calendar is not connected yet: read `~/plantapi/seed/calendar_events.json` and put `seed file ~/plantapi/seed/calendar_events.json (Calendar not connected)` in `source`.";
  return `You are the Workforce agent. Pick the technician with the required trade (from triage) and LOTO qualification using \`~/plantapi/seed/technicians.json\`. ${where} Report when they are free, any conflicts, and alternatives.`;
}

/** Role skill from S2 if it exists locally (uploaded to the instance at ~/plantapi/skills/), else the inline brief. */
// Coordinator is REAL ONLY: it decides from the planners' outputs, never from seed files. The S2 skill
// (coordinator.md) carries seed facts and examples, so the engine uses this brief instead of it.
export const COORDINATOR_BRIEF = [
  "You are the Coordinator of a plant maintenance team. Merge the planners' findings into ONE repair plan a human approves with one click.",
  "Decide ONLY from the facts in the incident context: `triage`, `materials`, and `team` (the reliability, production and workforce agents' outputs).",
  "- Technician: from `team.workforce` (technician, qualifications, available_from, conflicts).",
  "- Part: `supplier` must be copied exactly from one entry of `materials.suppliers`; its lead time decides when the part is on site.",
  '- Window: the earliest window where the part is on site AND the technician is free AND production allows it (`team.production` recommended/alternatives). If `team.reliability.urgency` is "asap", prefer the earliest such window over the lowest-impact one.',
  "- If the chosen supplier has NO confirmed lead time (missing, \"unknown\", \"not shown\"): never invent one. Choose the EARLIEST window today that satisfies production AND workforce, add \"Conditional on part arrival before window start\" to `safety`, add the action {\"action\": \"Expedite <part> from <supplier>\", \"system\": \"monid\", \"rule\": \"APPROVAL\"}, lower `confidence`, and say in `rationale` that materials gave no confirmed lead time.",
  "- `window_start` and `window_end` are ALWAYS full ISO 8601 timestamps — never blank.",
  "- Window length (window_end - window_start) must be AT LEAST `triage.estimated_repair_minutes`. If no feasible window today is long enough, pick the earliest feasible one that is (even if it is tomorrow) and say in `rationale` why the earlier, shorter windows were rejected.",
  '- Every fact in `rationale` must name which planner it came from (e.g. "workforce (calendar:…): …"). If a planner is unavailable or a fact is missing, say so in `rationale` and lower `confidence` — never fill the gap yourself.',
  "- Tag every action AUTO or APPROVAL: purchase, block production, schedule outage and safety-critical work need APPROVAL; reading/searching/drafting is AUTO. LOTO goes in `safety` for electrical work.",
  "RULES: never read any file under ~/plantapi/seed (or any other file) and never use example or seed values. You do not need tools for this step.",
].join("\n");

export function roleInstructions(role: AgentRole): string {
  if (role === "coordinator") return COORDINATOR_BRIEF;
  for (const dir of [path.join(process.cwd(), "agent/skills/roles")]) {
    const file = path.join(dir, `${role}.md`);
    if (existsSync(file)) return readFileSync(file, "utf8") + roleOverrides(role);
  }
  if (role === "production") return productionBrief();
  if (role === "workforce") return workforceBrief();
  return ROLE_BRIEF[role] ?? `You are the ${role} agent of the plant maintenance team.`;
}

/** Engine-side rules appended to an S2 skill (they win over the skill text). */
export function roleOverrides(role: AgentRole): string {
  const cal = process.env.PLANTAPI_CALENDAR_ID;
  const sheet = process.env.PLANTAPI_SCHEDULE_SHEET_ID;
  const head = "\n\n## Engine override (wins over the text above)\n";
  if (role === "workforce" && cal) {
    return (
      head +
      `Read availability ONLY from Google Calendar id \`${cal}\` (NOT \`primary\`). \`allow_seed_fallback\` is false: if that calendar cannot be read, report BLOCKED with the exact error. ` +
      `An empty calendar means the technician is free — do not add conflicts from anywhere else. \`source\` = \`calendar:${cal}\`.`
    );
  }
  if (role === "production" && sheet) {
    return head + `Read the schedule ONLY from Google Sheet id \`${sheet}\`; no seed fallback — if it cannot be read, report BLOCKED with the exact error. \`source\` = \`sheets:${sheet}\`.`;
  }
  if (role === "erp") {
    return (
      head +
      "Odoo block = ONE mrp.workcenter.productivity record on Crushing Line 2 with date_start/date_end = the plan window (Odoo stores UTC). For a FUTURE window the line still shows \"normal\" until the window starts — that is expected, not a failure. Always report `odoo_block_ref` = \"mrp.workcenter.productivity:<id>\" of the record you created (the backend re-checks it against the window)."
    );
  }
  if (role === "verification") {
    return (
      head +
      "Unblock = end the SAME Odoo record the ERP agent created (`erp.odoo_block_ref`): write its date_end = now (UTC) if it is still open or ends later. Do not create or close any other record. Set `odoo_unblocked` true only after that write succeeded (the backend re-checks it)."
    );
  }
  if (role === "dispatch") {
    const email = process.env.PLANTAPI_NOTICE_EMAIL;
    return (
      head +
      "A plan marked \"conditional on part arrival\" is still an approved plan: book the calendar event for `plan.window_start`–`plan.window_end` and post the Slack notice as usual, and state the condition in both (e.g. \"conditional on LC1D09BD arriving before 18:00\"). Report a notice as blocked ONLY if the window timestamps are actually missing or the system returns an error — never because the plan is conditional." +
      (email ? ` In Slack, @-mention the workspace user with email ${email} (look them up by email; they stand in for the technician) and name the technician in the text.` : "")
    );
  }
  if (role === "risk") {
    return (
      head +
      "If the plan's `safety` or `actions` say the work is conditional on part arrival (no confirmed lead time), `decision` must be at least APPROVAL and the condition must be listed in `hazards` (\"Part arrival not confirmed before window start\")."
    );
  }
  return "";
}

export function outputSchemaText(role: AgentRole): string {
  return JSON.stringify(z.toJSONSchema(schemaFor(role)), null, 2);
}

export function buildTaskText(role: AgentRole, incident: Incident, extra: Record<string, unknown> = {}): string {
  // Coordinator sees only triage + materials + the planners' outputs.
  const context =
    role === "coordinator"
      ? { incident_id: incident.id, alarm_text: incident.alarm_text, triage: incident.triage, materials: incident.materials, team: extra.team ?? null }
      : {
          incident_id: incident.id,
          alarm_text: incident.alarm_text,
          photo_url: incident.photo_url,
          triage: incident.triage,
          materials: incident.materials,
          plan: incident.plan,
          erp: incident.erp,
          ...extra,
        };
  const setup =
    role === "coordinator"
      ? ["## Rules", "Use only the incident context below. Never read ~/plantapi/seed or any other file."]
      : [
          "## Setup on this instance",
          "Run `source ~/plantapi/plant.env` before any Odoo/Monid/Fiix command (ODOO_*, MONID_API_KEY, FIIX_* are set there; the `monid` CLI is installed and logged in).",
          "Skill files referenced as `agent/skills/...` live at `~/plantapi/agent/skills/...`; SOP files at `~/plantapi/seed/sop/`. Fiix browser helper: `~/plantapi/fiix-browser.sh`.",
          "Only use values from your own tool runs or from the incident context below — if a tool is unavailable, say so and report BLOCKED rather than filling in seed or example values.",
          "Write time ranges with a plain ASCII hyphen (18:00-19:00), not an en dash, in every message you send.",
        ];
  return [
    ...setup,
    "",
    roleInstructions(role),
    "",
    "## Incident context (JSON)",
    JSON.stringify(context, null, 2),
    "",
    "## Output",
    role === "coordinator"
      ? "Only report facts from the context above."
      : "Do the work with your real tools. Never invent record ids, prices or WO codes — only report what you actually saw.",
    "End your reply with exactly one JSON object matching this JSON Schema (no text after it):",
    outputSchemaText(role),
  ].join("\n");
}
