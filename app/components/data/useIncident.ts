"use client";
// One hook, two sources: live Supabase rows (Realtime) or the mock replay (?mock=1).
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AgentEvent, AgentRole, AgentTask, Incident } from "@/lib/contracts/types";
import type { IncidentActions, IncidentView, MockControls } from "./model";
import { MockRun } from "./mock";

export interface SourceConfig { mock: boolean; supabaseUrl?: string; supabaseAnonKey?: string }

export function useIncident(id: string, cfg: SourceConfig) {
  const [view, setView] = useState<IncidentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, force] = useState(0);
  const runRef = useRef<MockRun | null>(null);

  /* ---------- mock ---------- */
  useEffect(() => {
    if (!cfg.mock) return;
    const run = new MockRun(() => { setView(run.view); force(n => n + 1); });
    runRef.current = run;
    setView(run.view);
    return () => run.dispose();
  }, [cfg.mock, id]);

  /* ---------- live ---------- */
  useEffect(() => {
    if (cfg.mock) return;
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { setError("Supabase is not configured. Open this page with ?mock=1 for the demo replay."); return; }
    const sb: SupabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    let alive = true;
    let state: IncidentView | null = null;
    const set = (v: IncidentView) => { state = v; if (alive) setView(v); };

    (async () => {
      const [inc, tasks, events] = await Promise.all([
        sb.from("incidents").select("*").eq("id", id).single(),
        sb.from("agent_tasks").select("*").eq("incident_id", id).order("created_at"),
        sb.from("agent_events").select("*").eq("incident_id", id).order("created_at").limit(2000),
      ]);
      if (inc.error) { setError(`Incident ${id} not found (${inc.error.message}).`); return; }
      set({ incident: inc.data as Incident, tasks: latestTasks((tasks.data ?? []) as AgentTask[]), events: (events.data ?? []) as AgentEvent[] });
    })();

    const ch = sb.channel("incident-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents", filter: `id=eq.${id}` }, p => {
        // Realtime omits unchanged large (TOASTed) JSON columns; merge so triage/plan/etc. are not wiped.
        if (state && p.new) set({ ...state, incident: mergeRow(state.incident, p.new as Partial<Incident>) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tasks", filter: `incident_id=eq.${id}` }, p => {
        const t = p.new as AgentTask;
        if (state && t?.role) { const prev = state.tasks[t.role]; set({ ...state, tasks: { ...state.tasks, [t.role]: prev && prev.id === t.id ? mergeRow(prev, t) : t } }); }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: `incident_id=eq.${id}` }, p => {
        if (state) set({ ...state, events: [...state.events, p.new as AgentEvent] });
      })
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [cfg.mock, cfg.supabaseUrl, cfg.supabaseAnonKey, id]);

  const actions: IncidentActions = useMemo(() => ({
    async approve(decision, note) {
      if (cfg.mock) return runRef.current?.approve(decision, note);
      const r = await fetch(`/api/incidents/${id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, by: "supervisor", note }) });
      if (!r.ok) throw new Error(`Approve failed: ${r.status} ${await r.text()}`);
    },
    async complete({ notes, downtimeMinutes, photo, mockPhoto }) {
      if (cfg.mock) return runRef.current?.complete(mockPhoto ?? "right", notes);
      const fd = new FormData();
      fd.set("notes", notes); fd.set("actual_downtime_minutes", String(downtimeMinutes));
      if (photo) fd.set("photo", photo);
      const r = await fetch(`/api/incidents/${id}/complete`, { method: "POST", body: fd });
      if (!r.ok) throw new Error(`Report failed: ${r.status} ${await r.text()}`);
    },
  }), [cfg.mock, id]);

  const run = runRef.current;
  const mock: MockControls | undefined = cfg.mock && run ? {
    playing: run.playing, started: run.phase >= 0, speed: run.speed,
    play: () => run.play(), pause: () => run.pause(),
    setSpeed: n => { run.speed = n; force(x => x + 1); },
    reset: () => { run.dispose(); const r = new MockRun(() => { setView(r.view); force(x => x + 1); }); runRef.current = r; setView(r.view); },
    holdRole: (role: AgentRole | null) => { run.held = role; force(x => x + 1); },
  } : undefined;

  return { view, error, actions, mock, clock: cfg.mock && run ? run.clock : Date.now(), mockFlags: run?.flags };
}

// agent_tasks can hold several rows per role (retries, re-runs); show the latest.
function latestTasks(rows: AgentTask[]) {
  const out: Partial<Record<AgentRole, AgentTask>> = {};
  for (const t of rows) out[t.role] = t;
  return out;
}

function mergeRow<T extends object>(prev: T, next: Partial<T>): T {
  const out = { ...prev };
  for (const [k, v] of Object.entries(next)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}
