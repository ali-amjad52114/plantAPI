// Every time the UI shows is plant time (NEXT_PUBLIC_PLANT_TZ, default America/New_York), never the browser's zone
// or the raw ISO wall time. Day words are relative to `now`: "today 11:00", "tonight 21:35", "tomorrow 07:00".
export const PLANT_TZ = process.env.NEXT_PUBLIC_PLANT_TZ || process.env.PLANT_TZ || "America/New_York";

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: PLANT_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const short = new Intl.DateTimeFormat("en-US", { timeZone: PLANT_TZ, weekday: "short", month: "short", day: "numeric" });

function parts(t: string | number | Date) {
  const d = new Date(t);
  if (isNaN(+d)) return null;
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hh: p.hour, mm: p.minute, ss: p.second, d };
}

/** "HH:MM" in plant time, or "—". */
export const plantHHMM = (t?: string | number | Date | null) => { const p = t == null ? null : parts(t); return p ? `${p.hh}:${p.mm}` : "—"; };
/** "HH:MM:SS" in plant time, or "". */
export const plantHHMMSS = (t?: string | number | Date | null) => { const p = t == null ? null : parts(t); return p ? `${p.hh}:${p.mm}:${p.ss}` : ""; };

/** "today" | "tonight" (today from 18:00) | "tomorrow" | "yesterday" | "Thu, Oct 9", in plant time relative to `now`. */
export function plantDay(t?: string | number | Date | null, now: number = Date.now()) {
  const p = t == null ? null : parts(t), n = parts(now);
  if (!p || !n) return "";
  const days = Math.round((Date.parse(p.date) - Date.parse(n.date)) / 864e5);
  if (days === 0) return Number(p.hh) >= 18 ? "tonight" : "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return short.format(p.d);
}

/** "tonight 21:35", "tomorrow 07:00", or "—". */
export const plantWhen = (t?: string | number | Date | null, now: number = Date.now()) => (t == null || !parts(t) ? "—" : `${plantDay(t, now)} ${plantHHMM(t)}`);
