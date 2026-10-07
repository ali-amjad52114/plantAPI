// Turns the real wave A agent outputs (agent_tasks.output, shapes in lib/engine/wave-a-schemas.ts) into
// one line per planner for the plan card: what each one wants, why, and where its data came from.
import type { AgentRole, AgentTask, Incident } from "@/lib/contracts/types";

export interface Position { role: AgentRole; want: string; when: string | null; why: string; source: string | null; seed: boolean }

type O = Record<string, unknown> & { summary?: string };
const str = (v: unknown) => (typeof v === "string" ? v : "");
/** wall-clock HH:MM in the offset the timestamp was written with */
export const wall = (iso?: string | null) => (iso ? iso.match(/T(\d\d:\d\d)/)?.[1] ?? null : null);
const day = (iso: string | null, ref: string) => (!iso ? "" : iso.slice(0, 10) === ref.slice(0, 10) ? "today" : iso.slice(0, 10) > ref.slice(0, 10) ? "tomorrow" : iso.slice(0, 10));
const isSeed = (s: string | null) => !!s && /seed/i.test(s);

export function positions(inc: Incident, tasks: Partial<Record<AgentRole, AgentTask>>): Position[] {
  const out: Position[] = [];
  const ref = inc.created_at;

  const rel = tasks.reliability?.output as O | undefined;
  if (rel) {
    const urgency = str(rel.urgency);
    out.push({ role: "reliability", want: urgency === "asap" ? "ASAP" : urgency === "next_window" ? "NEXT WINDOW" : urgency ? urgency.toUpperCase() : "—", when: null,
      why: str(rel.pattern) || str(rel.summary), source: Array.isArray(rel.sources) ? (rel.sources as string[]).join(", ") : null, seed: false });
  }

  if (inc.materials) {
    const s = inc.materials.suppliers[inc.materials.recommended_index];
    out.push({ role: "materials", want: s ? `${s.supplier} · ${s.lead_time || "lead time unknown"}` : "NO SUPPLIER", when: null,
      why: inc.materials.summary, source: inc.materials.monid_tool ? `Monid ${inc.materials.monid_tool}` : null, seed: false });
  }

  const pro = tasks.production?.output as O | undefined;
  if (pro) {
    const rec = (pro.recommended ?? {}) as { start?: string; impact?: string };
    const t = wall(rec.start ?? null);
    out.push({ role: "production", want: t ? `${t} ${day(rec.start ?? null, ref)}` : "—", when: rec.start ?? null,
      why: `${rec.impact ? "Impact " + rec.impact + ". " : ""}${str(pro.summary)}`, source: str(pro.source) || null, seed: isSeed(str(pro.source)) });
  }

  const wrk = tasks.workforce?.output as O | undefined;
  if (wrk) {
    const t = wall(str(wrk.available_from) || null);
    out.push({ role: "workforce", want: `${str(wrk.technician) || "—"}${t ? ` from ${t} ${day(str(wrk.available_from), ref)}` : ""}`, when: str(wrk.available_from) || null,
      why: [str(wrk.summary), ...(Array.isArray(wrk.conflicts) ? (wrk.conflicts as string[]) : [])].filter(Boolean).join(" "), source: str(wrk.source) || null, seed: isSeed(str(wrk.source)) });
  }
  return out;
}

/** True when the planners point at different times, i.e. the coordinator had to resolve a disagreement. */
export function disagree(ps: Position[]) {
  const times = new Set(ps.map(p => p.when?.slice(0, 16)).filter(Boolean));
  return times.size > 1 || ps.some(p => p.role === "reliability" && p.want === "ASAP");
}
