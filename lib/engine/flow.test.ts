import { describe, expect, it } from "vitest";
import { afterApproval, afterTask, checkOutput } from "./flow";
import { buildTaskText } from "./prompts";
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
    expect(checkOutput("coordinator", { supplier: { supplier: "Schneider Electric UK", price: 82.45, url: "https://se.com/x" } }, { materials })).toBeNull();
  });
  it("rejects ERP without a Fiix WO and accept without close", () => {
    expect(checkOutput("erp", { fiix_wo_code: "" }, { materials: null })).toMatch(/no Fiix/);
    expect(checkOutput("verification", { verdict: "accept", fiix_closed: false }, { materials: null })).toMatch(/not closed/);
    expect(checkOutput("verification", { verdict: "reject", fiix_closed: false }, { materials: null })).toBeNull();
  });
});
