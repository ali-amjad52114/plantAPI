// Server-side helpers for the dashboard pages: pick live vs demo replay, and read open incidents for the site view.
import { createClient } from "@supabase/supabase-js";
import type { SourceConfig } from "./useIncident";
import { assetOf, type SiteIncident } from "./assets";
import { MOCK_ID } from "./mock";

type Search = Record<string, string | string[] | undefined>;

/** Live Supabase data always; the replay only with ?mock=1 (development only, never the demo path). */
export function sourceConfig(search: Search): SourceConfig {
  if (search.mock === "1") return { mock: true };
  return { mock: false, supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY };
}

export async function siteIncidents(cfg: SourceConfig): Promise<SiteIncident[]> {
  if (cfg.mock) return [{ id: MOCK_ID, asset: "CV-104", title: "Contactor burned on MCC-03 breaker 7. Crushing Line 2 stopped.", status: "NEW", created_at: new Date().toISOString() }];
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { console.error("site view: SUPABASE_URL / SUPABASE_ANON_KEY not set"); return []; }
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const q = (hideArchived: boolean) => {
    let b = sb.from("incidents").select("id,title,alarm_text,status,triage,created_at").not("status", "in", "(CLOSED,REJECTED,FAILED)");
    if (hideArchived) b = b.or("archived.is.null,archived.eq.false");
    return b.order("created_at", { ascending: false }).limit(20);
  };
  let { data, error } = await q(true);
  // until migration 004 adds incidents.archived, fall back to the unfiltered list
  if (error && /archived/i.test(error.message)) ({ data, error } = await q(false));
  if (error) { console.error("site view: incidents query failed", error.message); return []; }
  return (data ?? []).map(r => ({ id: r.id, asset: assetOf(r), title: r.title || r.alarm_text, status: r.status, created_at: r.created_at }));
}
