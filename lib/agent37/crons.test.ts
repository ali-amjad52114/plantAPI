import { describe, expect, it } from "vitest";
import { lastAssistantText, oneShotSchedule } from "./crons";

describe("agent37 crons", () => {
  it("one-shot schedule is minute hour day month * in UTC", () => {
    expect(oneShotSchedule(new Date("2026-10-07T22:41:00Z"))).toBe("41 22 7 10 *");
  });
  it("reads the agent's reply, not the prompt that contains the same JSON keys", () => {
    const session = { history: [{ role: "user", content: '{"ack_received": true|false}' }, { role: "assistant", content: 'Checked.\n{"ack_received":false,"evidence":"no reply"}' }] };
    expect(lastAssistantText(session)).toContain('"evidence":"no reply"');
    expect(lastAssistantText({ history: [{ role: "user", content: "x" }] })).toBeNull();
  });
});
