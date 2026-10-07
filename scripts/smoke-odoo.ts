// Smoke test for the Odoo tool (real Odoo, JSON-2 API).
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-odoo.ts
// Steps: stock LC1D09BD -> block Crushing Line 2 -> verify blocked -> unblock -> verify unblocked.
// Always leaves Crushing Line 2 unblocked. Never prints keys.
import { odoo, blockWorkcenter, unblockWorkcenter, DEMO_PART, DEMO_WORKCENTER } from "../lib/tools/odoo";

type Row = { step: string; pass: boolean; ms: number; evidence: string };
const rows: Row[] = [];

async function step(name: string, fn: () => Promise<{ pass: boolean; evidence: string }>) {
  const t0 = performance.now();
  try {
    const r = await fn();
    rows.push({ step: name, ...r, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    rows.push({ step: name, pass: false, ms: Math.round(performance.now() - t0), evidence: `error: ${(e as Error).message}` });
  }
}

async function main() {
  await step(`stock ${DEMO_PART}`, async () => {
    const s = await odoo.stock(DEMO_PART);
    return { pass: s !== null, evidence: s ? `product.product:${s.productId} qty=${s.qty}` : "not found" };
  });

  // Start from a clean state so the block step really creates a record.
  const pre = await odoo.workcenterBlocked(DEMO_WORKCENTER).catch(() => null);
  if (pre?.blocked) await unblockWorkcenter(DEMO_WORKCENTER).catch(() => null);

  await step(`block ${DEMO_WORKCENTER}`, async () => {
    const b = await blockWorkcenter(DEMO_WORKCENTER);
    return { pass: b.created, evidence: `mrp.workcenter:${b.workcenterId} ${b.ref} created=${b.created}` };
  });

  await step("verify blocked", async () => {
    const s = await odoo.workcenterBlocked(DEMO_WORKCENTER);
    return { pass: s.blocked && s.ref !== null, evidence: `blocked=${s.blocked} ref=${s.ref}` };
  });

  await step(`unblock ${DEMO_WORKCENTER}`, async () => {
    const u = await unblockWorkcenter(DEMO_WORKCENTER);
    return { pass: u.closedIds.length > 0, evidence: `closed mrp.workcenter.productivity:[${u.closedIds.join(",")}]` };
  });

  await step("verify unblocked", async () => {
    const s = await odoo.workcenterBlocked(DEMO_WORKCENTER);
    return { pass: !s.blocked, evidence: `blocked=${s.blocked} ref=${s.ref}` };
  });

  // Safety net: never leave the line blocked.
  const end = await odoo.workcenterBlocked(DEMO_WORKCENTER).catch(() => null);
  if (end?.blocked) await unblockWorkcenter(DEMO_WORKCENTER).catch(() => null);

  for (const r of rows) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.step.padEnd(28)} ${String(r.ms).padStart(5)} ms  ${r.evidence}`);
  const ok = rows.every((r) => r.pass);
  console.log(ok ? "SMOKE ODOO: PASS" : "SMOKE ODOO: FAIL");
  process.exit(ok ? 0 : 1);
}

main();
