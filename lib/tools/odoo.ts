// Odoo verifier + demo helpers via the Odoo JSON-2 API (POST /json/2/<model>/<method>, bearer API key).
// Blocking model (verified on evr52114, Odoo 20.0+e): a work centre is "blocked" while it has an open
// mrp.workcenter.productivity record (date_end empty) whose loss is not "productive"; Odoo then computes
// mrp.workcenter.working_state = "blocked". Unblock = write date_end on the open records
// (mrp.workcenter.button_unblock is not exposed over JSON-2 in 20.0: 404).
// Writes are restricted to the demo work centre "Crushing Line 2".
import type { OdooReader } from "@/lib/contracts/interfaces";

export const DEMO_WORKCENTER = "Crushing Line 2";
export const DEMO_PART = "LC1D09BD";
const BLOCK_LOSS = "Equipment Failure";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export class OdooError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** One JSON-2 call. Retries network errors / 5xx at most 2 times. Never logs the key. */
export async function odooCall<T = unknown>(model: string, method: string, body: Record<string, unknown>): Promise<T> {
  const url = `${env("ODOO_URL").replace(/\/$/, "")}/json/2/${model}/${method}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `bearer ${env("ODOO_API_KEY")}`,
          ...(process.env.ODOO_DB ? { "X-Odoo-Database": process.env.ODOO_DB } : {}),
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text.slice(0, 300);
        try {
          msg = (JSON.parse(text) as { message?: string }).message ?? msg;
        } catch {}
        const err = new OdooError(`odoo ${model}.${method} ${res.status}: ${msg}`, res.status);
        if (res.status < 500) throw err; // client errors are not retried
        lastErr = err;
        continue;
      }
      return JSON.parse(text) as T;
    } catch (e) {
      if (e instanceof OdooError && e.status < 500) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function workcenterByName(name: string): Promise<{ id: number; working_state: string } | null> {
  const rows = await odooCall<Array<{ id: number; working_state: string }>>("mrp.workcenter", "search_read", {
    domain: [["name", "=", name]],
    fields: ["id", "working_state"],
    limit: 1,
  });
  return rows[0] ?? null;
}

async function openBlocks(workcenterId: number): Promise<Array<{ id: number; loss_id: [number, string] }>> {
  return odooCall("mrp.workcenter.productivity", "search_read", {
    domain: [
      ["workcenter_id", "=", workcenterId],
      ["date_end", "=", false],
      ["loss_type", "!=", "productive"],
    ],
    fields: ["id", "loss_id"],
    order: "id desc",
  });
}

function assertDemo(name: string) {
  if (name !== DEMO_WORKCENTER) throw new Error(`odoo writes allowed only on "${DEMO_WORKCENTER}", got "${name}"`);
}

export const odoo: OdooReader = {
  async stock(defaultCode) {
    const rows = await odooCall<Array<{ id: number; qty_available: number }>>("product.product", "search_read", {
      domain: [["default_code", "=", defaultCode]],
      fields: ["id", "qty_available"],
      limit: 1,
    });
    const p = rows[0];
    return p ? { productId: p.id, qty: p.qty_available } : null;
  },

  async workcenterBlocked(workcenterName) {
    const wc = await workcenterByName(workcenterName);
    if (!wc) throw new Error(`odoo work centre not found: ${workcenterName}`);
    const open = await openBlocks(wc.id);
    const blocked = wc.working_state === "blocked" || open.length > 0;
    return { blocked, ref: open[0] ? `mrp.workcenter.productivity:${open[0].id}` : null };
  },
};

/** Blocks the demo work centre. Idempotent: returns the existing open block if there is one. */
export async function blockWorkcenter(
  workcenterName: string = DEMO_WORKCENTER,
  description = "PlantAPI: CV-104 contactor failure - line blocked pending repair",
): Promise<{ workcenterId: number; productivityId: number; ref: string; created: boolean }> {
  assertDemo(workcenterName);
  const wc = await workcenterByName(workcenterName);
  if (!wc) throw new Error(`odoo work centre not found: ${workcenterName}`);
  const open = await openBlocks(wc.id);
  if (open[0]) return { workcenterId: wc.id, productivityId: open[0].id, ref: `mrp.workcenter.productivity:${open[0].id}`, created: false };
  const losses = await odooCall<Array<{ id: number }>>("mrp.workcenter.productivity.loss", "search_read", {
    domain: [["name", "=", BLOCK_LOSS]],
    fields: ["id"],
    limit: 1,
  });
  if (!losses[0]) throw new Error(`odoo loss reason not found: ${BLOCK_LOSS}`);
  const ids = await odooCall<number[]>("mrp.workcenter.productivity", "create", {
    vals_list: [{ workcenter_id: wc.id, loss_id: losses[0].id, description }],
  });
  const id = ids[0];
  return { workcenterId: wc.id, productivityId: id, ref: `mrp.workcenter.productivity:${id}`, created: true };
}

/** Unblocks the demo work centre (closes all open block records). Returns the closed record ids. */
export async function unblockWorkcenter(workcenterName: string = DEMO_WORKCENTER): Promise<{ workcenterId: number; closedIds: number[] }> {
  assertDemo(workcenterName);
  const wc = await workcenterByName(workcenterName);
  if (!wc) throw new Error(`odoo work centre not found: ${workcenterName}`);
  const open = await openBlocks(wc.id);
  if (open.length === 0) return { workcenterId: wc.id, closedIds: [] };
  // Odoo 20 has no public mrp.workcenter.button_unblock; closing the open records is the same effect.
  const now = new Date().toISOString().replace("T", " ").slice(0, 19); // UTC, Odoo datetime format
  await odooCall("mrp.workcenter.productivity", "write", { ids: open.map((o) => o.id), vals: { date_end: now } });
  return { workcenterId: wc.id, closedIds: open.map((o) => o.id) };
}
