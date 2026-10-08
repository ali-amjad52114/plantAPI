// Workforce conflicts arrive as text, e.g. "2026-10-08 07:00-12:00 Sarah Chen: Arc-flash training (off site)"
// (plant local time, no offset). Parsed into UTC intervals so the coordinator guard can check overlaps.

export type Interval = { start: number; end: number; label: string };

/** "-04:00" from an ISO string like "2026-10-07T21:05:00-04:00" (null if none). */
export function offsetOf(iso: string | null | undefined): string | null {
  const m = String(iso ?? "").match(/([+-]\d{2}:\d{2}|Z)$/);
  return m ? m[1] : null;
}

export function parseConflict(text: string, tzOffset: string): Interval | null {
  // Full ISO pair: "2026-10-08T07:00:00-04:00 … 2026-10-08T12:00:00-04:00"
  const iso = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?/g);
  if (iso && iso.length >= 2) {
    const s = Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(iso[0]) ? iso[0] : iso[0] + tzOffset);
    const e = Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(iso[1]) ? iso[1] : iso[1] + tzOffset);
    return Number.isNaN(s) || Number.isNaN(e) ? null : { start: s, end: e, label: text };
  }
  // "YYYY-MM-DD HH:MM-HH:MM" or with T / en dash, end on the same day
  const m = text.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?\s*[-–—]\s*(\d{2}:\d{2})/);
  if (!m) return null;
  const s = Date.parse(`${m[1]}T${m[2]}:00${tzOffset}`);
  let e = Date.parse(`${m[1]}T${m[3]}:00${tzOffset}`);
  if (e <= s) e += 86_400_000; // crosses midnight
  return Number.isNaN(s) || Number.isNaN(e) ? null : { start: s, end: e, label: text };
}

/** First still-relevant conflict (ends after `now`) that overlaps [ws, we), or null. */
export function overlappingConflict(conflicts: unknown, ws: number, we: number, now: number, tzOffset: string): Interval | null {
  if (!Array.isArray(conflicts)) return null;
  for (const c of conflicts) {
    const iv = typeof c === "string" ? parseConflict(c, tzOffset) : null;
    if (!iv || iv.end <= now) continue; // leftover past bookings are not conflicts
    if (ws < iv.end && we > iv.start) return iv;
  }
  return null;
}
