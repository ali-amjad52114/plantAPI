// CLI wrapper for lib/tools/demo.ts resetDemo().
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/demo-reset.ts [--force] [--tz Europe/London]
// Exit: 0 ok, 1 incomplete/error, 2 refused (live incidents; rerun with --force only if intended).
import { resetDemo } from "../lib/tools/demo";

async function main() {
  const argv = process.argv.slice(2);
  const tz = argv.includes("--tz") ? argv[argv.indexOf("--tz") + 1] : undefined;
  const s = await resetDemo({ force: argv.includes("--force"), tz, onProgress: (step, d) => console.log(`[${step}] ${d}`) });
  console.log("=== DEMO RESET SUMMARY ===");
  console.log(JSON.stringify(s, null, 2));
  process.exitCode = s.refused ? 2 : s.ok ? 0 : 1;
}
main().catch((e) => { console.log("ERROR", String((e as Error)?.message ?? e).slice(0, 300)); process.exitCode = 1; });
