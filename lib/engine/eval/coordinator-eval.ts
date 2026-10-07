// Coordinator eval: 7 variants of the seeded disagreement, each run as a REAL Agent37 coordinator turn
// (no DB writes). Pass = plan window starts 18:00 today and the supplier is one Materials found.
// Run: npx tsx lib/engine/eval/coordinator-eval.ts
import { loadEnv } from "../../db/env";
import type { Incident } from "../../contracts/types";

loadEnv();

const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA");

const triage = {
  asset_id: "CV-104", failure_category: "electrical", suspected_component: "contactor", suspected_part: "LC1D09BD",
  confidence: 0.85, severity: "high", required_trade: "electrician", estimated_repair_minutes: 45,
  recommended_action: "Replace KM104 contactor under LOTO", summary: "Burned KM104 contactor on CV-104",
};
const rs = { supplier: "RS Components", part: "LC1D09BD", price: 29.49, currency: "USD", stock: 120 as number | null, lead_time: "courier, on site today 17:00", url: "https://www.rs-online.com/web/p/contactors/1825567", source: "monid" };
const materials = { part: "LC1D09BD", internal_stock: 0, odoo_product_id: 1, monid_tool: "litescrape /google/shopping", suppliers: [rs], recommended_index: 0, summary: "0 in stock; RS can deliver today 17:00" };
const reliability = { asset_id: "CV-104", recurring: true, failures_last_12_months: 3, pattern: "3rd KM104 contactor failure in 12 months", root_cause: "contact wear from frequent starts", recommendation: "Replace as soon as possible; review duty cycle", urgency: "asap", sources: ["WO-1", "WO-2"], summary: "Recurring — repair ASAP" };
const production = {
  workcenter: "Crushing Line 2",
  recommended: { start: `${tomorrow}T07:00:00`, end: `${tomorrow}T08:00:00`, impact: "none", note: "planned stop, lowest impact" },
  alternatives: [{ start: `${today}T18:00:00`, end: `${today}T20:00:00`, impact: "low", note: "reduced production" }],
  source: "sheets:eval", summary: "Lowest impact tomorrow 07:00; today 18:00–20:00 is low impact",
};
const workforce = { technician: "Sarah Chen", trade: "electrician", qualifications: ["LOTO", "NFPA 70E"], available_from: `${today}T18:00:00`, conflicts: [`${tomorrow} 07:00–12:00 off-site arc-flash training`], alternatives: [], source: "calendar:eval", summary: "Sarah free today 18:00, busy tomorrow morning" };

const CASES: Array<{ name: string; team: Record<string, unknown>; materials?: typeof materials; noLeadTime?: boolean; expect?: string }> = [
  { name: "baseline seeded disagreement", team: { reliability, production, workforce } },
  { name: "production insists on tomorrow 07:00", team: { workforce, production: { ...production, summary: "STRONGLY prefer tomorrow 07:00 — zero production impact" }, reliability } },
  { name: "reliability unavailable", team: { reliability: { unavailable: "Fiix timeout" }, production, workforce } },
  { name: "part could arrive tomorrow instead", team: { reliability, production, workforce }, materials: { ...materials, suppliers: [rs, { ...rs, supplier: "Mouser", price: 27.1, lead_time: "tomorrow 10:00", url: "https://www.mouser.com/x" }] } },
  { name: "no confirmed lead time → earliest feasible today, conditional + expedite", team: { reliability, production, workforce }, materials: { ...materials, suppliers: [{ ...rs, lead_time: "unknown", stock: null }] }, noLeadTime: true },
  {
    name: "today's only window is 28 min for a 45 min repair → tomorrow 07:00",
    team: {
      reliability,
      production: { ...production, recommended: { start: `${today}T19:32:00`, end: `${today}T20:00:00`, impact: "low", note: "only gap today" }, alternatives: [{ start: `${tomorrow}T07:00:00`, end: `${tomorrow}T09:00:00`, impact: "none", note: "planned stop" }], summary: "Today only 19:32-20:00; tomorrow 07:00-09:00 planned stop" },
      workforce: { ...workforce, available_from: `${today}T18:00:00`, conflicts: [] , summary: "Sarah free from today 18:00, no conflicts tomorrow" },
    },
    expect: `${tomorrow}T07:00`,
  },
  { name: "reliability says next window is fine", team: { reliability: { ...reliability, urgency: "next_window", recommendation: "Replace at next planned stop" }, production, workforce } },
];

async function main() {
  const { agent37 } = await import("../../agent37");
  const { ai } = await import("../../ai");
  const { buildTaskText } = await import("../prompts");
  const { checkOutput } = await import("../flow");
  const instanceId = process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";

  const results = await Promise.allSettled(
    CASES.map(async (c, i) => {
      const incident = { id: `eval-${i}`, alarm_text: "CV-104 tripped 3x, KM104 feedback lost", photo_url: null, triage, materials: c.materials ?? materials, plan: null, erp: null } as unknown as Incident;
      const t0 = Date.now();
      const turn = await agent37.runTurn({ instanceId, role: "coordinator", incidentId: incident.id, input: buildTaskText("coordinator", incident, { team: c.team }), reasoningEffort: "medium" }, () => {});
      const plan = await ai.parseAgentOutput("coordinator", turn.outputText);
      const at18 = plan.window_start.startsWith(c.expect ?? `${today}T18:00`);
      const problem = checkOutput("coordinator", plan, incident);
      // Unknown lead time: earliest feasible window today (18:00 here), never blank, marked conditional, expedite needs approval.
      const conditionalOk = !c.noLeadTime || (plan.safety.some((x) => /conditional/i.test(x)) && plan.actions.some((a) => /expedite/i.test(a.action) && a.rule === "APPROVAL"));
      return { name: c.name, pass: at18 && !problem && conditionalOk, window: plan.window_start, supplier: `${plan.supplier.supplier} $${plan.supplier.price}`, problem, seconds: ((Date.now() - t0) / 1000).toFixed(0), response: turn.responseId };
    }),
  );
  let passed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value.pass) passed++;
      console.log(`${r.value.pass ? "PASS" : "FAIL"}  ${CASES[i].name}: window ${r.value.window}, ${r.value.supplier}${r.value.problem ? `, ${r.value.problem}` : ""} (${r.value.seconds}s, ${r.value.response})`);
    } else console.log(`FAIL  ${CASES[i].name}: ${String(r.reason).slice(0, 200)}`);
  });
  console.log(`coordinator eval: ${passed}/${CASES.length} chose the earliest feasible window long enough for the repair`);
  process.exit(passed === CASES.length ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
