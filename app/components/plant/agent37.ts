// Server-side only (imported by server components; never ship the key). Reads from the real Agent37 API for the plant panels (verified endpoints, GET + one read-only exec).

const KEY = () => process.env.AGENT37_API_KEY ?? "";
const BASE = () => process.env.AGENT37_BASE_URL ?? "https://api.agent37.com/v1";
export const INSTANCE = () => process.env.AGENT37_INSTANCE_ID ?? "";

export type Res<T> = { ok: true; data: T } | { ok: false; error: string };

async function get<T>(url: string): Promise<Res<T>> {
  if (!KEY() || !INSTANCE()) return { ok: false, error: "AGENT37_API_KEY / AGENT37_INSTANCE_ID not set" };
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY()}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, error: `${r.status} ${(await r.text()).slice(0, 160)}` };
    return { ok: true, data: (await r.json()) as T };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
const ctl = <T>(p: string) => get<T>(`${BASE()}/instances/${INSTANCE()}${p}`);

export interface Instance { id: string; status: string; template: string; image_ref?: string }
export interface Budget { monthly_cap_micros: number; monthly_consumed_micros: number; monthly_remaining_micros: number; monthly_period: string }
export interface Usage { period: string; total_micros: number; by_integration: Record<string, { cost_micros: number; calls?: number; input_tokens?: number; output_tokens?: number }> }
export interface Metrics { series: Record<string, [number, number][]> }
export interface Cron { id?: string; name?: string; schedule?: string; cron?: string; next_run_at?: string; prompt?: string; [k: string]: unknown }
export interface Backup { id?: string; created_at?: string; size_bytes?: number; [k: string]: unknown }
export interface Session { id: string; title: string; last_active: number; message_count: number; preview?: string }

export const instance = () => ctl<Instance>("");
export const budget = () => ctl<Budget>("/budget");
export const usage = () => ctl<Usage>("/usage");
export const metrics = () => ctl<Metrics>("/metrics");
export const crons = () => ctl<{ data: Cron[] }>("/crons");
export const backups = () => ctl<{ data: Backup[] }>("/backups");
export const logs = () => ctl<{ logs: string }>("/logs");
export const sessions = () => get<{ data: Session[] }>(`https://${INSTANCE()}.agent37.app/v1/sessions`);

/** Workspace files the agents wrote (photos, screenshots, reports): read-only `find` on the instance. */
export async function files(): Promise<Res<{ path: string; bytes: number; mtime: string }[]>> {
  if (!KEY() || !INSTANCE()) return { ok: false, error: "AGENT37_API_KEY / AGENT37_INSTANCE_ID not set" };
  try {
    const r = await fetch(`${BASE()}/instances/${INSTANCE()}/exec`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${KEY()}`, "content-type": "application/json" },
      body: JSON.stringify({ command: "find ~/plantapi -type f ! -name '*.env' ! -name '.env*' -printf '%T@\\t%s\\t%p\\n' 2>/dev/null | sort -rn | head -40" }),
    });
    if (!r.ok) return { ok: false, error: `${r.status} ${(await r.text()).slice(0, 160)}` };
    const j = (await r.json()) as { stdout?: string; exit_code?: number };
    const rows = (j.stdout ?? "").trim().split("\n").filter(Boolean).map(l => {
      const [t, s, p] = l.split("\t");
      return { path: (p ?? "").replace(/^\/home\/[^/]+\//, "~/"), bytes: Number(s), mtime: new Date(Number(t) * 1000).toISOString() };
    });
    return { ok: true, data: rows };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
