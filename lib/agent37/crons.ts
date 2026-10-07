// Agent37 platform crons (https://www.agent37.com/docs/agents-api/crons): a prompt sent to the instance on a
// schedule, fired from outside the container (wakes a sleeping instance). Plus the session read we need to
// see what a firing's turn concluded.

const apiBase = () => process.env.AGENT37_BASE_URL ?? "https://api.agent37.com/v1";
const instanceHost = (id: string) => `https://${id}.agent37.app/v1`;
const auth = () => ({ Authorization: `Bearer ${process.env.AGENT37_API_KEY}`, "Content-Type": "application/json" });

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: auth(), body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Agent37 ${method} ${url.replace(/^https:\/\/[^/]+/, "")} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export interface Cron {
  id: string;
  name: string | null;
  prompt: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  last_run: number | null;
  next_run: number | null;
  created: number;
}

export interface CronRun {
  id?: string;
  status?: string; // triggered | completed | skipped …
  reason?: string | null;
  session_id?: string | null;
  created?: number;
  [k: string]: unknown;
}

/** Five-field cron expression that fires once at `at` (UTC): minute hour day month *. */
export function oneShotSchedule(at: Date): string {
  return `${at.getUTCMinutes()} ${at.getUTCHours()} ${at.getUTCDate()} ${at.getUTCMonth() + 1} *`;
}

export const createCron = (instanceId: string, c: { name: string; prompt: string; schedule: string; timezone?: string }) =>
  call<Cron>("POST", `${apiBase()}/instances/${instanceId}/crons`, { timezone: "UTC", ...c });

export const deleteCron = (instanceId: string, cronId: string) =>
  call<{ id: string; deleted: boolean }>("DELETE", `${apiBase()}/instances/${instanceId}/crons/${cronId}`);

export const runCronNow = (instanceId: string, cronId: string) => call<CronRun>("POST", `${apiBase()}/instances/${instanceId}/crons/${cronId}/run`);

export async function cronRuns(instanceId: string, cronId: string): Promise<CronRun[]> {
  const r = await call<{ data?: CronRun[] } | CronRun[]>("GET", `${apiBase()}/instances/${instanceId}/crons/${cronId}/runs`);
  return Array.isArray(r) ? r : (r.data ?? []);
}

/** GET /v1/sessions/{id} on the instance host (history of the firing's turn). */
export const getSession = (instanceId: string, sessionId: string) => call<unknown>("GET", `${instanceHost(instanceId)}/sessions/${sessionId}`);

/** Every string value in a JSON tree, in document order (to find the agent's final reply text). */
export function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

/** Last assistant message of a session history. */
export function lastAssistantText(session: unknown): string | null {
  const history = (session as { history?: Array<{ role?: string; content?: unknown }> })?.history ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.role === "assistant") return typeof h.content === "string" ? h.content : JSON.stringify(h.content);
  }
  return null;
}
