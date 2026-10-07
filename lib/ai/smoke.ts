// Real smoke: npx tsx lib/ai/smoke.ts  (vision chatJSON with TriageOutput)
import { readFileSync, existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { createAiGateway, imageToDataUrl } = await import("./index");
  const { TriageOutput } = await import("../contracts/types");
  const ai = createAiGateway();
  const alarm = readFileSync("seed/alarm.txt", "utf8");
  const t0 = Date.now();
  const out = await ai.chatJSON(
    `Triage this plant alarm and the attached photo of the motor starter.\n\n${alarm}`,
    TriageOutput,
    { model: "fast", system: "You are a maintenance triage engineer.", imageUrls: [imageToDataUrl("seed/photos/failure-burned-contactor.jpg")] },
  );
  console.log(`ok in ${Date.now() - t0} ms`);
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => {
  console.error("SMOKE FAILED:", e?.status ?? "", e?.message ?? e);
  process.exit(1);
});
