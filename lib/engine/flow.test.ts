import { describe, expect, it } from "vitest";
import { afterApproval, afterTask, approvalSteps, checkOutput, nextSteps, plannerFailureIsFatal } from "./flow";
import { ProcurementOutput, RiskOutput } from "./wave-a-schemas";
import { buildTaskText, productionBrief, workforceBrief } from "./prompts";
import type { Incident } from "../contracts/types";

describe("slice 1 flow", () => {
  it("walks triage → materials → coordinator → approval", () => {
    expect(afterTask("triage")).toEqual({ status: "PLANNING", next: "materials" });
    expect(afterTask("materials")).toEqual({ status: "PLANNING", next: "coordinator" });
    expect(afterTask("coordinator")).toEqual({ status: "WAITING_APPROVAL", next: null });
  });
  it("approval runs ERP, rejection stops", () => {
    expect(afterApproval("approve")).toEqual({ status: "EXECUTING", next: "erp" });
    expect(afterApproval("reject")).toEqual({ status: "REJECTED", next: null });
    expect(afterTask("erp").status).toBe("WAITING_REPAIR");
  });
  it("verification accept closes, reject goes back to repair", () => {
    expect(afterTask("verification", { verdict: "accept" }).status).toBe("CLOSED");
    expect(afterTask("verification", { verdict: "reject" }).status).toBe("WAITING_REPAIR");
  });
  it("task text carries context and the output schema", () => {
    const text = buildTaskText("triage", { id: "i1", alarm_text: "CV-104 trip", photo_url: null } as unknown as Incident);
    expect(text).toContain("CV-104 trip");
    expect(text).toContain("failure_category");
  });
});

describe("real-only guards", () => {
  const materials = { suppliers: [{ supplier: "Schneider Electric UK", price: 82.45, url: "https://se.com/x" }] } as any;
  it("rejects a plan supplier that Materials never found", () => {
    expect(checkOutput("coordinator", { supplier: { supplier: "RS Components", price: 29.49, url: "https://rs/x" } }, { materials })).toMatch(/not one of/);
    expect(checkOutput("coordinator", { supplier: { supplier: "Schneider Electric UK", price: 82.45, url: "https://se.com/x" }, window_start: "2030-10-07T18:00:00", window_end: "2030-10-07T19:00:00" }, { materials })).toBeNull();
  });
  it("rejects ERP without a Fiix WO and accept without close", () => {
    expect(checkOutput("erp", { fiix_wo_code: "" }, { materials: null })).toMatch(/no Fiix/);
    expect(checkOutput("erp", { fiix_wo_code: "WO-1", odoo_block_ref: "42" }, { materials: null })).toBeNull();
    expect(checkOutput("verification", { verdict: "accept", fiix_closed: false }, { materials: null })).toMatch(/not closed/);
    expect(checkOutput("verification", { verdict: "reject", fiix_closed: false }, { materials: null })).toBeNull();
  });
});

describe("wave A full team", () => {
  it("triage fans out to four planners in parallel", () => {
    expect(nextSteps("triage", {}, true)).toEqual({ status: "PLANNING", next: ["reliability", "materials", "production", "workforce"] });
  });
  it("coordinator starts only when all four planners settled", () => {
    expect(nextSteps("production", {}, true, ["reliability", "production"]).next).toEqual([]);
    expect(nextSteps("workforce", {}, true, ["reliability", "materials", "production", "workforce"]).next).toEqual(["coordinator"]);
  });
  it("coordinator → risk → approval, DENY rejects", () => {
    expect(nextSteps("coordinator", {}, true)).toEqual({ status: "PLANNING", next: ["risk"] });
    expect(nextSteps("risk", { decision: "APPROVAL" }, true)).toEqual({ status: "WAITING_APPROVAL", next: [] });
    expect(nextSteps("risk", { decision: "DENY" }, true)).toEqual({ status: "REJECTED", next: [] });
  });
  it("slice path unchanged when the flag is off", () => {
    expect(nextSteps("triage", {}, false)).toEqual({ status: "PLANNING", next: ["materials"] });
    expect(nextSteps("coordinator", {}, false)).toEqual({ status: "WAITING_APPROVAL", next: [] });
  });
  it("only a failed Materials planner is fatal", () => {
    expect(plannerFailureIsFatal("reliability", true)).toBe(false);
    expect(plannerFailureIsFatal("materials", true)).toBe(true);
    expect(plannerFailureIsFatal("reliability", false)).toBe(true);
  });
  it("wave A schemas parse a realistic risk output", () => {
    const r = RiskOutput.safeParse({ decision: "APPROVAL", loto_required: true, hazards: ["480 V"], actions: [{ action: "Block Line 2", system: "odoo", rule: "APPROVAL", reason: "production block" }], summary: "ok" });
    expect(r.success).toBe(true);
    expect(buildTaskText("risk", { id: "i", alarm_text: "", photo_url: null } as unknown as Incident)).toContain("loto_required");
  });
});

describe("wave A execution", () => {
  it("dispatch starts only after erp completes", () => {
    expect(nextSteps("erp", {}, true, ["erp"])).toEqual({ status: "EXECUTING", next: ["dispatch"] });
    expect(nextSteps("procurement", {}, true, ["procurement"])).toEqual({ status: "EXECUTING", next: [] });
    expect(nextSteps("erp", {}, true, ["erp", "dispatch"]).next).toEqual([]);
  });
  it("approval runs erp ∥ procurement ∥ dispatch with the flag, erp alone without", () => {
    expect(approvalSteps("approve", true)).toEqual({ status: "EXECUTING", next: ["erp", "procurement"] });
    expect(approvalSteps("approve", false)).toEqual({ status: "EXECUTING", next: ["erp"] });
    expect(approvalSteps("reject", true)).toEqual({ status: "REJECTED", next: [] });
  });
  it("waits for all three executors before WAITING_REPAIR", () => {
    expect(nextSteps("erp", {}, true, ["erp"]).status).toBe("EXECUTING");
    expect(nextSteps("dispatch", {}, true, ["erp", "procurement", "dispatch"]).status).toBe("WAITING_REPAIR");
    expect(nextSteps("erp", {}, false).status).toBe("WAITING_REPAIR");
  });
  it("only a failed ERP executor is fatal", () => {
    expect(plannerFailureIsFatal("procurement", true)).toBe(false);
    expect(plannerFailureIsFatal("dispatch", true)).toBe(false);
    expect(plannerFailureIsFatal("erp", true)).toBe(true);
  });
  it("procurement can never report a purchase", () => {
    expect(ProcurementOutput.safeParse({ supplier: "RS", part: "LC1D09BD", price: 1, currency: "USD", supplier_record_ref: null, expedite_email: null, purchased: true, blocked: [], summary: "" }).success).toBe(false);
  });
});

describe("cost per incident", () => {
  it("accumulates usage deltas per busy period", async () => {
    const { addSpend } = await import("./cost.pure");
    const a = addSpend(null, 120_000, false);
    const b = addSpend(a, 30_000, true);
    expect([a.agent37_usd, b.agent37_usd, b.periods, b.shared_instance]).toEqual([0.12, 0.15, 2, true]);
  });
});

describe("production/workforce sources", () => {
  it("use the real Sheet/Calendar when their ids are set, seed bridge otherwise", () => {
    delete process.env.PLANTAPI_SCHEDULE_SHEET_ID;
    expect(productionBrief()).toContain("Sheets not connected");
    process.env.PLANTAPI_SCHEDULE_SHEET_ID = "sheet123";
    process.env.PLANTAPI_CALENDAR_ID = "cal456";
    expect(productionBrief()).toContain("google-sheets:sheet123");
    expect(workforceBrief()).toContain("google-calendar:cal456");
    delete process.env.PLANTAPI_SCHEDULE_SHEET_ID;
    delete process.env.PLANTAPI_CALENDAR_ID;
  });
});

describe("coordinator is real only", () => {
  it("never mentions seed files and carries only triage, materials and team", () => {
    const text = buildTaskText("coordinator", { id: "i", alarm_text: "a", photo_url: "p", triage: { t: 1 }, materials: { m: 1 }, plan: { x: 1 } } as unknown as Incident, { team: { workforce: { technician: "Sarah Chen" } } });
    expect(text).not.toMatch(/seed_file|calendar_events|production_schedule|Seed:/);
    expect(text).toContain("Never read ~/plantapi/seed");
    expect(text).toContain("Sarah Chen");
    expect(text).not.toContain('"plan"');
  });
  it("workforce must read the configured calendar, not primary, with no seed fallback", () => {
    process.env.PLANTAPI_CALENDAR_ID = "cal@group.calendar.google.com";
    expect(buildTaskText("workforce", { id: "i" } as unknown as Incident)).toContain("ONLY from Google Calendar id `cal@group.calendar.google.com` (NOT `primary`)");
    delete process.env.PLANTAPI_CALENDAR_ID;
  });
});

describe("coordinator window is never blank", () => {
  it("rejects a plan without a window", () => {
    const materials = { suppliers: [{ supplier: "RS", price: 1, url: "u" }] } as any;
    expect(checkOutput("coordinator", { supplier: { supplier: "RS", price: 1, url: "u" }, window_start: "", window_end: "" }, { materials })).toMatch(/window_start is blank/);
    expect(checkOutput("coordinator", { supplier: { supplier: "RS", price: 1, url: "u" }, window_start: "2030-10-07T18:35:00-04:00", window_end: "2030-10-07T19:20:00-04:00" }, { materials })).toBeNull();
  });
});

describe("no-ack follow-up", () => {
  it("is a Slack reminder + Gmail notice, never a call", async () => {
    process.env.PLANTAPI_NOTICE_EMAIL = "ops@example.com";
    const { reminderAction } = await import("./depth.pure");
    const a = reminderAction();
    expect(a).toContain("#plant-ops");
    expect(a).toContain("ops@example.com");
    expect(a).toMatch(/Do NOT place any phone call/);
    delete process.env.PLANTAPI_NOTICE_EMAIL;
  });
});

describe("dispatch on a conditional plan", () => {
  it("still books + notifies and @-mentions the stand-in", () => {
    process.env.PLANTAPI_NOTICE_EMAIL = "me@example.com";
    const t = buildTaskText("dispatch", { id: "i" } as unknown as Incident);
    expect(t).toContain("is still an approved plan");
    expect(t).toContain("me@example.com");
    delete process.env.PLANTAPI_NOTICE_EMAIL;
  });
});

describe("mojibake repair", () => {
  it("re-decodes cp1252-mangled UTF-8 and leaves good text alone", async () => {
    const { fixMojibake, deepFixText } = await import("./text.pure");
    expect(fixMojibake("18:47â€“19:32")).toBe("18:47–19:32");
    expect(fixMojibake("Sarah Chen â€” reminder")).toBe("Sarah Chen — reminder");
    expect(fixMojibake("18:00–19:00 café")).toBe("18:00–19:00 café");
    expect(deepFixText({ notices: [{ detail: "18:47â€“19:32" }] })).toEqual({ notices: [{ detail: "18:47–19:32" }] });
  });
});

describe("odoo block check", () => {
  it("accepts a future-window record and checks bounds in UTC", async () => {
    const { checkBlockRecord, parseBlockRef } = await import("./odoo-check.pure");
    const plan = { window_start: "2026-10-07T18:47:00-04:00", window_end: "2026-10-07T19:32:00-04:00" };
    const rec = { id: 6, workcenter_id: [3, "Crushing Line 2"] as [number, string], date_start: "2026-10-07 22:47:00", date_end: "2026-10-07 23:32:00" };
    const before = Date.parse("2026-10-07T19:53:00Z"); // 15:53 -04:00: window not started, line still "normal"
    expect(checkBlockRecord(rec, plan, before, "Crushing Line 2")).toBeNull();
    expect(checkBlockRecord({ ...rec, date_start: "2026-10-07 21:00:00" }, plan, before, "Crushing Line 2")).toMatch(/starts/);
    expect(checkBlockRecord({ ...rec, workcenter_id: [9, "Line 1"] }, plan, before, "Crushing Line 2")).toMatch(/not Crushing Line 2/);
    expect(parseBlockRef("mrp.workcenter.productivity:6")).toBe(6);
    expect(parseBlockRef(null)).toBeNull();
  });
});

describe("window long enough for the repair", () => {
  it("rejects a 28 min window for a 45 min repair", () => {
    const materials = { suppliers: [{ supplier: "RS", price: 1, url: "u" }] } as any;
    const triage = { estimated_repair_minutes: 45 } as any;
    const sup = { supplier: "RS", price: 1, url: "u" };
    expect(checkOutput("coordinator", { supplier: sup, window_start: "2030-10-07T19:32:00-04:00", window_end: "2030-10-07T20:00:00-04:00" }, { materials, triage })).toMatch(/28 min but triage estimates 45/);
    expect(checkOutput("coordinator", { supplier: sup, window_start: "2030-10-07T18:00:00-04:00", window_end: "2030-10-07T18:45:00-04:00" }, { materials, triage })).toBeNull();
  });
});

describe("stale plans", () => {
  it("refuses old-rules plans, ended windows and too little time left", async () => {
    const { stalePlanReason, PLAN_RULES_VERSION } = await import("./flow");
    const plan = { window_start: "2026-10-07T18:00:00-04:00", window_end: "2026-10-07T19:00:00-04:00" };
    const at = (iso: string) => Date.parse(iso);
    expect(stalePlanReason(plan, 45, undefined, at("2026-10-07T21:00:00Z"))).toMatch(/older engine rules/);
    expect(stalePlanReason(plan, 45, PLAN_RULES_VERSION, at("2026-10-07T23:32:29Z"))).toMatch(/ended/); // c62334f1
    expect(stalePlanReason(plan, 45, PLAN_RULES_VERSION, at("2026-10-07T22:30:00Z"))).toMatch(/only 30 min/);
    expect(stalePlanReason(plan, 45, PLAN_RULES_VERSION, at("2026-10-07T21:00:00Z"))).toBeNull();
  });
});

describe("workforce conflicts are hard limits", () => {
  const conflicts = [
    "2026-10-07 18:47-19:32 Sarah Chen: CV-104 KM104 replacement - LOTO", // leftover, ended
    "2026-10-08 07:00-12:00 Sarah Chen: Arc-flash training (off site)",
  ];
  const team = { workforce: { available_from: "2026-10-07T21:05:00-04:00", conflicts } };
  const materials = { suppliers: [{ supplier: "RS", price: 1, url: "u" }] } as any;
  const triage = { estimated_repair_minutes: 60 } as any;
  const sup = { supplier: "RS", price: 1, url: "u" };
  const now = Date.parse("2026-10-07T20:20:00-04:00");
  it("rejects f9b6c751's plan (tomorrow 07:00, during training)", () => {
    expect(checkOutput("coordinator", { supplier: sup, window_start: "2026-10-08T11:00:00Z", window_end: "2026-10-08T12:00:00Z" }, { materials, triage }, now, team)).toMatch(/Arc-flash training/);
  });
  it("accepts tomorrow after training and ignores leftover past bookings", () => {
    expect(checkOutput("coordinator", { supplier: sup, window_start: "2026-10-08T12:00:00-04:00", window_end: "2026-10-08T13:00:00-04:00" }, { materials, triage }, now, team)).toBeNull();
  });
  it("rejects a window before the technician is available, and NO FEASIBLE WINDOW fails loudly", () => {
    expect(checkOutput("coordinator", { supplier: sup, window_start: "2026-10-07T20:30:00-04:00", window_end: "2026-10-07T21:30:00-04:00" }, { materials, triage }, now, team)).toMatch(/before the technician is available/);
    expect(checkOutput("coordinator", { supplier: sup, window_start: "", window_end: "", rationale: "NO FEASIBLE WINDOW: Sarah booked all week" }, { materials, triage }, now, team)).toMatch(/needs replanning/);
  });
});

describe("plant time for agents", () => {
  it("rewrites Z timestamps to plant time with the DST-correct offset", async () => {
    const { toPlantIso, deepPlantTime } = await import("./time.pure");
    expect(toPlantIso("2026-10-08T11:00:00Z")).toBe("2026-10-08T07:00:00-04:00"); // f9b6c751's window
    expect(toPlantIso("2026-12-08T12:00:00Z")).toBe("2026-12-08T07:00:00-05:00"); // EST in winter
    expect(deepPlantTime({ plan: { window_start: "2026-10-08T11:00:00Z", note: "18:00 local" }, n: 1 })).toEqual({ plan: { window_start: "2026-10-08T07:00:00-04:00", note: "18:00 local" }, n: 1 });
  });
  it("stale-plan check refuses plans from older rules (f9b6c751 was approved on .4)", async () => {
    const { stalePlanReason } = await import("./flow");
    expect(stalePlanReason({ window_start: "2030-10-08T12:00:00-04:00", window_end: "2030-10-08T13:00:00-04:00" }, 60, "2026-10-07.4", Date.now())).toMatch(/older engine rules/);
  });
});

describe("required plan actions", () => {
  it("adds the Odoo block and Fiix WO steps when missing (f9b6c751's plan had neither as such)", async () => {
    const { ensureRequiredActions } = await import("./flow");
    const r = ensureRequiredActions({ asset_id: "CV-104", actions: [{ action: "Schedule outage", system: "google", rule: "APPROVAL" }, { action: "Inspect/replace contactor", system: "fiix", rule: "AUTO" }] });
    expect(r.added).toEqual(["Block Crushing Line 2 work centre in Odoo for the window", "Create Fiix work order on CV-104"]);
    expect(r.plan.actions).toContainEqual({ action: "Block Crushing Line 2 work centre in Odoo for the window", system: "odoo", rule: "APPROVAL" });
    const ok = ensureRequiredActions({ asset_id: "CV-104", actions: [{ action: "Create Fiix work order on CV-104", system: "fiix", rule: "AUTO" }, { action: "Block Crushing Line 2 in Odoo", system: "odoo", rule: "APPROVAL" }] });
    expect(ok.added).toEqual([]);
  });
});
