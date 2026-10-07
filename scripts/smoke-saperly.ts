// Usage: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-saperly.ts            (dry run: build + print request, FREE, sends nothing)
//        npx tsx --env-file=.env --env-file=.env.local scripts/smoke-saperly.ts --live     (BLOCKED until the lead supplies a number)
// Dispatch no-ack follow-up: one Monid Saperly AI call to Sarah Chen about CV-104 / 18:00 window.
// Needs PLANTAPI_TECH_PHONE (E.164, from ~/plantapi/plant.env) and SAPERLY_FROM_NUMBER_ID (an owned Saperly number id; none owned yet).
const API = process.env.MONID_BASE_URL || "https://api.monid.ai";
const LIVE_ENABLED = false; // flip only after the lead provides the phone number + approves number provisioning ($2) and call spend

export function buildCallRequest(to: string, fromNumberId: string) {
  const instructions = [
    "You are the PlantAPI plant assistant calling an electrical technician. Be brief, polite and clear; speak English.",
    "Ask for Sarah Chen. If someone else answers, ask them to have Sarah check Slack #plant-ops and end the call.",
    "Message: Conveyor CV-104 on Crushing Line 2 is down - contactor KM104, Schneider LC1D09BD, needs replacing.",
    "A work order is assigned to Sarah for the repair window today 18:00 to 20:00. LOTO is required (SOP-ELEC-014). The spare part arrives by 17:00.",
    "She has not acknowledged the Slack notice. Ask: can you confirm you will do the CV-104 repair at 18:00 today?",
    "Get a clear yes or no. If no, ask the earliest time she can do it. Repeat back her answer, thank her, and end the call.",
    "Do not discuss anything else, do not promise anything, keep the call under 90 seconds.",
  ].join(" ");
  return { provider: "saperly", endpoint: "/place-calls", input: { body: { fromNumberId, to, instructions } } };
}

async function main() {
  const to = process.env.PLANTAPI_TECH_PHONE ?? "";
  const from = process.env.SAPERLY_FROM_NUMBER_ID ?? "";
  const req = buildCallRequest(to || "<PLANTAPI_TECH_PHONE>", from || "<SAPERLY_FROM_NUMBER_ID>");
  const e164 = /^\+[1-9]\d{6,14}$/.test(to);
  if (!process.argv.includes("--live")) {
    console.log("DRY RUN - POST " + API + "/v1/run (not sent)");
    console.log(JSON.stringify(req, null, 2));
    console.log(`to valid E.164: ${e164} | fromNumberId set: ${!!from} | est. cost $0.30/min pro-rata ($0.005/s), unanswered = $0`);
    console.log("PASS dry-run request built");
    return;
  }
  if (!LIVE_ENABLED || !e164 || !from) {
    console.log(`BLOCKED live call: needs lead-provided PLANTAPI_TECH_PHONE (E.164), an owned Saperly number (SAPERLY_FROM_NUMBER_ID, /provision-numbers $2) and LIVE_ENABLED=true`);
    process.exit(2);
  }
  const key = process.env.MONID_API_KEY;
  const res = await fetch(`${API}/v1/run`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(req) });
  console.log(res.status, (await res.text()).slice(0, 500));
}
main().catch((e) => { console.log(`FAIL ${e instanceof Error ? e.message : e}`); process.exit(1); });
