// C3 Monid supplier search. Real Monid API only (litescrape /google/shopping, $0.00015/call).
import { SupplierOption } from "@/lib/contracts/types";

export const MONID_TOOL = { provider: "litescrape", endpoint: "/google/shopping" } as const;
export const MONID_TOOL_LABEL = `${MONID_TOOL.provider} ${MONID_TOOL.endpoint}`;
const API = process.env.MONID_BASE_URL || "https://api.monid.ai";

type ShoppingResult = {
  title: string;
  source?: string;
  extracted_price?: number;
  price?: string;
  delivery?: string;
  product_link?: string;
  second_hand_condition?: string;
  position?: number;
};
export type ShoppingResponse = { shopping_results?: ShoppingResult[] };

async function call(method: string, path: string, body?: unknown) {
  const key = process.env.MONID_API_KEY;
  if (!key) throw new Error("MONID_API_KEY missing");
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Monid ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** One paid call (~$0.00015). Returns the raw provider output (shopping response). */
export async function runShoppingSearch(part: string, q = `${part} RS Components`, timeoutMs = 90_000): Promise<{ raw: ShoppingResponse; runId: string; cost: number | null }> {
  let run = await call("POST", "/v1/run", {
    ...MONID_TOOL,
    input: { queryParams: { q, num: 20, gl: "us", hl: "en" } },
  });
  const t0 = Date.now();
  while (!["COMPLETED", "FAILED", "BLOCKED", "STOPPED", "TIMED_OUT"].includes(run.status)) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`Monid run ${run.runId} still ${run.status} after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 2000));
    run = await call("GET", `/v1/runs/${encodeURIComponent(run.runId)}`);
  }
  if (run.status !== "COMPLETED") throw new Error(`Monid run ${run.runId} ${run.status}: ${JSON.stringify(run.error ?? run.controls ?? "").slice(0, 300)}`);
  return { raw: run.output as ShoppingResponse, runId: run.runId, cost: run.cost?.value ?? null };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const isRS = (s = "") => /\brs\b|rs components|rs online|rs americas|rs pro/i.test(s);

/** Map a raw shopping response to SupplierOption[] (RS first, then exact part matches by price). */
export function toSupplierOptions(part: string, raw: ShoppingResponse): SupplierOption[] {
  const p = norm(part);
  const rows = (raw.shopping_results ?? []).filter(
    (r) => typeof r.extracted_price === "number" && r.source && norm(r.title).includes(p) && !r.second_hand_condition,
  );
  const opts = rows.map((r) =>
    SupplierOption.parse({
      supplier: r.source,
      part,
      price: r.extracted_price,
      currency: "USD",
      stock: null, // Google Shopping gives no stock count; Agent37 browser reads it on the product page
      lead_time: r.delivery ?? "unknown",
      url: r.product_link ?? null,
      source: "monid",
    }),
  );
  return opts.sort(
    (a, b) => Number(isRS(b.supplier)) - Number(isRS(a.supplier)) || Number(!!b.url) - Number(!!a.url) || a.price - b.price,
  );
}

/** discover is free; search is one paid litescrape call. Pass `raw` to reuse a saved response. */
export async function searchSuppliers(part: string, raw?: ShoppingResponse): Promise<SupplierOption[]> {
  const data = raw ?? (await runShoppingSearch(part)).raw;
  const opts = toSupplierOptions(part, data);
  if (!opts.length) throw new Error(`Monid: no priced listing matching ${part}`);
  return opts;
}
