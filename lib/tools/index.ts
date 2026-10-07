// S2 implements independent verifiers. Signatures fixed by lib/contracts/interfaces.ts.
import type { FiixChecker } from "@/lib/contracts/interfaces";

export { odoo, blockWorkcenter, unblockWorkcenter } from "./odoo";
export const fiix: FiixChecker = {
  async screenshotWorkOrder() { throw new Error("not implemented: fiix.screenshotWorkOrder"); },
};
