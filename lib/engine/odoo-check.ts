// Backend referee for the Odoo line block (playbook: the agents do the work, the backend re-checks it).
// A block is an mrp.workcenter.productivity record on Crushing Line 2. For a FUTURE window the record
// carries date_start/date_end = the plan window and Odoo still shows the line "normal" until it starts —
// so we verify the record itself, not the line's current state. Odoo datetimes are naive UTC strings.
import { DEMO_WORKCENTER, odooCall } from "@/lib/tools/odoo";
import { checkBlockRecord, parseBlockRef, type BlockRecord } from "./odoo-check.pure";

async function readBlock(id: number): Promise<BlockRecord | null> {
  const rows = await odooCall<BlockRecord[]>("mrp.workcenter.productivity", "read", { ids: [id], fields: ["id", "workcenter_id", "date_start", "date_end"] });
  return rows[0] ?? null;
}

/** When the agent created the record but left odoo_block_ref empty: find the real one by line + window. */
export async function findBlockForWindow(windowStart: string): Promise<BlockRecord | null> {
  const ws = Date.parse(windowStart);
  const rows = await odooCall<BlockRecord[]>("mrp.workcenter.productivity", "search_read", {
    domain: [["workcenter_id.name", "=", DEMO_WORKCENTER]],
    fields: ["id", "workcenter_id", "date_start", "date_end"],
    order: "id desc",
    limit: 20,
  });
  return rows.find((r) => r.date_start && Math.abs(Date.parse(r.date_start.replace(" ", "T") + "Z") - ws) <= 5 * 60_000) ?? null;
}

/** ERP step: the block record exists on Crushing Line 2 and matches the plan window (±5 min). */
export async function verifyErpBlock(ref: string | null, plan: { window_start: string; window_end: string }): Promise<{ ref: string | null; problem: string | null; adopted: boolean }> {
  let id = parseBlockRef(ref);
  let adopted = false;
  if (id == null) {
    const found = await findBlockForWindow(plan.window_start);
    if (!found) return { ref, problem: `no Odoo block record on ${DEMO_WORKCENTER} for the plan window ${plan.window_start}`, adopted };
    id = found.id;
    adopted = true;
  }
  const rec = await readBlock(id);
  const problem = rec ? checkBlockRecord(rec, plan, Date.now(), DEMO_WORKCENTER) : `Odoo block record ${id} not found`;
  return { ref: `mrp.workcenter.productivity:${id}`, problem, adopted };
}

/** Verification accept: the SAME block record is ended (date_end set, not in the future). */
export async function verifyUnblocked(ref: string | null): Promise<string | null> {
  const id = parseBlockRef(ref);
  if (id == null) return "no Odoo block record to unblock (erp.odoo_block_ref empty)";
  const rec = await readBlock(id);
  if (!rec) return `Odoo block record ${id} not found`;
  if (!rec.date_end) return `Odoo block record ${id} is still open (no date_end)`;
  const end = Date.parse(rec.date_end.replace(" ", "T") + "Z");
  return end > Date.now() + 5 * 60_000 ? `Odoo block record ${id} still ends in the future (${rec.date_end} UTC)` : null;
}
