// Real smoke: npx tsx lib/agent37/smoke.ts  (instance AGENT37_INSTANCE_ID, default pfd5d7eukw)
import { readFileSync, existsSync } from "node:fs";

for (const f of [".env", ".env.local"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { agent37 } = await import("./index");
  const id = process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";

  const ex = await agent37.exec(id, "echo ok && ls ~");
  console.log("EXEC", JSON.stringify(ex));

  const path = "/tmp/plantapi-smoke.txt";
  await agent37.uploadFile(id, path, Buffer.from("hello plantapi"));
  const back = (await agent37.readFile(id, path)).toString("utf8");
  console.log("FILE roundtrip", back === "hello plantapi" ? "OK" : `MISMATCH: ${back}`);

  const r = await agent37.runTurn(
    { instanceId: id, role: "triage", incidentId: "smoke", input: 'Reply with exactly: {"ok":true}', reasoningEffort: "low" },
    (e) => console.log("EVENT", JSON.stringify(e)),
  );
  console.log("TURN", JSON.stringify(r));
}

main().catch((e) => { console.error("SMOKE FAIL", e); process.exit(1); });
