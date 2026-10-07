// Smoke: confirm the RS product page for LC1D09BD with the Agent37 browser (read only), then copy the
// screenshot back to the backend with the Agent37 files API (GET /files/content).
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-rs.ts [PART]
// Exit 0 = PASS (price read), 3 = BLOCKED (bot wall: CAPTCHA / Access Denied, never bypassed), 1 = FAIL.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { agent37 } from "../lib/agent37";

const INSTANCE = process.env.AGENT37_INSTANCE_ID || "pfd5d7eukw";
const part = process.argv[2] || "LC1D09BD";
const timings: Array<{ step: string; ms: number }> = [];
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now(); try { return await fn(); } finally { timings.push({ step: name, ms: Date.now() - t }); }
}

async function main() {
  const helper = readFileSync(join(__dirname, "lib", "rs-browser.sh"), "utf8").split(String.fromCharCode(13)).join("");
  await step("upload helper", () => agent37.uploadFile(INSTANCE, "/home/node/plantapi/rs-browser.sh", Buffer.from(helper)));
  const shot = `/home/node/shots/rs-${part}-${Date.now()}.png`;
  const r = await step("rs-confirm (browser)", () => agent37.exec(INSTANCE, `chmod 700 ~/plantapi/rs-browser.sh; ~/plantapi/rs-browser.sh rs-confirm ${part} ${shot}`, 180_000));
  const kv = Object.fromEntries(r.stdout.split("\n").filter((l) => /^[a-z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  let local: string | null = null;
  try {
    const buf = await step("download screenshot (files API)", () => agent37.readFile(INSTANCE, shot));
    mkdirSync(join(__dirname, "..", "evidence"), { recursive: true });
    local = join(__dirname, "..", "evidence", shot.split("/").pop()!);
    writeFileSync(local, buf);
  } catch (e) { console.log("screenshot download failed:", String(e).slice(0, 200)); }
  const tried = r.stdout.split("\n").filter((l) => l.startsWith("tried="));
  const status = kv.status === "OK" && kv.price ? "PASS" : kv.status === "BLOCKED" ? "BLOCKED" : "FAIL";
  console.log(status);
  console.log(JSON.stringify({ part, url: kv.url ?? null, price: kv.price || null, stock: kv.stock || null, lead_time: kv.lead_time || null,
    block_reason: kv.block_reason ?? null, tried, instance_screenshot: shot, local_screenshot: local,
    supplier_entry: status === "PASS" ? { supplier: "RS Components", part, price: Number(String(kv.price).replace(/[^0-9.]/g, "")), currency: "USD",
      stock: Number(String(kv.stock).replace(/[^0-9]/g, "")) || null, lead_time: kv.lead_time || "unknown", url: kv.url, source: "browser" } : null }, null, 2));
  console.table(timings);
  process.exit(status === "PASS" ? 0 : status === "BLOCKED" ? 3 : 1);
}
main().catch((e) => { console.log("FAIL", String(e).slice(0, 300)); console.table(timings); process.exit(1); });
