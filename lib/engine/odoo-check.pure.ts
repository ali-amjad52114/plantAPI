// Pure parts of odoo-check.ts (unit-tested without Odoo).
export type BlockRecord = { id: number; workcenter_id: [number, string] | false; date_start: string | false; date_end: string | false };

/** "mrp.workcenter.productivity:6" | "mrp.workcenter.productivity/6" | "6" → 6 */
export function parseBlockRef(ref: string | null | undefined): number | null {
  const m = String(ref ?? "").match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

const odooUtc = (s: string) => Date.parse(s.replace(" ", "T") + "Z");
const TOL = 5 * 60_000;

/** Record must be on the line and match the window (±5 min, UTC); it must be active now only once the window started. */
export function checkBlockRecord(rec: BlockRecord, plan: { window_start: string; window_end: string }, now: number, workcenter: string): string | null {
  const wcName = rec.workcenter_id ? rec.workcenter_id[1] : "";
  if (wcName !== workcenter) return `Odoo block record ${rec.id} is on "${wcName}", not ${workcenter}`;
  if (!rec.date_start) return `Odoo block record ${rec.id} has no start`;
  const ws = Date.parse(plan.window_start);
  const we = Date.parse(plan.window_end);
  const rs = odooUtc(rec.date_start);
  if (Math.abs(rs - ws) > TOL) return `Odoo block ${rec.id} starts ${rec.date_start} UTC, plan window starts ${new Date(ws).toISOString()}`;
  if (rec.date_end) {
    const re = odooUtc(rec.date_end);
    if (Math.abs(re - we) > TOL) return `Odoo block ${rec.id} ends ${rec.date_end} UTC, plan window ends ${new Date(we).toISOString()}`;
    if (now >= ws && now > re) return `Odoo block ${rec.id} already ended`;
  }
  return null;
}
