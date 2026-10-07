// S1/A3 implements. Signatures fixed by lib/contracts/interfaces.ts.
import type { AiGateway } from "@/lib/contracts/interfaces";

export const ai: AiGateway = {
  async chat() { throw new Error("not implemented: ai.chat"); },
  async chatJSON() { throw new Error("not implemented: ai.chatJSON"); },
  async parseAgentOutput() { throw new Error("not implemented: ai.parseAgentOutput"); },
};
