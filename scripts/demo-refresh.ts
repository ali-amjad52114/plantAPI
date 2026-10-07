// CLI for the "Reset demo" refresh. Logic lives in lib/tools/demo-refresh.ts (refreshDemoData).
// Run before each rehearsal/demo:
//   npx tsx --env-file=.env --env-file=.env.local scripts/demo-refresh.ts [--dry-run]
import { refreshDemoData } from "../lib/tools/demo-refresh";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const s = await refreshDemoData({ dryRun, onProgress: (step, detail) => console.log(`[${step}] ${detail}`) });
  console.log(`\nplant now ${s.now} (${s.tz})${s.dryRun ? "  [dry-run]" : ""}`);
  console.log(`Sarah busy     ${s.sarah.busy.start} -> ${s.sarah.busy.end}`);
  console.log(`Sarah free     ${s.sarah.free.start} -> ${s.sarah.free.end}`);
  console.log(`Sarah training ${s.sarah.training.start} -> ${s.sarah.training.end}`);
  console.log(`Sheet low      ${s.sheet.lowImpact.date} ${s.sheet.lowImpact.start}-${s.sheet.lowImpact.end} (${s.sheet.lowImpact.impact})`);
  console.log(`Sheet lowest   ${s.sheet.lowest.date} ${s.sheet.lowest.start}-${s.sheet.lowest.end} (${s.sheet.lowest.impact})`);
  if (!s.dryRun) {
    console.log(`calendar: deleted ${s.calendar.deleted} owned, created ${s.calendar.created}, untouched ${s.calendar.untouched} ${JSON.stringify(s.calendar.untouchedTitles)}`);
    for (const e of s.readBack?.events ?? []) console.log(`  read back: ${(e as any).tagged ? "[ours] " : "[other]"} ${e.summary} ${e.start} -> ${e.end}`);
    for (const r of s.readBack?.sheetRows.slice(1) ?? []) if (r[1] === "Crushing Line 2") console.log(`  sheet: ${r.slice(0, 9).join(" | ")}`);
  }
  console.log(s.ok ? "PASS demo-refresh" : `FAIL demo-refresh: ${s.error}`);
  if (!s.ok) process.exitCode = 1;
}
main();
