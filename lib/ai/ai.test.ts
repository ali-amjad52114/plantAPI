import { describe, expect, it } from "vitest";
import { createAiGateway, extractLastJson, type ResponsesLike } from "./index";

const triage = {
  asset_id: "CV-104",
  failure_category: "electrical",
  suspected_component: "contactor",
  suspected_part: "LC1D09BD",
  confidence: 0.9,
  severity: "high",
  required_trade: "electrician",
  estimated_repair_minutes: 45,
  recommended_action: "Replace KM104 contactor",
  summary: "Burned contactor {see photo}",
};

function fakeClient(replies: string[]): ResponsesLike & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    responses: {
      async create(body: any) {
        calls.push(body);
        return { output_text: replies.shift() ?? "" };
      },
    },
  };
}

describe("extractLastJson", () => {
  it("returns the last top-level object, handling fences and braces in strings", () => {
    const text = `First {"a":1}. Then:\n\`\`\`json\n${JSON.stringify(triage, null, 2)}\n\`\`\`\nDone. {not json`;
    expect(extractLastJson(text)).toEqual(triage);
    expect(extractLastJson('{"x":{"y":"}"}}')).toEqual({ x: { y: "}" } });
    expect(extractLastJson("no json here")).toBeNull();
  });
});

describe("gateway with fake client", () => {
  it("parseAgentOutput triage happy path makes no call", async () => {
    const c = fakeClient([]);
    const ai = createAiGateway({ client: c });
    const out = await ai.parseAgentOutput("triage", `Analysis...\n${JSON.stringify(triage)}`);
    expect(out.suspected_part).toBe("LC1D09BD");
    expect(c.calls.length).toBe(0);
  });

  it("chatJSON retries once with the validation error, then throws", async () => {
    const bad = JSON.stringify({ ...triage, confidence: 5 });
    const c = fakeClient([bad, JSON.stringify(triage)]);
    const ai = createAiGateway({ client: c });
    const { TriageOutput } = await import("../contracts/types");
    await expect(ai.chatJSON("x", TriageOutput)).resolves.toEqual(triage);
    expect(c.calls.length).toBe(2);
    expect(c.calls[1].input).toContain("confidence");

    const c2 = fakeClient([bad, bad, bad]);
    await expect(createAiGateway({ client: c2 }).chatJSON("x", TriageOutput)).rejects.toThrow(/after retry/);
    expect(c2.calls.length).toBe(2);
  });
});
