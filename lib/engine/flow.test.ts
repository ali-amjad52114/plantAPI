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
    expect(checkOutput("coordinator", { supplier: { supplier: "Schneider Electric UK", price: 82.45, url: "https://se.com/x" }, window_start: "2026-10-07T18:00:00", window_end: "2026-10-07T19:00:00" }, { materials })).toBeNull();
  });
  it("rejects ERP without a Fiix WO and accept without close", () => {
    expect(checkOutput("erp", { fiix_wo_code: "" }, { materials: null })).toMatch(/no Fiix/);
    expect(checkOutput("erp", { fiix_wo_code: "WO-1", odoo_block_ref: null }, { materials: null })).toMatch(/not blocked/);
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
  it("approval runs erp ∥ procurement ∥ dispatch with the flag, erp alone without", () => {
    expect(approvalSteps("approve", true)).toEqual({ status: "EXECUTING", next: ["erp", "procurement", "dispatch"] });
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
    expect(checkOutput("coordinator", { supplier: { supplier: "RS", price: 1, url: "u" }, window_start: "2026-10-07T18:35:00-04:00", window_end: "2026-10-07T19:20:00-04:00" }, { materials })).toBeNull();
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
