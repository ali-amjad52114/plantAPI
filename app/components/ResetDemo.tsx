"use client";
// "Reset demo": confirm → POST /api/demo/reset → follow the demo_resets row live (Realtime + 2 s poll) → reload when done.
// Core's contract (main 0789291, migration 007):
//   POST {force?, by?} → 200 {reset_id}; 409 {error, reset_id, status} only when a reset is already queued/running.
//   demo_resets { id, status 'queued'|'running'|'done'|'failed'|'refused', force, requested_by,
//                 steps jsonb [{at, step, detail}] appended as it runs, summary, error, created_at, updated_at }
//   Refusal is async: the worker sets status 'refused' with `error` (e.g. incidents mid-repair) → offer Force reset.
import "./report.css";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { plantHHMMSS } from "./data/time";

type Step = { at?: string; step?: string; detail?: string };
type Row = { id: string; status?: string; steps?: Step[] | null; summary?: string | null; error?: string | null };
export interface ResetConfig { mock: boolean; supabaseUrl?: string; supabaseAnonKey?: string }

const FINAL = new Set(["done", "failed", "refused"]);
const time = (iso?: string) => plantHHMMSS(iso);

export function ResetDemoButton({ cfg, className, onDone }: { cfg: ResetConfig; className?: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  return (<>
    <button type="button" className={className} onClick={() => setOpen(true)}>Reset demo</button>
    {open && <ResetDialog cfg={cfg} onClose={() => setOpen(false)} onDone={onDone ?? (() => location.reload())} />}
  </>);
}

function ResetDialog({ cfg, onClose, onDone }: { cfg: ResetConfig; onClose: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<"confirm" | "starting" | "following" | "done" | "refused" | "failed" | "error">("confirm");
  const [row, setRow] = useState<Row | null>(null);
  const [note, setNote] = useState<string | null>(null); // e.g. "A reset is already running"
  const [err, setErr] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => () => stop.current(), []);
  useEffect(() => { list.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [row?.steps?.length]);

  async function start(force: boolean) {
    if (cfg.mock) { setErr("Reset isn't available in the demo replay (?mock=1)."); setPhase("error"); return; }
    stop.current(); setRow(null); setNote(null); setErr(null); setPhase("starting");
    try {
      const r = await fetch("/api/demo/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force, by: "dashboard" }) });
      const text = await r.text();
      const j = (() => { try { return JSON.parse(text) as { reset_id?: string; error?: string; status?: string }; } catch { return {}; } })();
      if (r.status === 409) {
        if (!j.reset_id) { setErr(j.error ?? "A reset is already running."); setPhase("error"); return; }
        setNote(`A reset is already ${j.status ?? "running"}. Following it.`);
        follow(j.reset_id); return;
      }
      if (!r.ok || !j.reset_id) {
        const detail = text.trimStart().startsWith("<") ? (r.status === 404 ? "The reset endpoint isn't available on this server." : "") : text.slice(0, 160);
        setErr(j.error ?? `Reset failed to start (${r.status}). ${detail}`.trim()); setPhase("error"); return;
      }
      follow(j.reset_id);
    } catch (e) { setErr((e as Error).message); setPhase("error"); }
  }

  function follow(id: string) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { setErr("Supabase is not configured, so progress can't be shown."); setPhase("error"); return; }
    setPhase("following");
    const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const apply = (r: Row) => {
      setRow(r);
      if (!r.status || !FINAL.has(r.status)) return;
      stop.current();
      if (r.status === "done") { setPhase("done"); setTimeout(onDone, 1800); }
      else if (r.status === "refused") { setErr(r.error ?? "The reset was refused."); setPhase("refused"); }
      else { setErr(r.error ?? "The reset failed."); setPhase("failed"); }
    };
    const poll = async () => { const { data } = await sb.from("demo_resets").select("*").eq("id", id).maybeSingle(); if (data) apply(data as Row); };
    const ch = sb.channel("demo-reset-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_resets", filter: `id=eq.${id}` }, p => p.new && apply(p.new as Row))
      .subscribe();
    const t = setInterval(poll, 2000);
    void poll();
    stop.current = () => { clearInterval(t); sb.removeChannel(ch); };
  }

  const steps = row?.steps ?? [];
  const busy = phase === "starting" || phase === "following";
  const statusWord = phase === "following" ? (row?.status === "queued" ? "Queued: waiting for the worker" : "Running") : null;
  return (
    <div className="rf" role="dialog" aria-modal="true" aria-labelledby="rd-title" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={e => e.preventDefault()}>
        <div className="rf-head"><span className="rf-eyebrow">Demo</span><h2 id="rd-title">Reset demo</h2></div>
        {phase === "confirm" && <p>Archives all incidents, closes open demo Fiix work orders, unblocks Line 2 in Odoo, and refreshes the live schedule and calendar to now. Takes about 2 minutes.</p>}
        {note && <p className="rf-note"><span className="rf-tag">Info</span>{note}</p>}
        {statusWord && <p style={{ margin: 0 }}><span className="rf-spin" aria-hidden="true" style={{ display: "inline-block", verticalAlign: -3, marginRight: 8, borderColor: "rgba(232,101,10,.3)", borderTopColor: "#E8650A" }} />{statusWord}</p>}
        {phase !== "confirm" && phase !== "starting" && (
          <ol ref={list} aria-live="polite" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, maxHeight: 260, overflow: "auto" }}>
            {steps.length === 0 && phase === "following" && <li style={{ color: "#8A94A0", listStyle: "none", marginLeft: -20 }}>Waiting for the first step…</li>}
            {steps.map((s, i) => (
              <li key={i}><b>{s.step ?? "step"}</b>{s.at && <span style={{ color: "#8A94A0", fontFamily: "var(--f-mono, monospace)", fontSize: 12, marginLeft: 8 }}>{time(s.at)}</span>}
                {s.detail && <div style={{ fontSize: 12.5, color: "#5A6573" }}>{s.detail}</div>}</li>))}
          </ol>)}
        {phase === "done" && <p className="rf-note"><span className="rf-tag">Done</span>{row?.summary ?? "Demo reset."} Reloading…</p>}
        {(phase === "refused" || phase === "failed" || phase === "error") && err && <p className="rf-err" role="alert"><span className="rf-tag">{phase === "refused" ? "Refused" : phase === "failed" ? "Failed" : "Error"}</span>{err}</p>}
        <div className="rf-row">
          {phase === "confirm" && <><button type="button" className="rf-btn ghost" onClick={onClose}>Cancel</button><button type="button" className="rf-btn primary" onClick={() => start(false)}>Reset demo</button></>}
          {busy && <button type="button" className="rf-btn primary is-busy" disabled><span className="rf-spin" aria-hidden="true" />Resetting…</button>}
          {phase === "refused" && <><button type="button" className="rf-btn ghost" onClick={onClose}>Cancel</button><button type="button" className="rf-btn primary" onClick={() => start(true)}>Force reset</button></>}
          {(phase === "failed" || phase === "error") && <button type="button" className="rf-btn ghost" onClick={onClose}>Close</button>}
        </div>
      </form>
    </div>
  );
}
