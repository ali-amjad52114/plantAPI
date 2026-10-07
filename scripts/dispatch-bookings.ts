// Read-only: list the Dispatch calendar event ids resetDemo would delete, for ALL incidents,
// and whether each exists in PLANTAPI_CALENDAR_ID. Never deletes.
//   npx tsx --env-file=.env --env-file=.env.local scripts/dispatch-bookings.ts
import { cleanupDispatchBookings } from "../lib/tools/demo";

async function main() {
  const r = await cleanupDispatchBookings(undefined, { dryRun: true });
  console.log(`dispatch calendar bookings found: ${r.rows.length} (dry-run, nothing deleted)`);
  for (const b of r.rows)
    console.log(`  incident ${b.incidentId} -> event ${b.eventId} [${b.source}] exists=${b.exists}` +
      (b.exists ? ` "${b.summary}" ${b.start}` : ` (${b.checkError})`));
  console.log(`would delete: ${r.rows.filter((b) => b.exists).map((b) => b.eventId).join(", ") || "none"}`);
}
main().catch((e) => { console.log(`FAIL: ${(e as Error).message}`); process.exitCode = 1; });
