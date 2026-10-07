// Real read-only check of the ERP Odoo block verification for an incident's plan.
// Run: npx tsx lib/engine/eval/odoo-block-check.ts <incident_id> [odoo_block_ref]
import { loadEnv } from "../../db/env";
loadEnv();
async function main() {
  const { getIncident } = await import("../index");
  const { verifyErpBlock } = await import("../odoo-check");
  const inc = await getIncident(process.argv[2]);
  console.log("plan window", inc.plan?.window_start, "→", inc.plan?.window_end);
  console.log("with ref   ", await verifyErpBlock(process.argv[3] ?? "mrp.workcenter.productivity:6", inc.plan!));
  console.log("ref empty  ", await verifyErpBlock(null, inc.plan!));
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
