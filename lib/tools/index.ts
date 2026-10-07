// S2 implements independent verifiers. Signatures fixed by lib/contracts/interfaces.ts.
import type { FiixChecker, OdooReader } from "@/lib/contracts/interfaces";

export const odoo: OdooReader = {
  async stock() { throw new Error("not implemented: odoo.stock"); },
  async workcenterBlocked() { throw new Error("not implemented: odoo.workcenterBlocked"); },
};
export const fiix: FiixChecker = {
  async screenshotWorkOrder() { throw new Error("not implemented: fiix.screenshotWorkOrder"); },
};
