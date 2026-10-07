// One-time, idempotent Google setup for PlantAPI through the Agent37 instance's managed Composio.
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/setup-google.ts
//
// 1. GET /v1/instances/{id}/integrations/connections (AGENT37_API_KEY). If googlesheets or
//    googlecalendar is not ACTIVE: print BLOCKED + statuses, exit 0. Never starts a connection.
// 2. Calls Composio from INSIDE the instance (POST /v1/instances/{id}/exec -> curl to
//    $AGENT37_COMPOSIO_MCP_URL with $AGENT37_MANAGED_TOKEN, JSON-RPC tools/call COMPOSIO_MULTI_EXECUTE_TOOL).
//    The managed MCP only serves Agent37-hosted callers, so we never call it from this machine.
// 3. Spreadsheet "PlantAPI Production Schedule" / tab "Schedule" <- seed/production_schedule.csv (search first, reuse).
//    Calendar "PlantAPI Technicians" <- seed/calendar_events.json (list first, reuse; skip events that exist).
// 4. Writes PLANTAPI_SCHEDULE_SHEET_ID / PLANTAPI_CALENDAR_ID to C:\AI\agent37\.env.local (only those keys)
//    and ~/plantapi/plant.env on the instance. Never prints secrets.
import fs from "node:fs";
import path from "node:path";

const INSTANCE = process.env.AGENT37_INSTANCE_ID || "pfd5d7eukw";
const BASE = (process.env.AGENT37_BASE_URL || "https://api.agent37.com/v1").replace(/\/$/, "");
const KEY = process.env.AGENT37_API_KEY;
const SHEET_TITLE = "PlantAPI Production Schedule";
const TAB = "Schedule";
const CAL_TITLE = "PlantAPI Technicians";
const TZ = "America/New_York";
const LEAD_ENV = process.env.PLANTAPI_LEAD_ENV_LOCAL || "C:\\AI\\agent37\\.env.local";
const ROOT = path.resolve(__dirname, "..");

function blocked(why: string, detail?: unknown): never {
  console.log(`BLOCKED: ${why}`);
  if (detail !== undefined) console.log(JSON.stringify(detail, null, 2));
  process.exit(0);
}

async function api(p: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || "GET"} ${p} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// ---------- 1. connection gate ----------
async function checkConnections() {
  const j = await api(`/instances/${INSTANCE}/integrations/connections`);
  const conns: any[] = j.connections || [];
  const status = (slug: string) =>
    conns.filter((c) => c.toolkitSlug === slug).map((c) => ({ id: c.id, status: c.status, disabled: c.isDisabled }));
  const summary = Object.fromEntries(
    ["googlesheets", "googlecalendar", "gmail", "slack"].map((s) => [s, status(s)]),
  );
  const active = (s: string) => conns.some((c) => c.toolkitSlug === s && c.status === "ACTIVE" && !c.isDisabled);
  if (!active("googlesheets") || !active("googlecalendar")) blocked("googlesheets/googlecalendar not ACTIVE on " + INSTANCE, summary);
  console.log("connections ACTIVE:", JSON.stringify(summary));
}

// ---------- 2. Composio via the instance ----------
async function exec(command: string): Promise<{ exit_code: number; stdout: string; stderr: string }> {
  return api(`/instances/${INSTANCE}/exec`, { method: "POST", body: JSON.stringify({ command }) });
}

let rpcId = 1;
/** Raw meta-tool call on the instance; returns the parsed meta-tool envelope. */
async function rpc(name: string, args: Record<string, unknown>): Promise<any> {
  const body = { jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name, arguments: args } };
  const b64 = Buffer.from(JSON.stringify(body)).toString("base64");
  const r = await exec(
    `echo '${b64}' | base64 -d > /tmp/plantapi-rpc.json; curl -sS "$AGENT37_COMPOSIO_MCP_URL" ` +
      `-H "Authorization: Bearer $AGENT37_MANAGED_TOKEN" -H "Content-Type: application/json" ` +
      `-H "Accept: application/json, text/event-stream" --data @/tmp/plantapi-rpc.json`,
  );
  const lines = (r.stdout || "").split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  const j = JSON.parse(lines.length ? lines[lines.length - 1] : r.stdout);
  const text = (j.result?.content || []).map((c: any) => c.text || "").join("");
  return text ? JSON.parse(text) : j.result;
}
/** Run one Composio tool through COMPOSIO_MULTI_EXECUTE_TOOL on the instance; returns the tool's response object. */
async function tool(slug: string, args: Record<string, unknown>): Promise<any> {
  const body = {
    jsonrpc: "2.0",
    id: rpcId++,
    method: "tools/call",
    params: {
      name: "COMPOSIO_MULTI_EXECUTE_TOOL",
      arguments: { tools: [{ tool_slug: slug, arguments: args }], sync_response_to_workbench: false, thought: "PlantAPI setup" },
    },
  };
  const b64 = Buffer.from(JSON.stringify(body)).toString("base64");
  const cmd =
    `set -e; [ -n "$AGENT37_MANAGED_TOKEN" ] || { echo NO_MANAGED_TOKEN; exit 3; }; ` +
    `echo '${b64}' | base64 -d > /tmp/plantapi-rpc.json; ` +
    `curl -sS -w '\\nHTTP_STATUS:%{http_code}' "\${AGENT37_COMPOSIO_MCP_URL:-https://api.agent37.com/mcp/composio}" ` +
    `-H "Authorization: Bearer $AGENT37_MANAGED_TOKEN" -H "Content-Type: application/json" ` +
    `-H "Accept: application/json, text/event-stream" --data @/tmp/plantapi-rpc.json`;
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await exec(cmd);
    const out = r.stdout || "";
    if (out.includes("NO_MANAGED_TOKEN")) blocked("AGENT37_MANAGED_TOKEN not in the exec environment on the instance");
    const m = out.match(/HTTP_STATUS:(\d+)\s*$/);
    const http = m ? Number(m[1]) : 0;
    const raw = out.replace(/\nHTTP_STATUS:\d+\s*$/, "");
    if (http === 402) blocked(`${slug}: Composio refused (402 budget/wallet)`, raw.slice(0, 500));
    // Streamable HTTP may answer as SSE: take the last "data:" JSON line.
    const dataLines = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    const jsonText = dataLines.length ? dataLines[dataLines.length - 1] : raw.trim();
    try {
      const rpc = JSON.parse(jsonText);
      if (rpc.error) throw new Error(`rpc error ${JSON.stringify(rpc.error).slice(0, 400)}`);
      const text = (rpc.result?.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      const env = text ? JSON.parse(text) : rpc.result;
      const res0 = env?.data?.results?.[0];
      if (!env?.successful && !res0) throw new Error(`execute failed: ${env?.error || text.slice(0, 400)}`);
      if (res0?.error) throw new Error(`${slug}: ${res0.error}`);
      return res0?.response ?? env?.data;
    } catch (e) {
      last = `${slug} (http ${http}, exit ${r.exit_code}): ${(e as Error).message} | ${raw.slice(0, 300)} ${r.stderr?.slice(0, 200) || ""}`;
    }
  }
  throw new Error(last);
}

/** Depth-first search for objects matching pred (response shapes vary by tool version). */
function findAll(o: any, pred: (x: any) => boolean, acc: any[] = []): any[] {
  if (o && typeof o === "object") {
    if (!Array.isArray(o) && pred(o)) acc.push(o);
    for (const v of Object.values(o)) findAll(v, pred, acc);
  }
  return acc;
}
function firstString(o: any, keys: string[]): string | undefined {
  for (const hit of findAll(o, (x) => keys.some((k) => typeof x[k] === "string"))) {
    for (const k of keys) if (typeof hit[k] === "string") return hit[k];
  }
}

// ---------- 3a. spreadsheet ----------
function readCsv(): string[][] {
  const text = fs.readFileSync(path.join(ROOT, "seed", "production_schedule.csv"), "utf8").trim();
  return text.split(/\r?\n/).map((l) => l.split(",")); // seed has no quoted commas
}

/** Known id from env or the lead's .env.local (search can lag right after create). */
function knownId(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!fs.existsSync(LEAD_ENV)) return undefined;
  const line = fs.readFileSync(LEAD_ENV, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() || undefined : undefined;
}

async function setupSheet(): Promise<string> {
  const known = knownId("PLANTAPI_SCHEDULE_SHEET_ID");
  if (known) {
    try {
      await tool("GOOGLESHEETS_GET_SHEET_NAMES", { spreadsheet_id: known });
      console.log(`sheet: known id ${known} still exists`);
      return fillSheet(known);
    } catch (e) {
      console.log(`sheet: known id not usable (${(e as Error).message.slice(0, 120)}), searching`);
    }
  }
  const found = await tool("GOOGLESHEETS_SEARCH_SPREADSHEETS", { query: SHEET_TITLE, search_type: "name", max_results: 10 });
  const matches = findAll(found, (x) => x.name === SHEET_TITLE && typeof x.id === "string");
  let id: string | undefined = matches[0]?.id;
  if (matches.length > 1) console.log(`note: ${matches.length} spreadsheets named "${SHEET_TITLE}", reusing ${id}`);
  if (id) console.log(`sheet: reuse ${id}`);
  else {
    const created = await tool("GOOGLESHEETS_CREATE_GOOGLE_SHEET1", { title: SHEET_TITLE });
    id = firstString(created, ["spreadsheetId", "spreadsheet_id", "id"]);
    if (!id) throw new Error("create sheet: no id in response " + JSON.stringify(created).slice(0, 300));
    console.log(`sheet: created ${id}`);
  }
  return fillSheet(id);
}

async function fillSheet(id: string): Promise<string> {
  const names = await tool("GOOGLESHEETS_GET_SHEET_NAMES", { spreadsheet_id: id });
  const hasTab = JSON.stringify(names).includes(`"${TAB}"`);
  if (!hasTab) {
    await tool("GOOGLESHEETS_ADD_SHEET", { spreadsheet_id: id, title: TAB, force_unique: false });
    console.log(`sheet: added tab ${TAB}`);
  }
  const rows = readCsv();
  await tool("GOOGLESHEETS_VALUES_UPDATE", {
    spreadsheet_id: id,
    range: `${TAB}!A1`,
    values: rows,
    value_input_option: "RAW",
    major_dimension: "ROWS",
  });
  const check = await tool("GOOGLESHEETS_VALUES_GET", { spreadsheet_id: id, range: `${TAB}!A1:K50` });
  const got = findAll(check, (x) => Array.isArray(x.values))[0]?.values?.length ?? 0;
  console.log(`sheet: wrote ${rows.length} rows, read back ${got}`);
  if (got !== rows.length) throw new Error(`sheet read-back mismatch: ${got} != ${rows.length}`);
  return id;
}

// ---------- 3b. calendar ----------
type SeedEvent = { technician: string; title: string; start: string; end: string; free?: boolean };

async function setupCalendar(): Promise<string> {
  const list = await tool("GOOGLECALENDAR_LIST_CALENDARS", { max_results: 250 });
  const known = knownId("PLANTAPI_CALENDAR_ID");
  let id: string | undefined = known && JSON.stringify(list).includes(known) ? known : undefined;
  id ??= findAll(list, (x) => x.summary === CAL_TITLE && typeof x.id === "string")[0]?.id;
  if (id) console.log(`calendar: reuse ${id}`);
  else {
    const created = await tool("GOOGLECALENDAR_CREATE_CALENDAR", {
      summary: CAL_TITLE,
      timezone: TZ,
      description: "PlantAPI demo: technician availability (from seed/calendar_events.json)",
    });
    id = firstString(created, ["id", "calendarId", "calendar_id"]);
    if (!id) throw new Error("create calendar: no id in response " + JSON.stringify(created).slice(0, 300));
    console.log(`calendar: created ${id}`);
  }
  const seed: SeedEvent[] = JSON.parse(fs.readFileSync(path.join(ROOT, "seed", "calendar_events.json"), "utf8"));
  const times = seed.flatMap((e) => [Date.parse(e.start), Date.parse(e.end)]);
  const existing = await tool("GOOGLECALENDAR_EVENTS_LIST", {
    calendarId: id,
    timeMin: new Date(Math.min(...times) - 60_000).toISOString(),
    timeMax: new Date(Math.max(...times) + 60_000).toISOString(),
    singleEvents: true,
    maxResults: 250,
  });
  const have = new Set(findAll(existing, (x) => typeof x.summary === "string" && x.start).map((x) => x.summary));
  let created = 0;
  for (const e of seed) {
    const summary = `${e.technician}: ${e.title}`;
    if (have.has(summary)) continue;
    await tool("GOOGLECALENDAR_CREATE_EVENT", {
      calendar_id: id,
      summary,
      start_datetime: e.start,
      end_datetime: e.end,
      timezone: TZ,
      transparency: e.free ? "transparent" : "opaque",
      create_meeting_room: false,
      send_updates: "none",
      exclude_organizer: true,
      description: `PlantAPI demo technician schedule (${e.technician})`,
    });
    created++;
  }
  console.log(`calendar: ${seed.length} seed events, ${created} created, ${seed.length - created} already present`);
  return id;
}

// ---------- 3c. notice email + Slack channel ----------
async function noticeEmail(): Promise<string> {
  const prof = await tool("GMAIL_GET_PROFILE", { user_id: "me" });
  const email = firstString(prof, ["emailAddress", "email_address", "email"]);
  if (!email || !email.includes("@")) throw new Error("gmail profile: no address " + JSON.stringify(prof).slice(0, 200));
  console.log(`gmail: notice email = connected account (${email.replace(/^(.).*(@.*)$/, "$1***$2")})`);
  return email;
}

const SLACK_NAME = process.env.PLANTAPI_SLACK_CHANNEL_NAME || "plant-ops";
async function slackChannel(): Promise<string> {
  const found = await tool("SLACK_FIND_CHANNELS", { query: SLACK_NAME, exact_match: true });
  let id: string | undefined = findAll(found, (x) => x.name === SLACK_NAME && typeof x.id === "string")[0]?.id;
  if (id) console.log(`slack: reuse #${SLACK_NAME} ${id}`);
  else {
    const created = await tool("SLACK_CREATE_CHANNEL", { name: SLACK_NAME });
    id = findAll(created, (x) => x.name === SLACK_NAME && typeof x.id === "string")[0]?.id ?? firstString(created, ["id"]);
    if (!id) throw new Error("slack create: no id " + JSON.stringify(created).slice(0, 300));
    console.log(`slack: created #${SLACK_NAME} ${id}`);
  }
  return id;
}

/** Free schema lookup: every app slug the skills use must exist. */
async function checkSkillSlugs() {
  const slugs = [
    "GOOGLESHEETS_SEARCH_SPREADSHEETS", "GOOGLESHEETS_VALUES_GET",
    "GOOGLECALENDAR_EVENTS_LIST", "GOOGLECALENDAR_FIND_FREE_SLOTS", "GOOGLECALENDAR_CREATE_EVENT",
    "GMAIL_GET_PROFILE", "GMAIL_CREATE_EMAIL_DRAFT", "GMAIL_SEND_DRAFT", "GMAIL_LIST_DRAFTS",
    "SLACK_FIND_CHANNELS", "SLACK_FETCH_CONVERSATION_HISTORY", "SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION",
    "SLACK_DOWNLOAD_SLACK_FILE", "SLACK_SEND_MESSAGE",
  ];
  const r = await rpc("COMPOSIO_GET_TOOL_SCHEMAS", { tool_slugs: slugs });
  const nf = r?.data?.not_found || [];
  console.log(nf.length ? `slugs NOT FOUND: ${JSON.stringify(nf)} suggestions ${JSON.stringify(r?.data?.suggestions)}` : `slugs: all ${slugs.length} skill slugs exist`);
}

// ---------- 4. persist ids ----------
function upsertEnv(file: string, kv: Record<string, string>) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const keys = Object.keys(kv);
  const kept = lines.filter((l) => !keys.some((k) => l.startsWith(`${k}=`)));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  for (const k of keys) kept.push(`${k}=${kv[k]}`);
  fs.writeFileSync(file, kept.join("\n") + "\n");
}

async function writeInstanceEnv(kv: Record<string, string>) {
  const sets = Object.entries(kv)
    .map(([k, v]) => `grep -v '^${k}=' ~/plantapi/plant.env > /tmp/pe 2>/dev/null || true; echo '${k}=${v}' >> /tmp/pe; mv /tmp/pe ~/plantapi/plant.env`)
    .join("; ");
  const r = await exec(`mkdir -p ~/plantapi && touch ~/plantapi/plant.env && ${sets} && grep -c PLANTAPI_ ~/plantapi/plant.env`);
  if (r.exit_code !== 0) throw new Error(`instance plant.env write failed: ${r.stderr.slice(0, 200)}`);
}

async function main() {
  if (!KEY) blocked("AGENT37_API_KEY not set");
  await checkConnections();
  const sheetId = await setupSheet();
  const calId = await setupCalendar();
  const email = await noticeEmail();
  const slack = await slackChannel();
  await checkSkillSlugs();
  const kv = {
    PLANTAPI_SCHEDULE_SHEET_ID: sheetId,
    PLANTAPI_CALENDAR_ID: calId,
    PLANTAPI_NOTICE_EMAIL: email,
    PLANTAPI_SLACK_CHANNEL: slack,
  };
  upsertEnv(LEAD_ENV, kv);
  upsertEnv(path.join(ROOT, ".env.local"), kv);
  await writeInstanceEnv(kv);
  console.log(`PASS PLANTAPI_SCHEDULE_SHEET_ID=${sheetId} PLANTAPI_CALENDAR_ID=${calId} PLANTAPI_SLACK_CHANNEL=${slack}`);
  console.log(`written (4 keys): ${LEAD_ENV}, ${path.join(ROOT, ".env.local")}, ${INSTANCE}:~/plantapi/plant.env`);
}

main().catch((e) => {
  console.log(`FAIL: ${(e as Error).message}`);
  process.exit(1);
});
