// S1/A2 implements. Signatures fixed by lib/contracts/interfaces.ts.
import type { Agent37Client } from "@/lib/contracts/interfaces";

export const agent37: Agent37Client = {
  async runTurn() { throw new Error("not implemented: agent37.runTurn"); },
  async uploadFile() { throw new Error("not implemented: agent37.uploadFile"); },
  async readFile() { throw new Error("not implemented: agent37.readFile"); },
  async exec() { throw new Error("not implemented: agent37.exec"); },
};
