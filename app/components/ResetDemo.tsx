"use client";
// "Reset demo": confirm → POST /api/demo/reset → live progress from Supabase `demo_resets` (Realtime + 2 s poll fallback)
// → reload when done. A refusal (409, e.g. an incident mid-repair) shows the reason and offers "Force reset".
//
// Expected row (core owns the table; UI reads defensively):
//   demo_resets { id uuid, status 'running'|'done'|'failed'|'refused', force bool, reason text|null,
//                 steps jsonb [{ key, label, status: 'pending'|'running'|'done'|'failed'|'skipped', detail? }],
//                 created_at, finished_at }
import "./report.css";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Step = { key?: string; label?: string; status?: string; detail?: string };
type Row = { id: string; status?: string; reason?: string | null; steps?: Step[] | null; finished_at?: string | null };
export interface ResetConfig { mock: boolean; supabaseUrl?: string; supabaseAnonKey?: string }

const DONE = new Set(["done", "failed", "refused"]);
const PLANNED: Step[] = [
  { key: "archive", label: "Archive all incidents" },
  { key: "fiix", label: "Close open demo Fiix work orders" },
  { key: "odoo", label: "Unblock Crushing Line 2 in Odoo" },
  { key: "schedule", label: "Refresh the live schedule and calendar to now" },
];

export function ResetDemoButton({ cfg, className, onDone }: { cfg: ResetConfig; className?: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  return (<>
    <button type="button" className={className} onClick={() => setOpen(true)}>Reset demo</button>
    {open && <ResetDialog cfg={cfg} onClose={() => setOpen(false)} onDone={onDone ?? (() => location.reload())} />}
  </>);
}

function ResetDialog({ cfg, onClose, onDone }: { cfg: ResetConfig; onClose: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<"confirm" | "starting" | "running" | "refused" | "finished" | "error">("confirm");
  const [row, setRow] = useState<Row | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);

  async function start(force: boolean) {
    if (cfg.mock) { setReason("Reset is not available in the demo replay (?mock=1)."); setPhase("error"); return; }
    setPhase("starting"); setReason(null);
    try {
      const r = await fetch("/api/demo/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }) });
      const text = await r.text();
      const j = (() => { try { return JSON.parse(text) as { reset_id?: string; error?: string; reason?: string }; } catch { return {}; } })();
      if (r.status === 409) { setReason(j.reason ?? j.error ?? "The reset was refused."); setPhase("refused"); return; }
      if (!r.ok || !j.reset_id) { setReason(j.error ?? `Reset failed to start (${r.status}). ${text.slice(0, 160)}`); setPhase("error"); return; }
      setPhase("running");
      watch(j.reset_id);
    } catch (e) { setReason((e as Error).message); setPhase("error"); }
  }

  function watch(id: string) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { setReason("Supabase is not configured, so progress can't be shown."); setPhase("error"); return; }
    const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const apply = (r: Row) => {
      setRow(r);
      if (r.status && DONE.has(r.status)) {
        stop.current();
        if (r.status === "done") { setPhase("finished"); setTimeout(onDone, 1500); }
        else if (r.status === "refused") { setReason(r.reason ?? "The reset was refused."); setPhase("refused"); }
        else { setReason(r.reason ?? "The reset failed. See the steps above."); setPhase("error"); }
      }
    };
    const poll = async () => { const { data } = await sb.from("demo_resets").select("*").eq("id", id).maybeSingle(); if (data) apply(data as Row); };
    const ch = sb.channel("demo-reset-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_resets", filter: `id=eq.${id}` }, p => p.new && apply(p.new as Row))
      .subscribe();
    const t = setInterval(poll, 2000); // Realtime may not be enabled on the table yet
    void poll();
    stop.current = () => { clearInterval(t); sb.removeChannel(ch); };
  }

  const steps = (row?.steps?.length ? row.steps : PLANNED) as Step[];
  const busy = phase === "starting" || phase === "running";
  return (
    <div className="rf" role="dialog" aria-modal="true" aria-labelledby="rd-title" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={e => e.preventDefault()}>
        <div className="rf-head"><span className="rf-eyebrow">Demo</span><h2 id="rd-title">Reset demo</h2></div>
        {phase === "confirm" && <p>Archives all incidents, closes open demo Fiix work orders, unblocks Line 2 in Odoo, and refreshes the live schedule and calendar to now. Takes about 2 minutes.</p>}
        {phase !== "confirm" && (
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }} aria-live="polite">
            {steps.map((s, i) => {
              const st = s.status ?? (phase === "starting" || phase === "running" ? (i === 0 && !row ? "running" : "pending") : "pending");
              const mark = st === "done" ? "✓" : st === "failed" ? "✗" : st === "running" ? "…" : st === "skipped" ? "–" : "·";
              const color = st === "done" ? "#1E9E63" : st === "failed" ? "#D93636" : st === "running" ? "#E8650A" : "#8A94A0";
              return <li key={s.key ?? i}><b style={{ color, fontFamily: "var(--f-mono, monospace)", marginRight: 6 }}>{mark}</b>{s.label ?? s.key}{s.detail && <div style={{ fontSize: 12, color: "#5A6573" }}>{s.detail}</div>}</li>;
            })}
          </ol>)}
        {phase === "finished" && <p className="rf-note"><span className="rf-tag">Done</span>Demo reset. Reloading…</p>}
        {(phase === "refused" || phase === "error") && reason && <p className="rf-err" role="alert"><span className="rf-tag">{phase === "refused" ? "Refused" : "Error"}</span>{reason}</p>}
        <div className="rf-row">
          {phase === "confirm" && <><button type="button" className="rf-btn ghost" onClick={onClose}>Cancel</button><button type="button" className="rf-btn primary" onClick={() => start(false)}>Reset demo</button></>}
          {busy && <button type="button" className="rf-btn primary is-busy" disabled><span className="rf-spin" aria-hidden="true" />Resetting…</button>}
          {phase === "refused" && <><button type="button" className="rf-btn ghost" onClick={onClose}>Cancel</button><button type="button" className="rf-btn primary" onClick={() => start(true)}>Force reset</button></>}
          {phase === "error" && <button type="button" className="rf-btn ghost" onClick={onClose}>Close</button>}
        </div>
      </form>
    </div>
  );
}
