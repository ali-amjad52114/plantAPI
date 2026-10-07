// Usage: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-agentmail.ts [--send]
// Free by default: finds the demo inbox and reads back "PlantAPI RFQ test LC1D09BD". --send sends one RFQ ($0.001) to the inbox itself.
// Never creates an inbox ($1) and never emails anyone outside the demo inbox.
const API = process.env.MONID_BASE_URL || "https://api.monid.ai";
const SUBJECT = "PlantAPI RFQ test LC1D09BD";
const INBOX_PREFIX = "rs-supplier-demo";

async function run(endpoint: string, body?: unknown): Promise<any> {
  const key = process.env.MONID_API_KEY;
  if (!key) throw new Error("MONID_API_KEY missing");
  const res = await fetch(`${API}/v1/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "agentmail", endpoint, ...(body ? { input: { body } } : {}) }),
  });
  let r = await res.json();
  if (!res.ok) throw new Error(`${endpoint} -> ${res.status}: ${JSON.stringify(r).slice(0, 300)}`);
  for (let i = 0; i < 30 && !["COMPLETED", "FAILED", "BLOCKED", "STOPPED", "TIMED_OUT"].includes(r.status); i++) {
    await new Promise((s) => setTimeout(s, 2000));
    r = await (await fetch(`${API}/v1/runs/${r.runId}`, { headers: { Authorization: `Bearer ${key}` } })).json();
  }
  if (r.status !== "COMPLETED") throw new Error(`${endpoint} ${r.status}: ${JSON.stringify(r.error ?? r.controls ?? r).slice(0, 300)}`);
  return r.output;
}

async function main() {
  const t0 = Date.now();
  const inboxes = (await run("/list-inboxes")).inboxes ?? [];
  const inbox = inboxes.find((b: any) => JSON.stringify(b).includes(INBOX_PREFIX));
  if (!inbox) throw new Error(`no inbox like ${INBOX_PREFIX} (have ${inboxes.length}); create it once with /create-inboxes ($1, needs approval)`);
  const inboxId: string = inbox.inboxId ?? inbox.inbox_id ?? inbox.address ?? inbox.email;
  if (process.argv.includes("--send")) {
    await run("/send-messages", { inboxId, to: inboxId, subject: SUBJECT, text: "Please quote 1x Schneider LC1D09BD, 24VDC coil. Need by today 17:00." });
  }
  let msg: any;
  for (let i = 0; i < 6 && !msg; i++) {
    const list = await run("/list-messages", { inboxId, limit: 10 });
    msg = (list.messages ?? []).find((m: any) => m.subject === SUBJECT && (m.labels ?? []).includes("received"))
      ?? (list.messages ?? []).find((m: any) => m.subject === SUBJECT);
    if (!msg) await new Promise((s) => setTimeout(s, 5000));
  }
  if (!msg) throw new Error(`no message "${SUBJECT}" in ${inboxId}`);
  const id = msg.messageId ?? msg.message_id ?? msg.id;
  const full = await run("/messages/{id}", { inboxId, messageId: id });
  console.log(`PASS inbox=${inboxId} message_id=${id} from=${full.from ?? msg.from} labels=${JSON.stringify(full.labels ?? msg.labels)} latency=${Date.now() - t0}ms`);
}
main().catch((e) => { console.log(`FAIL ${e instanceof Error ? e.message : e}`); process.exit(1); });
