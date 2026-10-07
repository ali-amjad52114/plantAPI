// Mock replay of INC-0142 (?mock=1). Emits contract-shaped incident / agent_tasks / agent_events rows over time,
// so the UI can be built and demoed before the engine is live. Agents in one phase run in parallel.
import type { AgentEvent, AgentRole, AgentTask, Incident, IncidentStatus, SystemName } from "@/lib/contracts/types";
import type { IncidentView } from "./model";

const SID: Record<AgentRole, string> = {
  triage: "ses_tri_2a91", reliability: "ses_rel_4f1c", materials: "ses_mat_91be", production: "ses_pro_07d3", workforce: "ses_wrk_5c20",
  coordinator: "ses_crd_e81a", risk: "ses_rsk_33f0", procurement: "ses_prc_6b4e", erp: "ses_erp_d27c", dispatch: "ses_dsp_8a15", verification: "ses_ver_f402",
};
export const MOCK_ID = "demo";

type Ctx = { role: AgentRole; run: MockRun };
type Step = { d: number; f: (c: Ctx) => void };
const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };

// step builders; d = ms before the step runs at 1x
const call = (d: number, msg: string, system: SystemName | null = null): Step => ({ d, f: c => c.run.emit(c.role, "tool", system, "→ " + msg) });
const res = (d: number, msg: string): Step => ({ d, f: c => c.run.emit(c.role, "log", null, msg, { quiet: true }) });
const nav = (d: number, page: string, hl: string | null, system: SystemName): Step =>
  ({ d, f: c => c.run.emit(c.role, "tool", system, "↪ open " + PAGE_URL[page], { page, hl, quiet: true }) });
const hi = (d: number, page: string, hl: string, note: string): Step => ({ d, f: c => c.run.emit(c.role, "log", null, note, { page, hl, quiet: true }) });
const say = (d: number, system: SystemName, msg: string, extra: Record<string, unknown> = {}): Step => ({ d, f: c => c.run.emit(c.role, "output", system, msg, extra) });
const fx = (d: number, f: (c: Ctx) => void): Step => ({ d, f });

export const PAGE_URL: Record<string, string> = {
  fiix_home: "https://ali52114.fiix.software/assets",
  fiix_asset: "https://ali52114.fiix.software/assets/CV-104",
  fiix_history: "https://ali52114.fiix.software/assets/CV-104/work-orders",
  fiix_new: "https://ali52114.fiix.software/work-orders/new",
  fiix_wo: "https://ali52114.fiix.software/work-orders/WO-1187",
  rs_search: "https://uk.rs-online.com/web/c/?searchTerm=LC1D09BD",
  rs_product: "https://uk.rs-online.com/web/p/contactors/LC1D09BD",
};

const SCRIPTS: Record<AgentRole, (run: MockRun) => Step[]> = {
  triage: () => [
    call(300, "files.get photos/failure-burned-contactor.jpg", "agent37"),
    call(700, "openai.vision(photo, alarm text)", "openai"),
    fx(1000, c => {
      c.run.emit(c.role, "log", null, "← contactor burned · LC1D09BD · HIGH · electrical", { quiet: true });
      c.run.patch({ status: "TRIAGING", triage: TRIAGE });
      c.run.emit(c.role, "output", "openai", "Vision: burned 3-pole contactor, likely LC1D09BD (9 A). Severity high, trade electrical.");
    }),
    nav(500, "fiix_home", "cv104", "fiix"),
    nav(900, "fiix_asset", "status", "fiix"),
    fx(800, c => { c.run.finish(c.role, TRIAGE); c.run.emit(c.role, "output", "fiix", "Triage confirmed CV-104 Conveyor on Crushing Line 2, fed from MCC-03."); }),
  ],
  reliability: () => [
    nav(400, "fiix_asset", "status", "fiix"),
    nav(1000, "fiix_history", "hist", "fiix"),
    hi(900, "fiix_history", "wo1102", "WO-1102 · 2026-09-02"),
    hi(900, "fiix_history", "wo1031", "WO-1031 · 2026-07-11"),
    call(700, "files.read sop/contactor-LC1D09BD.md", "agent37"),
    call(700, 'memory.recall "CV-104 contactor"', "agent37"),
    fx(900, c => {
      c.run.emit(c.role, "log", null, "← recurring: 3rd failure this quarter", { quiet: true });
      c.run.finish(c.role, { headline: "ASAP", detail: "Same contactor failed 2026-07-11 and 2026-09-02. Third failure this quarter." });
      c.run.emit(c.role, "output", "fiix", "Reliability read 2 closed work orders for CV-104: same contactor both times.");
    }),
  ],
  materials: () => [
    call(300, "odoo.search_read product LC1D09BD", "odoo"),
    fx(700, c => { c.run.emit(c.role, "log", null, "← qty_available: 0", { quiet: true }); c.run.emit(c.role, "output", "odoo", "LC1D09BD on hand: 0."); }),
    call(500, 'monid.search "LC1D09BD contactor"', "monid"),
    fx(1000, c => { c.run.emit(c.role, "log", null, "← RS Components $29.49 · 2 more", { quiet: true }); c.run.emit(c.role, "output", "monid", "Search found RS Components listing for LC1D09BD at $29.49."); }),
    nav(500, "rs_search", "r1", "rs"),
    nav(1000, "rs_product", "price", "rs"),
    hi(1000, "rs_product", "stock", "stock + delivery"),
    fx(800, c => {
      c.run.emit(c.role, "log", null, "← in stock 46 · courier 17:00", { quiet: true });
      c.run.patch({ materials: MATERIALS });
      c.run.finish(c.role, { ...MATERIALS, headline: "PART 17:00 TODAY", detail: "Odoo stock 0. RS Components has it for $29.49, same-day courier." });
      c.run.emit(c.role, "output", "agent37", "Materials browser confirmed the RS page: in stock, courier arrives 17:00.");
    }),
  ],
  production: () => [
    call(400, "sheets.values.get production_schedule!A1:F40", "google"), res(1100, "← 18 rows · today + tomorrow"),
    call(500, 'odoo.read workcenter "Crushing Line 2"', "odoo"), res(900, "← load 85% today · 60% tomorrow 07:00"),
    call(600, "openai.chatJSON(rank downtime windows)", "openai"),
    fx(1000, c => {
      c.run.emit(c.role, "log", null, "← best: tomorrow 07:00 · alt: today 18:00", { quiet: true });
      c.run.finish(c.role, { headline: "TMRW 07:00", detail: "Lowest schedule impact. Today 18:00–20:00 is also low impact." });
      c.run.emit(c.role, "output", "google", "Sheets: lowest-impact window tomorrow 07:00; today 18:00–20:00 low impact.");
    }),
  ],
  workforce: () => [
    call(500, "files.read technicians.json", "agent37"), res(700, "← MCC-03 cleared: Sarah Chen only"),
    call(500, "calendar.freebusy sarah.chen 10-07..10-08", "google"), res(1200, "← free today 18:00 · busy tomorrow 07:00"),
    fx(600, c => {
      c.run.finish(c.role, { headline: "S. CHEN 18:00", detail: "Only electrician cleared for MCC-03. Busy tomorrow 07:00." });
      c.run.emit(c.role, "output", "google", "Calendar: Sarah Chen free today 18:00, busy tomorrow 07:00.");
    }),
  ],
  coordinator: () => [
    call(400, "openai.chatJSON(coordinator, 4 proposals)", "openai"),
    res(600, "  reliability  ASAP, recurring"), res(400, "  materials    part 17:00 today"),
    res(400, "  production   tomorrow 07:00"), res(400, "  workforce    Sarah 18:00 today"),
    res(800, '← { "window_start": "18:00",'), res(500, '    "rationale": "part 17:00, Sarah free, low impact, recurring",'),
    res(500, '    "rejected": ["07:00 tomorrow: no cleared electrician"] }'),
    fx(500, c => {
      c.run.patch({ plan: c.run.plan });
      c.run.finish(c.role, c.run.plan);
      c.run.emit(c.role, "output", "openai", "Plan: replace contactor today 18:00. Part arrives 17:00, Sarah is free, window is low impact, failure is recurring.");
    }),
  ],
  risk: () => [
    call(500, "files.read authority_rules.md", "agent37"),
    res(800, "✓ supplier search · AUTO"), res(500, "✓ draft work order · AUTO"),
    res(1300, "! purchase $29.49 · APPROVAL"), res(500, "! block Crushing Line 2 · APPROVAL"), res(500, "! LOTO-CV104 required"),
    fx(600, c => {
      c.run.finish(c.role, { headline: "APPROVAL", detail: "Purchase and blocking Line 2 need approval. LOTO-CV104 required." });
      c.run.emit(c.role, "output", "agent37", "Risk: purchase and blocking Line 2 need approval. LOTO-CV104 required.", { pri: 2 });
    }),
  ],
  procurement: () => [
    call(400, "supabase.insert parts (LC1D09BD, RS, $29.49)", "supabase"),
    call(900, "monid.agentmail.send RS sales · expedite LC1D09BD", "monid"),
    fx(1300, c => {
      c.run.emit(c.role, "log", null, "← sent · thread am_7c1", { quiet: true });
      c.run.finish(c.role, { headline: "EXPEDITED" });
      c.run.emit(c.role, "output", "monid", "AgentMail sent an expedite request to RS Components for LC1D09BD.");
    }),
  ],
  erp: () => [
    nav(400, "fiix_new", "wo_asset", "fiix"),
    hi(700, "fiix_new", "wo_task", "filling task"), hi(500, "fiix_new", "wo_who", "assigning Sarah"), hi(500, "fiix_new", "wo_when", "scheduling 18:00"),
    hi(600, "fiix_new", "create", "creating WO"),
    fx(700, c => {
      c.run.flags.wo = true;
      c.run.emit(c.role, "tool", "fiix", "↪ open " + PAGE_URL.fiix_wo, { page: "fiix_wo", hl: "status", quiet: true });
      c.run.emit(c.role, "output", "fiix", "Work order WO-1187 created and assigned to Sarah Chen.");
    }),
    call(900, "odoo.write workcenter CL2 block 18:00–20:00", "odoo"),
    fx(700, c => {
      c.run.emit(c.role, "log", null, "← ok", { quiet: true });
      c.run.patch({ erp: ERP });
      c.run.finish(c.role, ERP);
      c.run.emit(c.role, "output", "odoo", "Crushing Line 2 blocked 18:00–20:00.");
    }),
  ],
  dispatch: () => [
    call(500, "calendar.events.insert Sarah Chen 18:00–20:00", "google"),
    fx(600, c => c.run.emit(c.role, "output", "google", "Calendar: Sarah Chen booked 18:00–20:00.")),
    call(500, 'slack.post #line2-maint "Line 2 stops 18:00"', "slack"),
    call(500, "gmail.send supervisor notice", "google"),
    call(500, "cron.create chase-ack in 20 min", "agent37"),
    fx(1600, c => c.run.emit(c.role, "output", "agent37", "Follow-up fired: no acknowledgement from Sarah Chen.", { pri: 2 })),
    call(500, "monid.call Sarah Chen", "monid"),
    fx(1300, c => {
      c.run.emit(c.role, "log", null, "← acknowledged on call", { quiet: true });
      c.run.finish(c.role, { headline: "ACKED BY CALL" });
      c.run.emit(c.role, "output", "monid", "Phone call placed to Sarah Chen. Acknowledged on the call.");
    }),
  ],
  verification: run => run.photo === "wrong" ? [
    call(400, "openai.vision(completion photo, notes, WO-1187)", "openai"),
    fx(1300, c => {
      c.run.emit(c.role, "log", null, "✗ label CHNT NCH8-63 63 A ≠ LC1D09BD 9 A", { quiet: true });
      c.run.patch({ verification: VERIFY_REJECT });
      c.run.fail(c.role, "Wrong part in completion photo");
      c.run.emit(c.role, "error", "openai", "Rejected: photo shows a CHNT NCH8-63 (63 A), not LC1D09BD (9 A).");
      c.run.emit("system", "output", "slack", "Verification asked Sarah Chen for a photo of the installed contactor.", { pri: "a" });
      c.run.toRepairGate();
    }),
  ] : [
    call(400, "openai.vision(completion photo, notes, WO-1187)", "openai"),
    res(1100, "✓ new 3-pole TeSys-D · part no. in notes + WO"),
    nav(500, "fiix_wo", "status", "fiix"),
    fx(800, c => { c.run.flags.closed = true; c.run.emit(c.role, "output", "fiix", "WO-1187 closed with notes and photo.", { page: "fiix_wo", hl: "status" }); }),
    call(500, "odoo.write workcenter CL2 unblock", "odoo"),
    call(500, "sheets.append downtime 38 min", "google"),
    fx(500, c => {
      c.run.patch({ verification: VERIFY_ACCEPT });
      c.run.finish(c.role, VERIFY_ACCEPT);
      c.run.emit(c.role, "output", "odoo", "Crushing Line 2 unblocked.");
      c.run.emit("system", "output", "supabase", "Incident closed. Audit trail complete.");
    }),
  ],
};

type Phase = { status: IncidentStatus; roles?: AgentRole[]; gate?: "approval" | "repair"; clock?: number; enter?: (r: MockRun, again: boolean) => void };
const PHASES: Phase[] = [
  { status: "TRIAGING", roles: ["triage"], enter: r => r.emit("system", "status", "agent37", "Triage session opened on plant instance plantapi-line2.") },
  { status: "PLANNING", roles: ["reliability", "materials", "production", "workforce"], enter: r => r.emit("system", "status", "agent37", "Four planner sessions opened in parallel.") },
  { status: "PLANNING", roles: ["coordinator", "risk"], enter: r => r.emit("system", "status", "agent37", "Coordinator and Risk sessions opened in parallel.") },
  { status: "WAITING_APPROVAL", gate: "approval", enter: r => { r.emit("system", "status", "slack", "Approval request sent to the maintenance supervisor.", { pri: "a" }); r.emit("system", "log", "agent37", "Backup checkpoint saved before execution."); } },
  { status: "EXECUTING", roles: ["procurement", "erp", "dispatch"], enter: r => r.emit("system", "status", "agent37", "Three execution sessions opened in parallel.") },
  { status: "WAITING_REPAIR", gate: "repair", clock: at(16, 52), enter: (r, again) => { if (!again) { r.emit("system", "log", "slack", "Courier delivered LC1D09BD to stores."); r.clock = at(18, 47); r.emit("system", "status", "slack", "Waiting for Sarah Chen to report the repair done.", { pri: "a" }); } } },
  { status: "VERIFYING", roles: ["verification"], clock: at(18, 52) },
  { status: "CLOSED", clock: at(18, 55) },
];

export class MockRun {
  view: IncidentView;
  clock = at(14, 2);
  phase = -1;
  playing = false;
  speed = 1;
  held: AgentRole | null = null;
  photo: "wrong" | "right" | null = null;
  flags = { wo: false, closed: false };
  plan = PLAN_TODAY;
  private steps: Partial<Record<AgentRole, { list: Step[]; i: number; wait: number }>> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private n = 0;

  constructor(private onChange: () => void) {
    this.view = { incident: baseIncident(), tasks: {}, events: [] };
    this.emit("system", "status", "slack", "CV-104 MTR OL TRIP · MCC-03 BKR 7. Shift supervisor posted a photo in #line2-maint.", { pri: 1 });
    this.emit("system", "log", "instacloud", "Photo archived to evidence storage. Policy: upload ALLOW.");
  }

  /* ----- emit contract rows ----- */
  emit(agent: AgentEvent["agent"], kind: AgentEvent["kind"], system: SystemName | null, message: string, data: Record<string, unknown> = {}) {
    this.view = { ...this.view, events: [...this.view.events, { id: "e" + this.n++, incident_id: MOCK_ID, agent, kind, system, message, data, created_at: new Date(this.clock).toISOString() }] };
  }
  patch(p: Partial<Incident>) { this.view = { ...this.view, incident: { ...this.view.incident, ...p, updated_at: new Date(this.clock).toISOString() } }; }
  private setTask(role: AgentRole, p: Partial<AgentTask>) {
    const prev = this.view.tasks[role] ?? { id: "t-" + role, incident_id: MOCK_ID, role, status: "QUEUED", input: {}, output: null, error: null, agent37_response_id: null, started_at: null, finished_at: null, created_at: new Date(this.clock).toISOString() } as AgentTask;
    this.view = { ...this.view, tasks: { ...this.view.tasks, [role]: { ...prev, ...p } } };
  }
  finish(role: AgentRole, output: unknown) { this.setTask(role, { status: "COMPLETE", output: output as Record<string, unknown>, finished_at: new Date(this.clock).toISOString() }); delete this.steps[role]; }
  fail(role: AgentRole, error: string) { this.setTask(role, { status: "FAILED", error, finished_at: new Date(this.clock).toISOString() }); delete this.steps[role]; }
  toRepairGate() { this.enter(5, true); }

  /* ----- phases ----- */
  private enter(i: number, again = false) {
    this.phase = i;
    const p = PHASES[i];
    if (p.clock && !(again && i === 5)) this.clock = Math.max(this.clock, p.clock);
    this.patch({ status: p.status });
    p.enter?.(this, again);
    if (p.gate || i === PHASES.length - 1) this.playing = false;
    for (const role of p.roles ?? []) {
      const list = SCRIPTS[role](this);
      this.steps[role] = { list, i: 0, wait: list[0].d };
      this.setTask(role, { status: "RUNNING", started_at: new Date(this.clock).toISOString(), finished_at: null, error: null, output: null });
      this.patch({ agent37_session_ids: { ...this.view.incident.agent37_session_ids, [role]: SID[role] } });
      this.emit(role, "status", "agent37", `session ${SID[role]} opened`, { quiet: true });
    }
  }
  private tick = () => {
    if (!this.playing) return;
    const dt = 100 * this.speed;
    this.clock += dt * 60; // one real second ≈ one plant minute
    let changed = false;
    for (const role of Object.keys(this.steps) as AgentRole[]) {
      const s = this.steps[role]!;
      if (this.held === role) continue;
      s.wait -= dt;
      while (this.steps[role] && s.wait <= 0 && s.i < s.list.length) {
        const phaseBefore = this.phase;
        s.list[s.i++].f({ role, run: this });
        changed = true;
        if (this.phase !== phaseBefore) break;
        if (s.i < s.list.length) s.wait += s.list[s.i].d;
      }
      if (this.steps[role] && s.i >= s.list.length) this.finish(role, this.view.tasks[role]?.output ?? {});
    }
    const p = PHASES[this.phase];
    if (p?.roles && p.roles.every(r => this.view.tasks[r]?.status !== "RUNNING") && !p.gate && this.view.incident.status !== "WAITING_REPAIR") {
      this.enter(this.phase + 1); changed = true;
    }
    if (changed || this.playing) this.onChange();
  };

  /* ----- controls ----- */
  play() {
    if (this.phase === -1) this.enter(0);
    const p = PHASES[this.phase];
    if (p?.gate || this.phase === PHASES.length - 1) return;
    this.playing = true;
    if (!this.timer) this.timer = setInterval(this.tick, 100);
    this.onChange();
  }
  pause() { this.playing = false; this.onChange(); }
  dispose() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  approve(decision: "approve" | "reject", note?: string) {
    if (this.phase !== 3) return;
    if (decision === "approve") {
      if (note?.startsWith("tmrw")) this.plan = PLAN_TMRW;
      this.patch({ status: "APPROVED", plan: this.plan });
      this.emit("human", "output", "slack", "Supervisor approved the plan.");
      this.emit("system", "log", "supabase", "Approval recorded with audit entry.");
      this.enter(4);
    } else {
      this.emit("human", "output", "slack", "Supervisor rejected the plan. Coordinator and Risk run again.", { pri: 2 });
      this.patch({ plan: null });
      this.enter(2);
    }
    this.play();
  }
  complete(photo: "wrong" | "right", notes: string) {
    if (this.phase !== 5) return;
    this.photo = photo;
    this.emit("human", "output", "slack", `Sarah Chen reported done: “${notes.slice(0, 60)}…”`);
    this.enter(6);
    this.play();
  }
}

/* ---------- contract-shaped fixtures ---------- */
const iso = (h: number, m: number) => new Date(at(h, m)).toISOString();
function baseIncident(): Incident {
  return {
    id: MOCK_ID, plant_id: "plant-crushing", asset_id: null, title: "CV-104 conveyor stopped: contactor burned",
    alarm_text: "14:02:17 CV-104 MTR OL TRIP · MCC-03 BKR 7", photo_url: null, status: "NEW",
    triage: null, materials: null, plan: null, erp: null, verification: null, agent37_session_ids: {},
    created_at: iso(14, 2), updated_at: iso(14, 2),
  };
}
const TRIAGE = {
  asset_id: "CV-104", failure_category: "electrical", suspected_component: "contactor", suspected_part: "LC1D09BD", confidence: 0.86,
  severity: "high", required_trade: "electrician", estimated_repair_minutes: 45, recommended_action: "Replace contactor under LOTO-CV104",
  summary: "Burned 3-pole contactor on the CV-104 starter in MCC-03 breaker 7; motor tripped on overload.",
} as const;
const RS = { supplier: "RS Components", part: "LC1D09BD", price: 29.49, currency: "USD", stock: 46, lead_time: "Courier today 17:00", url: PAGE_URL.rs_product, source: "browser" } as const;
const MATERIALS = { part: "LC1D09BD", internal_stock: 0, odoo_product_id: 12, monid_tool: "litescrape /google/shopping", suppliers: [RS], recommended_index: 0, summary: "None in stock; RS Components has 46, courier today 17:00." };
const PLAN_BASE = {
  asset_id: "CV-104", asset_name: "CV-104 Conveyor", diagnosis: "Burned contactor LC1D09BD on MCC-03 breaker 7", part: "LC1D09BD", internal_stock: 0, supplier: RS,
  technician: "Sarah Chen", technician_trade: "electrician", expected_downtime_minutes: 45, safety: ["LOTO-CV104 required"], confidence: 0.82,
  actions: [
    { action: "Buy LC1D09BD from RS Components ($29.49)", system: "rs", rule: "APPROVAL" },
    { action: "Block Crushing Line 2 in Odoo", system: "odoo", rule: "APPROVAL" },
    { action: "Create Fiix work order, assign Sarah Chen", system: "fiix", rule: "AUTO" },
    { action: "Book Sarah Chen, notify crew and supervisor", system: "google", rule: "AUTO" },
  ],
} as const;
const PLAN_TODAY = { ...PLAN_BASE, window_start: iso(18, 0), window_end: iso(20, 0), production_impact: "low", rationale: "Part arrives 17:00, Sarah Chen is the only cleared electrician and is free at 18:00, 18:00–20:00 is low impact, and the failure is recurring. Tomorrow 07:00 has the lowest impact but no cleared electrician." } as unknown as NonNullable<Incident["plan"]>;
const PLAN_TMRW = { ...PLAN_BASE, window_start: new Date(at(7, 0) + 864e5).toISOString(), window_end: new Date(at(9, 0) + 864e5).toISOString(), production_impact: "none", rationale: "Moved by the supervisor to tomorrow 07:00. Sarah Chen is busy then; Workforce must find another cleared electrician." } as unknown as NonNullable<Incident["plan"]>;
const ERP = { fiix_wo_code: "WO-1187", fiix_wo_status: "Assigned", odoo_block_ref: "mrp.workcenter.productivity/58", screenshot_path: null, summary: "WO-1187 assigned to Sarah Chen; Crushing Line 2 blocked 18:00–20:00." };
const VERIFY_REJECT = { verdict: "reject", reason: "Photo shows a CHNT NCH8-63 (63 A) contactor, not LC1D09BD (9 A).", fiix_closed: false, odoo_unblocked: false,
  checks: [{ name: "Part matches LC1D09BD", pass: false, detail: "Label reads CHNT NCH8-63 63 A" }, { name: "3-pole contactor installed", pass: true, detail: "Visible" }] } as unknown as NonNullable<Incident["verification"]>;
const VERIFY_ACCEPT = { verdict: "accept", reason: "New 3-pole TeSys-D contactor; part number LC1D09BD in notes and WO-1187.", fiix_closed: true, odoo_unblocked: true,
  checks: [{ name: "Part matches LC1D09BD", pass: true, detail: "Notes + WO-1187" }, { name: "No contradicting label", pass: true, detail: "None visible" }, { name: "Fiix WO closed", pass: true, detail: "WO-1187" }, { name: "Line 2 unblocked", pass: true, detail: "Odoo" }] } as unknown as NonNullable<Incident["verification"]>;
