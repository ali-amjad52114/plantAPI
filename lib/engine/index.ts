// S1/A4 implements. Signatures fixed by lib/contracts/interfaces.ts.
import type { Engine } from "@/lib/contracts/interfaces";

export const engine: Engine = {
  async start() { throw new Error("not implemented: engine.start"); },
  async approve() { throw new Error("not implemented: engine.approve"); },
  async complete() { throw new Error("not implemented: engine.complete"); },
};
