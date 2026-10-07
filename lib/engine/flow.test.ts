import { describe, expect, it } from "vitest";
import { afterApproval, afterTask } from "./flow";
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
