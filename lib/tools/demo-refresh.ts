// Re-anchor the demo schedule to NOW (plant time) in the REAL Google Sheet + Calendar.
// Used by the "Reset demo" button (lib/tools/demo.ts) and the CLI scripts/demo-refresh.ts.
//
// Calls Composio from INSIDE the Agent37 instance (POST /v1/instances/{id}/exec -> curl to the managed
// Composio MCP with $AGENT37_MANAGED_TOKEN, COMPOSIO_MULTI_EXECUTE_TOOL), like scripts/setup-google.ts.
//
// Calendar PLANTAPI_CALENDAR_ID ("PlantAPI Technicians"): deletes ONLY events we own — description contains
// "plantapi-demo-refresh" (this module) or starts with "PlantAPI demo technician schedule (" (setup-google.ts).
// Everything else (e.g. real Dispatch bookings) is left untouched. Then creates tagged events:
//   Sarah busy (PM rounds) now-1h->now+30m, Available now+30m->now+2h30, arc-flash training tomorrow 07:00-12:00;
//   Mike + David 06:00-14:00 today.
// Sheet PLANTAPI_SCHEDULE_SHEET_ID tab "Schedule": rewritten in place (A1:K30), seed rows shifted so the
//   Crushing Line 2 low-impact window (Reduced, Downtime YES) is the SAME now+30m->now+2h30; lowest window tomorrow 07:00-08:00.
// Roster: the INSTANCE copy ~/plantapi/seed/technicians.json is REWRITTEN EVERY RUN (via exec) so Sarah's shift is
//   now-6h->now+3h ("HH:MM-HH:MM", may cross midnight); Mike/David keep theirs. The repo seed/technicians.json is
//   static (Sarah 12:00-23:59, wide enough for an evening demo) and is overwritten on the instance by each refresh.
// Read-back proof: calendar free window AND roster shift AND sheet low-impact window must overlap >= 60 min.
// Times are ISO with the plant offset (DST via Intl). Never logs secrets. Never calls process.exit.

export const DEMO_REFRESH_TAG = "plantapi-demo-refresh";
const SETUP_PREFIX = "PlantAPI demo technician schedule (";
const MIN = 60_000;

export interface RefreshWindow { start: string; end: string } // ISO with plant offset
export interface RefreshSummary {
  ok: boolean;
  dryRun: boolean;
  tz: string;
  now: string;
  sarah: { busy: RefreshWindow; free: RefreshWindow; training: RefreshWindow };
  sheet: {
    lowImpact: { date: string; start: string; end: string; impact: string };
    lowest: { date: string; start: string; end: string; impact: string };
    rowsWritten: number;
  };
  calendar: { deleted: number; created: number; untouched: number; untouchedTitles: string[] };
  roster: { sarahShift: string; start: string; end: string; instanceLine?: string };
  overlap?: { free: RefreshWindow; roster: RefreshWindow; sheetLow: RefreshWindow; start: string; end: string; minutes: number };
  readBack?: { events: { summary: string; start: string; end: string }[]; sheetRows: string[][] };
  error?: string;
}
export interface RefreshOptions {
  dryRun?: boolean;
  tz?: string;
  onProgress?: (step: string, detail: string) => void;
}

// ---------- time helpers ----------
function makeClock(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const offFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
  const parts = (d: Date) => {
    const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, H: +p.hour, M: +p.minute };
  };
  const offsetMin = (d: Date) => {
    const name = offFmt.formatToParts(d).find((x) => x.type === "timeZoneName")!.value; // "GMT-04:00" | "GMT"
    const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
  };
  const wall = (y: number, mo: number, d: number, H: number, M = 0) => {
    const guess = Date.UTC(y, mo - 1, d, H, M);
    const t1 = guess - offsetMin(new Date(guess)) * MIN;
    return new Date(guess - offsetMin(new Date(t1)) * MIN);
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => {
    const p = parts(d), o = offsetMin(d), a = Math.abs(o);
    return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.H)}:${pad(p.M)}:00${o < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  };
  const day = (d: Date) => { const p = parts(d); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
  const hm = (d: Date) => { const p = parts(d); return `${pad(p.H)}:${pad(p.M)}`; };
  return { parts, wall, iso, day, hm };
}

// ---------- Composio via the instance ----------
type ToolCall = { tool_slug: string; arguments: Record<string, unknown> };
type ToolResult = { error?: string; response?: any; tool_slug: string; index: number };

export function composio() {
  const instance = process.env.AGENT37_INSTANCE_ID || "pfd5d7eukw";
  const base = (process.env.AGENT37_BASE_URL || "https://api.agent37.com/v1").replace(/\/$/, "");
  const key = process.env.AGENT37_API_KEY;
  if (!key) throw new Error("BLOCKED: AGENT37_API_KEY not set");

  async function exec(command: string): Promise<{ exit_code: number; stdout: string; stderr: string }> {
    const res = await fetch(`${base}/instances/${instance}/exec`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`Agent37 exec -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json() as any;
  }
  /** Several tools in ONE COMPOSIO_MULTI_EXECUTE_TOOL call. No retry: writes must not double-run. */
  async function multi(tools: ToolCall[]): Promise<ToolResult[]> {
    if (!tools.length) return [];
    const body = {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "COMPOSIO_MULTI_EXECUTE_TOOL", arguments: { tools, sync_response_to_workbench: false, thought: "PlantAPI demo refresh" } },
    };
    const b64 = Buffer.from(JSON.stringify(body)).toString("base64");
    const r = await exec(
      `[ -n "$AGENT37_MANAGED_TOKEN" ] || { echo NO_MANAGED_TOKEN; exit 3; }; echo '${b64}' | base64 -d > /tmp/plantapi-refresh.json; ` +
        `curl -sS -w '\\nHTTP_STATUS:%{http_code}' "$AGENT37_COMPOSIO_MCP_URL" -H "Authorization: Bearer $AGENT37_MANAGED_TOKEN" ` +
        `-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" --data @/tmp/plantapi-refresh.json`,
    );
    const out = r.stdout || "";
    if (out.includes("NO_MANAGED_TOKEN")) throw new Error("BLOCKED: AGENT37_MANAGED_TOKEN missing in instance exec env");
    const http = Number(out.match(/HTTP_STATUS:(\d+)\s*$/)?.[1] || 0);
    const raw = out.replace(/\nHTTP_STATUS:\d+\s*$/, "");
    if (http !== 200) throw new Error(`BLOCKED: Composio MCP http ${http}: ${raw.slice(0, 300)}`);
    const data = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    const rpc = JSON.parse(data.length ? data[data.length - 1] : raw);
    if (rpc.error) throw new Error(`Composio rpc error ${JSON.stringify(rpc.error).slice(0, 300)}`);
    const env = JSON.parse((rpc.result?.content || []).map((c: any) => c.text || "").join(""));
    const results: ToolResult[] = env?.data?.results || [];
    if (!results.length) throw new Error(`Composio execute failed: ${env?.error || JSON.stringify(env).slice(0, 300)}`);
    return results.sort((a, b) => a.index - b.index);
  }
  async function one(slug: string, args: Record<string, unknown>) {
    const [r] = await multi([{ tool_slug: slug, arguments: args }]);
    if (r.error) throw new Error(`${slug}: ${r.error}`);
    return r.response;
  }
  return { multi, one, exec };
}

function findAll(o: any, pred: (x: any) => boolean, acc: any[] = []): any[] {
  if (o && typeof o === "object") {
    if (!Array.isArray(o) && pred(o)) acc.push(o);
    for (const v of Object.values(o)) findAll(v, pred, acc);
  }
  return acc;
}
const isOurs = (x: any) =>
  typeof x.description === "string" && (x.description.includes(DEMO_REFRESH_TAG) || x.description.startsWith(SETUP_PREFIX));

// ---------- plan ----------
type Ev = { summary: string; start: Date; end: Date; free?: boolean };
export function planDemoRefresh(tz: string, nowMs = Date.now()) {
  const c = makeClock(tz);
  const n = new Date(Math.floor(nowMs / (5 * MIN)) * 5 * MIN);
  const t = c.parts(n);
  const tm = new Date(Date.UTC(t.y, t.m - 1, t.d + 1));
  const [ty, tmo, td] = [tm.getUTCFullYear(), tm.getUTCMonth() + 1, tm.getUTCDate()];
  const at = (k: number) => new Date(n.getTime() + k * MIN);
  const today = (H: number, M = 0) => c.wall(t.y, t.m, t.d, H, M);
  const tomorrow = (H: number, M = 0) => c.wall(ty, tmo, td, H, M);
  const L = at(30), E = at(150); // Sarah free == production low-impact window
  const shiftStart = at(-360), shiftEnd = at(180); // Sarah roster shift on the instance

  const events: Ev[] = [
    { summary: "Sarah Chen: PM rounds - MCC-01/02", start: at(-60), end: L },
    { summary: "Sarah Chen: Available", start: L, end: E, free: true },
    { summary: "Sarah Chen: Arc-flash training (off site)", start: tomorrow(7), end: tomorrow(12) },
    { summary: "Mike Rodriguez: Belt splice - CV-101", start: today(6), end: today(14) },
    { summary: "David Kim: Calibration - FV-221", start: today(6), end: today(14) },
  ];
  const header = ["Date", "Line", "Asset", "Window Start", "Window End", "Status", "Planned Throughput (t/h)", "Production Impact If Down", "Available Downtime", "Maintenance Reserved", "Notes"];
  const cl2 = (s: Date, e: Date, st: string, tph: number, imp: string, avail: string, note: string) =>
    [c.day(s), "Crushing Line 2", "CV-104", c.hm(s), c.hm(e), st, String(tph), imp, avail, "NO", note];
  const rows: string[][] = [
    header,
    cl2(today(6), at(-60), "Running", 220, "High", "NO", "Day shift - customer order SO-4471 in progress"),
    cl2(at(-60), n, "Running", 220, "High", "NO", "Afternoon shift - truck loading"),
    cl2(n, L, "Running", 120, "Medium", "NO", "Shift handover"),
    cl2(L, E, "Reduced", 60, "Low", "YES", "Evening reduced rate - stockpile above target"),
    cl2(E, tomorrow(6), "Stopped", 0, "None", "NO", "Night - line down; no electrician on site"),
    cl2(tomorrow(7), tomorrow(8), "Startup", 0, "Lowest", "YES", "Line start-up checks - lowest impact window"),
    cl2(tomorrow(8), tomorrow(16), "Running", 220, "High", "NO", "Day shift"),
    [c.day(n), "Crushing Line 1", "CV-101", "06:00", "22:00", "Running", "180", "High", "NO", "NO", "Unaffected"],
    [c.day(n), "Water System", "P-302", "00:00", "23:59", "Running", "0", "Medium", "YES", "NO", "Duty/standby pump - can swap"],
  ];
  const padded = [...rows, ...Array.from({ length: 30 - rows.length }, () => Array(11).fill(""))];
  return { clock: c, now: n, events, rows, padded, shift: { start: shiftStart, end: shiftEnd, text: `${c.hm(shiftStart)}-${c.hm(shiftEnd)}` } };
}

/** Date + "HH:MM" start/end -> instants; an end <= start rolls to the next day. */
function resolveWindow(c: ReturnType<typeof makeClock>, date: string, startHm: string, endHm: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [sh, sm] = startHm.split(":").map(Number), [eh, em] = endHm.split(":").map(Number);
  const start = c.wall(y, m, d, sh, sm);
  let end = c.wall(y, m, d, eh, em);
  if (end <= start) { const nd = new Date(Date.UTC(y, m - 1, d + 1)); end = c.wall(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate(), eh, em); }
  return { start, end };
}

// ---------- main entry ----------
export async function refreshDemoData(opts: RefreshOptions = {}): Promise<RefreshSummary> {
  const tz = opts.tz || process.env.PLANT_TZ || "America/New_York";
  const progress = opts.onProgress ?? (() => {});
  const p = planDemoRefresh(tz);
  const { iso } = p.clock;
  const [busy, free, training] = p.events;
  const lowRow = p.rows[4], lowestRow = p.rows[6];
  const summary: RefreshSummary = {
    ok: false,
    dryRun: !!opts.dryRun,
    tz,
    now: iso(p.now),
    sarah: {
      busy: { start: iso(busy.start), end: iso(busy.end) },
      free: { start: iso(free.start), end: iso(free.end) },
      training: { start: iso(training.start), end: iso(training.end) },
    },
    sheet: {
      lowImpact: { date: lowRow[0], start: lowRow[3], end: lowRow[4], impact: lowRow[7] },
      lowest: { date: lowestRow[0], start: lowestRow[3], end: lowestRow[4], impact: lowestRow[7] },
      rowsWritten: 0,
    },
    calendar: { deleted: 0, created: 0, untouched: 0, untouchedTitles: [] },
    roster: { sarahShift: p.shift.text, start: iso(p.shift.start), end: iso(p.shift.end) },
  };
  progress("plan", `plant now ${summary.now}; Sarah free ${summary.sarah.free.start} -> ${summary.sarah.free.end}`);
  if (opts.dryRun) {
    summary.ok = true;
    return summary;
  }

  try {
    const sheetId = process.env.PLANTAPI_SCHEDULE_SHEET_ID;
    const calId = process.env.PLANTAPI_CALENDAR_ID;
    if (!sheetId || !calId) throw new Error("BLOCKED: PLANTAPI_SCHEDULE_SHEET_ID / PLANTAPI_CALENDAR_ID not set");
    const { multi, one, exec } = composio();

    // 1. delete only events we own
    progress("calendar", "listing events");
    const list = await one("GOOGLECALENDAR_EVENTS_LIST", {
      calendarId: calId, timeMin: new Date(Date.now() - 30 * 1440 * MIN).toISOString(),
      timeMax: new Date(Date.now() + 30 * 1440 * MIN).toISOString(), singleEvents: true, maxResults: 250,
    });
    const all = findAll(list, (x) => typeof x.id === "string" && x.start && typeof x.summary === "string");
    const ours = all.filter(isOurs);
    const others = all.filter((x) => !isOurs(x));
    summary.calendar.untouched = others.length;
    summary.calendar.untouchedTitles = others.map((x) => x.summary);
    const del = await multi(ours.map((x) => ({
      tool_slug: "GOOGLECALENDAR_DELETE_EVENT", arguments: { calendar_id: calId, event_id: x.id, send_updates: "none" },
    })));
    const delErr = del.filter((r) => r.error);
    summary.calendar.deleted = ours.length - delErr.length;
    progress("calendar", `deleted ${summary.calendar.deleted} owned events, left ${others.length} untouched`);
    if (delErr.length) throw new Error(`delete errors: ${delErr.map((r) => r.error).join("; ").slice(0, 300)}`);

    // 2. create tagged events
    const cr = await multi(p.events.map((e) => ({
      tool_slug: "GOOGLECALENDAR_CREATE_EVENT",
      arguments: {
        calendar_id: calId, summary: e.summary, start_datetime: iso(e.start), end_datetime: iso(e.end), timezone: tz,
        transparency: e.free ? "transparent" : "opaque", create_meeting_room: false, send_updates: "none", exclude_organizer: true,
        description: `${DEMO_REFRESH_TAG} | PlantAPI demo technician schedule, re-anchored ${summary.now}`,
      },
    })));
    const crErr = cr.filter((r) => r.error);
    summary.calendar.created = cr.length - crErr.length;
    progress("calendar", `created ${summary.calendar.created}/${p.events.length} tagged events`);
    if (crErr.length) throw new Error(`create errors: ${crErr.map((r) => r.error).join("; ").slice(0, 300)}`);

    // 3. rewrite sheet in place
    await one("GOOGLESHEETS_VALUES_UPDATE", {
      spreadsheet_id: sheetId, range: "Schedule!A1:K30", values: p.padded, value_input_option: "RAW", major_dimension: "ROWS",
    });
    summary.sheet.rowsWritten = p.rows.length;
    progress("sheet", `rewrote Schedule!A1:K30 (${p.rows.length} rows incl. header)`);

    // 3b. roster: rewrite the instance copy of technicians.json (Sarah's shift only; rewritten every run)
    const TECH = "~/plantapi/seed/technicians.json";
    const cur = await exec(`cat ${TECH}`);
    if (cur.exit_code !== 0) throw new Error(`read ${TECH}: ${(cur.stderr || cur.stdout).slice(0, 200)}`);
    const techs = JSON.parse(cur.stdout) as Array<{ name: string; shift: string }>;
    const sarah = techs.find((x) => x.name === "Sarah Chen");
    if (!sarah) throw new Error("Sarah Chen not in instance technicians.json");
    sarah.shift = p.shift.text;
    const body = "[\n" + techs.map((x) => "  " + JSON.stringify(x).replace(/,"/g, ', "').replace(/":/g, '": ')).join(",\n") + "\n]\n";
    const b64 = Buffer.from(body).toString("base64");
    const w = await exec(`echo '${b64}' | base64 -d > ${TECH}.tmp && mv ${TECH}.tmp ${TECH}`);
    if (w.exit_code !== 0) throw new Error(`write ${TECH}: ${w.stderr.slice(0, 200)}`);
    progress("roster", `instance technicians.json: Sarah shift ${p.shift.text}`);

    // 4. read back (proof)
    const back = await one("GOOGLECALENDAR_EVENTS_LIST", {
      calendarId: calId, timeMin: new Date(Date.now() - 1440 * MIN).toISOString(),
      timeMax: new Date(Date.now() + 3 * 1440 * MIN).toISOString(), singleEvents: true, orderBy: "startTime", timeZone: tz, maxResults: 50,
    });
    const evs = findAll(back, (x) => typeof x.summary === "string" && x.start?.dateTime);
    const sv = await one("GOOGLESHEETS_VALUES_GET", { spreadsheet_id: sheetId, range: "Schedule!A1:K30" });
    const values: string[][] = findAll(sv, (x) => Array.isArray(x.values))[0]?.values || [];
    summary.readBack = {
      events: evs.map((e) => ({ summary: e.summary, start: e.start.dateTime, end: e.end.dateTime, tagged: isOurs(e) } as any)),
      sheetRows: values,
    };
    const rb = await exec(`grep '"Sarah Chen"' ~/plantapi/seed/technicians.json`);
    const instanceLine = rb.stdout.trim();
    summary.roster.instanceLine = instanceLine;
    const shiftBack = instanceLine.match(/"shift":\s*"(\d{2}:\d{2})-(\d{2}:\d{2})"/);
    const freeEv = evs.find((e) => e.summary === "Sarah Chen: Available" && isOurs(e));
    const lowBack = values.find((r) => r[1] === "Crushing Line 2" && r[5] === "Reduced" && r[8] === "YES");
    if (!shiftBack || !freeEv || !lowBack) throw new Error(`read-back incomplete: shift=${!!shiftBack} free=${!!freeEv} sheetLow=${!!lowBack}`);
    const fw = { start: new Date(freeEv.start.dateTime), end: new Date(freeEv.end.dateTime) };
    const rw = resolveWindow(p.clock, p.clock.day(p.shift.start), shiftBack[1], shiftBack[2]);
    const sw = resolveWindow(p.clock, lowBack[0], lowBack[3], lowBack[4]);
    const os = new Date(Math.max(fw.start.getTime(), rw.start.getTime(), sw.start.getTime()));
    const oe = new Date(Math.min(fw.end.getTime(), rw.end.getTime(), sw.end.getTime()));
    const w2 = (x: { start: Date; end: Date }) => ({ start: iso(x.start), end: iso(x.end) });
    summary.overlap = { free: w2(fw), roster: w2(rw), sheetLow: w2(sw), start: iso(os), end: iso(oe), minutes: Math.max(0, (oe.getTime() - os.getTime()) / MIN) };
    progress("verify", `free/roster/sheet-low overlap ${summary.overlap.start} -> ${summary.overlap.end} (${summary.overlap.minutes} min)`);
    const taggedBack = evs.filter((e) => typeof e.description === "string" && e.description.includes(DEMO_REFRESH_TAG)).length;
    progress("verify", `read back ${taggedBack} tagged events, ${values.length} sheet rows`);
    summary.ok = taggedBack === p.events.length && values.length === p.rows.length && summary.overlap.minutes >= 60;
    if (!summary.ok) summary.error = `read-back check failed: ${taggedBack}/${p.events.length} tagged events, ${values.length}/${p.rows.length} rows, overlap ${summary.overlap.minutes} min (need >= 60)`;
  } catch (e) {
    summary.ok = false;
    summary.error = (e as Error).message;
    progress("error", summary.error);
  }
  return summary;
}

// ---------- exact-id calendar helpers (used by resetDemo archive) ----------
export interface CalendarEventCheck { id: string; exists: boolean; summary?: string; start?: string; error?: string }

/** GET each id in PLANTAPI_CALENDAR_ID (one batched call). exists=false for missing/cancelled/other-calendar ids. */
export async function checkCalendarEvents(ids: string[], calId = process.env.PLANTAPI_CALENDAR_ID): Promise<CalendarEventCheck[]> {
  if (!ids.length) return [];
  if (!calId) throw new Error("BLOCKED: PLANTAPI_CALENDAR_ID not set");
  const res = await composio().multi(ids.map((id) => ({ tool_slug: "GOOGLECALENDAR_EVENTS_GET", arguments: { calendar_id: calId, event_id: id } })));
  return ids.map((id, i) => {
    const r = res[i];
    if (r?.error) return { id, exists: false, error: r.error.slice(0, 160) };
    const ev = findAll(r?.response, (x) => x.id === id)[0];
    if (!ev || ev.status === "cancelled") return { id, exists: false, error: ev ? "cancelled" : "not found in response" };
    return { id, exists: true, summary: ev.summary, start: ev.start?.dateTime ?? ev.start?.date };
  });
}

/** DELETE exact event ids from PLANTAPI_CALENDAR_ID (one batched call). Caller must have checked existence. */
export async function deleteCalendarEvents(ids: string[], calId = process.env.PLANTAPI_CALENDAR_ID): Promise<{ id: string; deleted: boolean; error?: string }[]> {
  if (!ids.length) return [];
  if (!calId) throw new Error("BLOCKED: PLANTAPI_CALENDAR_ID not set");
  const res = await composio().multi(ids.map((id) => ({ tool_slug: "GOOGLECALENDAR_DELETE_EVENT", arguments: { calendar_id: calId, event_id: id, send_updates: "none" } })));
  return ids.map((id, i) => (res[i]?.error ? { id, deleted: false, error: res[i].error!.slice(0, 160) } : { id, deleted: true }));
}
