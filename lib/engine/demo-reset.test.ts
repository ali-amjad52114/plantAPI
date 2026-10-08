import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ supabaseAdmin: () => ({}) }));
import { resetOutcome } from "./demo-reset";

describe("demo reset outcome (S2 returns, does not throw)", () => {
  it("refused → refused with the live incidents", () => {
    const o = resetOutcome({ refused: true, live: [{ id: "c62334f1-aaaa", status: "EXECUTING" }], steps: { guard: { status: "error", detail: "refused" } }, ok: false });
    expect(o).toEqual({ status: "refused", summary: null, error: "refused: 1 live incident(s): c62334f1 EXECUTING; use Force reset" });
  });
  it("ok:false → failed with the failing step", () => {
    const o = resetOutcome({ refused: false, live: [], ok: false, steps: { guard: { status: "ok", detail: "no live" }, fiix: { status: "error", detail: "login failed" }, summary: { status: "error", detail: "demo reset incomplete" } } });
    expect(o).toEqual({ status: "failed", summary: "demo reset incomplete", error: "fiix: login failed" });
  });
  it("ok → done with steps.summary.detail, never undefined", () => {
    expect(resetOutcome({ refused: false, ok: true, steps: { summary: { status: "ok", detail: "demo reset complete" } } })).toEqual({ status: "done", summary: "demo reset complete", error: null });
    expect(resetOutcome({ ok: true }).summary).toBe("demo reset complete");
  });
});
