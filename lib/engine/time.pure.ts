// Every timestamp the engine hands to an agent is ISO 8601 in PLANT time with an explicit offset
// (e.g. 2026-10-08T07:00:00-04:00), never "Z", so agents, Odoo, Calendar and Slack never mix zones.
// Plant zone: PLANTAPI_TZ (IANA, default America/New_York — DST-aware).

const plantZone = () => process.env.PLANTAPI_TZ ?? "America/New_York";

/** "-04:00" for the plant zone at that instant. */
export function plantOffset(at: Date | number = Date.now(), zone = plantZone()): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(new Date(at))
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? "00"}` : "+00:00";
}

/** ISO 8601 in plant time, seconds precision: 2026-10-08T07:00:00-04:00 */
export function toPlantIso(at: Date | number | string, zone = plantZone()): string {
  const d = new Date(typeof at === "string" ? Date.parse(at) : at);
  if (Number.isNaN(d.getTime())) return String(at);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${plantOffset(d, zone)}`;
}

/** Rewrites every full ISO timestamp string (with Z or an offset) in a JSON value to plant time. */
export function deepPlantTime<T>(v: T): T {
  if (typeof v === "string") return (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) ? toPlantIso(v) : v) as T;
  if (Array.isArray(v)) return v.map(deepPlantTime) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepPlantTime(x)])) as T;
  return v;
}
