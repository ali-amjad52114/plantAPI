// Usage: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-monid.ts [--live]
// Default uses the saved real response (scripts/fixtures/monid-LC1D09BD.json) if present; --live spends one call (~$0.00015).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { runShoppingSearch, searchSuppliers, MONID_TOOL_LABEL, type ShoppingResponse } from "../lib/tools/monid";

const PART = "LC1D09BD";
const FIXTURE = "scripts/fixtures/monid-LC1D09BD.json";

async function main() {
  const live = process.argv.includes("--live") || !existsSync(FIXTURE);
  const t0 = Date.now();
  let raw: ShoppingResponse;
  let note = "fixture (real response saved earlier)";
  if (live) {
    const qi = process.argv.indexOf("--q");
    const r = await runShoppingSearch(PART, qi > 0 ? process.argv[qi + 1] : undefined);
    raw = r.raw;
    mkdirSync("scripts/fixtures", { recursive: true });
    writeFileSync(FIXTURE, JSON.stringify(raw, null, 2));
    note = `live run ${r.runId}, cost $${r.cost}`;
  } else {
    raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
  }
  const opts = await searchSuppliers(PART, raw);
  const ms = Date.now() - t0;
  const best = opts[0];
  const rs = opts.some((o) => /rs/i.test(o.supplier) && /components|online|americas|\brs\b/i.test(o.supplier));
  console.log(`tool: ${MONID_TOOL_LABEL} | source: ${note}`);
  console.log(`options: ${opts.length} | RS present: ${rs}`);
  for (const o of opts.slice(0, 5)) console.log(`  ${o.supplier} | $${o.price} | stock ${o.stock ?? "n/a"} | ${o.lead_time} | ${o.url ?? "-"}`);
  console.log(`PASS supplier=${best.supplier} price=$${best.price} stock=${best.stock ?? "n/a"} url=${best.url ?? "-"} latency=${ms}ms`);
}
main().catch((e) => {
  console.log(`FAIL ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
