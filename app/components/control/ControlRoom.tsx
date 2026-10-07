"use client";
// Incident control room: alarm banner, state line, agent annunciator, procedure, monitor wall, session trend, event journal.
// Renders only contract rows (incident, agent_tasks, agent_events) so live and mock look identical.
import "./hmi.css";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AgentEvent, AgentRole, AgentTask, IncidentStatus } from "@/lib/contracts/types";
import { incidentPanels } from "../panels";
import { LANES, ROLE_LABEL, SYSTEM_LABEL, WEB_ROLES } from "../data/model";
import { PAGE_URL } from "../data/mock";
import { useIncident, type SourceConfig } from "../data/useIncident";
import { Screen, type SessionScreen } from "./Screen";
import { ReportFailure } from "../ReportFailure";
import { disagree, positions, wall } from "./proposals";

const STATES: IncidentStatus[] = ["NEW", "TRIAGING", "PLANNING", "WAITING_APPROVAL", "APPROVED", "EXECUTING", "WAITING_REPAIR", "VERIFYING", "CLOSED"];
type Pri = 0 | 1 | 2 | "a";
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "—");
// Plan times are written in the plant's own offset (e.g. -04:00); show that wall-clock time, not the browser's.
const plantHHMM = (iso?: string | null) => iso?.match(/T(\d\d:\d\d)/)?.[1] ?? hhmm(iso);
const dayWord = (iso: string, ref: string) => (iso.slice(0, 10) === ref.slice(0, 10) ? "TODAY" : iso.slice(0, 10) > ref.slice(0, 10) ? "TMRW" : iso.slice(0, 10));
const roleState = (t?: AgentTask) => !t ? "idle" : t.status === "RUNNING" ? "run" : t.status === "COMPLETE" ? "done" : t.status === "FAILED" ? "fail" : "queued";

export function ControlRoom({ id, cfg, asset }: { id: string; cfg: SourceConfig; asset?: string }) {
  const { view, error, actions, mock, clock, mockFlags } = useIncident(id, cfg);
  const [focus, setFocus] = useState<AgentRole>("triage");
  const [pinned, setPinned] = useState(false);
  const [manual, setManual] = useState<{ role: AgentRole; page: string; back: string[] } | null>(null);
  const [modify, setModify] = useState(false);
  const [win, setWin] = useState<"today" | "tmrw">("today");
  const [photo, setPhoto] = useState<"wrong" | "right" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState(cfg.mock ? "Replaced contactor LC1D09BD. LOTO-CV104 applied and removed. Motor runs, no trip after 10 min." : "");
  const [downtime, setDowntime] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const q = cfg.mock ? "?mock=1" : "";

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    if (!asset) return;
    const a = asset.toUpperCase();
    setToast(`${a} has no open incident of its own. Showing the open incident on this site.`);
  }, [asset]);

  const tasks = view?.tasks ?? {};
  const events = view?.events ?? [];
  const inc = view?.incident;

  /* ----- per-agent sessions derived from events ----- */
  const sessions = useMemo(() => {
    const out = {} as Record<AgentRole, SessionScreen & { note: string; calls: number; state: string; sid: string }>;
    for (const lane of LANES) for (const role of lane.roles) {
      const evs = events.filter(e => e.agent === role);
      const t = tasks[role];
      let page: string | null = null, hl: string | null = null, shot: string | null = null, url: string | null = null;
      for (const e of evs) {
        const d = (e.data ?? {}) as Record<string, unknown>;
        if (typeof d.page === "string") { page = d.page; hl = (d.hl as string) ?? null; url = PAGE_URL[page] ?? null; }
        else if (typeof d.hl === "string") hl = d.hl;
        if (typeof d.screenshot_url === "string") { shot = d.screenshot_url; url = (d.url as string) ?? url; page = null; }
      }
      const lines = evs.map(e => e.kind === "status" ? "# " + e.message : e.kind === "error" && !e.message.startsWith("✗") ? "✗ " + e.message : e.message);
      const last = [...evs].reverse().find(e => !e.message.startsWith("#"));
      const state = mock && manual?.role === role ? "ctl" : roleState(t);
      out[role] = {
        role, label: ROLE_LABEL[role], running: t?.status === "RUNNING" && manual?.role !== role,
        page: manual?.role === role ? manual.page : page, hl, url: manual?.role === role ? PAGE_URL[manual.page] ?? null : url,
        screenshotUrl: shot, lines,
        note: state === "ctl" ? "you have control" : t?.status === "FAILED" ? (t.error ?? "failed") : (last?.message ?? "").replace(/^[→←↪✓✗!#]\s*/, "").slice(0, 60),
        calls: evs.filter(e => e.kind === "tool").length, state,
        sid: inc?.agent37_session_ids?.[role] ?? "no session",
      };
    }
    return out;
  }, [events, tasks, manual, mock, inc?.agent37_session_ids]);

  // monitor wall = the latest group of sessions to start (one phase); main monitor auto-follows unless pinned
  const wall = useMemo(() => {
    const started = (Object.values(tasks) as AgentTask[]).filter(t => t.started_at);
    if (!started.length) return [] as AgentRole[];
    const latest = Math.max(...started.map(t => +new Date(t.started_at!)));
    return LANES.flatMap(l => l.roles).filter(r => tasks[r]?.started_at && latest - +new Date(tasks[r]!.started_at!) < 30e3);
  }, [tasks]);
  useEffect(() => {
    if (pinned || manual) return;
    const pick = wall.find(r => WEB_ROLES.includes(r) && tasks[r]?.status === "RUNNING") ?? wall.find(r => tasks[r]?.status === "RUNNING") ?? wall[0];
    if (pick && pick !== focus) setFocus(pick);
  }, [wall, tasks, pinned, manual, focus]);

  if (error) return <div className="cr"><Header q={q} clock={clock} onReport={() => setReport(true)} /><main className="wrap"><p className="note warn">{error}</p></main></div>;
  if (!inc) return <div className="cr"><Header q={q} clock={clock} onReport={() => setReport(true)} /><main className="wrap"><p className="dim">Loading incident…</p></main></div>;

  const status = inc.status;
  const tri = inc.triage, plan = inc.plan, ver = inc.verification;
  const rejected = ver?.verdict === "reject" && status === "WAITING_REPAIR";
  const closed = status === "CLOSED";
  const gateApproval = status === "WAITING_APPROVAL";
  const gateRepair = status === "WAITING_REPAIR";
  const riskDone = !tasks.risk || tasks.risk.status === "COMPLETE";
  const pos = positions(inc, tasks);
  const riskOut = tasks.risk?.output as { decision?: string; loto_required?: boolean; hazards?: string[]; summary?: string } | null | undefined;
  const ctx = { triaged: !!tri, wo: !!mockFlags?.wo || !!inc.erp, closed: closed || !!mockFlags?.closed, basket: 0 };
  const asset104 = tri?.asset_id ?? "ASSET";

  const act = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } catch (e) { setToast((e as Error).message); } finally { setBusy(false); } };
  const focusOn = (r: AgentRole) => { if (manual && manual.role !== r) handBack(); setFocus(r); setPinned(true); };
  const takeControl = () => {
    const s = sessions[focus];
    if (!mock) return setToast("Live take-over needs the Agent37 live browser view (wave B, S4).");
    if (!s.page) return;
    setManual({ role: focus, page: s.page, back: [] }); mock.holdRole(focus);
  };
  const handBack = () => { setManual(null); mock?.holdRole(null); };
  const onGo = (p: string) => {
    if (!manual) return setToast("Take control to use this browser yourself.");
    if (p === "act:basket") return setToast("Added to basket. PlantAPI never completes a purchase.");
    if (p.startsWith("act:")) return setToast("The agents do this step during the run.");
    setManual({ ...manual, page: p, back: [...manual.back, manual.page] });
  };

  /* ----- banner ----- */
  let bpri: Pri = 1, bmsg = `${hhmm(inc.created_at)} · ${inc.alarm_text.replace(/^\d\d:\d\d:\d\d\s*/, "")} · ${tri?.asset_id ?? "ASSET"} DOWN`;
  if (closed) { bpri = 0; bmsg = `${hhmm(inc.updated_at)} · INCIDENT CLOSED · ${asset104} RUNNING · LINE RELEASED`; }
  else if (gateApproval) { bpri = "a"; bmsg = `ACTION · APPROVE REPAIR PLAN FOR ${asset104}`; }
  else if (gateRepair) { bpri = "a"; bmsg = rejected ? "ACTION · EVIDENCE REJECTED · SEND PHOTO OF INSTALLED PART" : `ACTION · TECHNICIAN TO REPORT REPAIR${inc.erp?.fiix_wo_code ? " ON " + inc.erp.fiix_wo_code : ""}`; }
  else if (manual) { bpri = "a"; bmsg = `MANUAL · YOU HAVE THE ${ROLE_LABEL[manual.role].toUpperCase()} BROWSER · OTHER SESSIONS RUNNING`; }

  const idx = STATES.indexOf(status);
  const fs = sessions[focus];
  const journal = [...events].reverse().filter(e => !(e.data as Record<string, unknown> | undefined)?.quiet && e.kind !== "tool").slice(0, 300);

  return (
    <div className="cr">
      <Header q={q} clock={clock} onReport={() => setReport(true)} />
      <main className="wrap">
        <section className="stack">
          <div className="banner">
            <div className="msg"><Glyph p={bpri} /><span className={"m " + (bpri === 1 ? "c-warn" : bpri === "a" ? "c-act" : "")} style={{ fontWeight: 700 }}>{bmsg}</span></div>
            {mock && <div className="ctrls">
              <button className={"pb" + (mock.playing ? " on" : "")} disabled={gateApproval || gateRepair || closed} onClick={() => mock.playing ? mock.pause() : mock.play()}>{mock.playing ? "Hold" : mock.started ? "Resume" : "Run agents"}</button>
              <button className="pb ghost" onClick={() => mock.setSpeed(mock.speed === 1 ? 2 : mock.speed === 2 ? 4 : 1)}>{mock.speed}×</button>
              <button className="pb ghost" onClick={() => { handBack(); setPinned(false); setPhoto(null); mock.reset(); }}>Reset</button>
            </div>}
          </div>

          <div className="fma">{STATES.map((s, i) => (
            <div key={s} className={closed ? (i === idx ? "now" : "done") : i < idx ? "done" : i === idx ? "now" + (s.startsWith("WAITING") ? " wait" : "") : ""}>{s.replace("_", " ")}</div>
          ))}{(status === "FAILED" || status === "REJECTED") && <div className="now" style={{ background: "var(--warn)" }}>{status}</div>}</div>

          <div className="ann" aria-label="Agent annunciator panel">{LANES.map(lane => {
            const n = lane.roles.filter(r => tasks[r]?.status === "RUNNING").length;
            const now = lane.roles.some(r => tasks[r]?.status === "RUNNING");
            return (
              <div className="ann-g" key={lane.name}>
                <span className={now ? "now" : ""}>{lane.name.toUpperCase()}{n > 1 ? ` · ${n} PARALLEL` : ""}</span>
                <div className="ann-row">{lane.roles.map(r => { const s = sessions[r];
                  return (
                    <button key={r} className={`win ${s.state === "idle" || s.state === "queued" ? "" : s.state}${focus === r ? " focus" : ""}`} onClick={() => focusOn(r)} aria-label={`${s.label} session, ${s.state}`}>
                      <span className="k">{WEB_ROLES.includes(r) ? "WEB" : "API"}</span><b>{s.label}</b>
                      <small>{s.state === "idle" ? (tasks[r] ? "queued" : "idle") : s.note + (s.calls ? " · " + s.calls : "")}</small>
                    </button>); })}</div>
              </div>); })}</div>

          <div className="cols">
            {/* ---------------- procedure ---------------- */}
            <div className="pane">
              <h2>Procedure <span>{tri?.asset_id ?? "intake"} · {inc.id.slice(0, 8)}</span></h2>
              <div className="sec"><div className="cap">Failure</div>
                <div className="evid">
                  {inc.photo_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="shot" src={inc.photo_url} alt="Reported failure" style={{ objectFit: "cover", width: "100%" }} /> : <div className="shot">no photo</div>}
                  <div className="alarmtext">{inc.alarm_text}</div>
                </div>
                <Ln k="Asset" v={tri ? `${tri.asset_id}` : <span className="dim pulse">ANALYSING</span>} />
                <Ln k="Fault" v={tri ? tri.suspected_component : "—"} />
                <Ln k="Part" v={tri ? tri.suspected_part : "—"} />
                <Ln k="Severity" v={tri ? tri.severity : "—"} cls={tri && (tri.severity === "high" || tri.severity === "critical") ? "c-warn" : ""} />
                <Ln k="Trade" v={tri ? tri.required_trade : "—"} />
                <Ln k="Line" v={closed ? "RUNNING" : "STOPPED"} cls={closed ? "" : "c-warn"} />
              </div>
              {status === "NEW" && mock && !mock.started && <div className="sec"><p className="note act">Press <b>Run agents</b>. Eleven agents take this failure from the photo to a closed work order. You make one decision.</p></div>}

              {(status === "PLANNING" || gateApproval) && (
                <div className="sec"><div className="cap"><span>Planner positions</span><span className="c-agent">{pos.length && disagree(pos) ? "DISAGREE" : "AGENT"}</span></div>
                  {(["reliability", "materials", "production", "workforce"] as AgentRole[]).filter(r => r === "materials" || tasks[r]).map(r => {
                    const p = pos.find(x => x.role === r);
                    return (<div key={r}>
                      <Ln k={ROLE_LABEL[r]} v={p ? p.want : tasks[r]?.status === "FAILED" ? "FAILED" : <span className="dim pulse">WORKING</span>} cls={tasks[r]?.status === "FAILED" ? "c-warn" : "c-agent"} />
                      {p && <div className="why">{p.why}{p.source && <><br /><span className={p.seed ? "c-caut" : "dim"}>source: {p.source}{p.seed ? " (seed file, not live)" : ""}</span></>}</div>}
                    </div>);
                  })}
                </div>)}

              {plan && (status === "PLANNING" || gateApproval) && (
                <div className="sec"><div className="cap"><span>Coordinator plan</span><span>{riskDone ? "RISK CHECKED" : <span className="blink">RISK CHECK</span>}</span></div>
                  <div className="bigplan">REPAIR {plantHHMM(plan.window_start)} {dayWord(plan.window_start, inc.created_at)}</div>
                  {pos.length > 1 && <div className="resolve">
                    <span className="cap">Resolution</span>
                    {pos.map(p => <div key={p.role} className={"rv" + (p.when && plan.window_start.slice(0, 16) !== p.when.slice(0, 16) ? " lost" : "")}><b>{ROLE_LABEL[p.role]}</b> {p.want}</div>)}
                    <div className="rv win"><b>Coordinator</b> {plantHHMM(plan.window_start)} {dayWord(plan.window_start, inc.created_at)}</div>
                  </div>}
                  {plan.actions.map((a, i) => <Ln key={i} k={a.action} v={a.rule} cls={"tag " + (a.rule === "APPROVAL" && riskDone ? "c-act" : a.rule === "DENY" ? "c-warn" : "")} />)}
                  <Ln k="Window" v={`${plantHHMM(plan.window_start)}–${plantHHMM(plan.window_end)}`} />
                  <Ln k="Technician" v={plan.technician} />
                  {riskOut && <Ln k="Risk" v={`${riskOut.decision ?? "—"}${riskOut.loto_required ? " · LOTO" : ""}`} cls={riskOut.decision === "DENY" ? "c-warn" : "c-act"} why={(riskOut.hazards ?? []).join(" · ") || riskOut.summary} />}
                  {plan.safety.length > 0 && <ul className="safety">{plan.safety.map(x => <li key={x}>{x}</li>)}</ul>}
                  <div className="why" style={{ marginTop: 6 }}>{plan.rationale}</div>
                  {gateApproval && modify && (
                    <div className="modify"><label className="cap" htmlFor="modwin">Move repair window</label>
                      <select id="modwin" value={win} onChange={e => setWin(e.target.value as "today" | "tmrw")}><option value="today">As planned</option><option value="tmrw">07:00 tomorrow</option></select>
                      <div className="btnrow"><button className="pb" disabled={busy} onClick={() => act(async () => { await actions.approve("approve", win === "tmrw" ? "tmrw: move the repair window to 07:00 tomorrow" : undefined); setModify(false); })}>Approve with change</button><button className="pb ghost" onClick={() => setModify(false)}>Cancel</button></div>
                    </div>)}
                  {gateApproval && (
                    <div className="btnrow">
                      <button className="pb act" disabled={busy} onClick={() => act(() => actions.approve("approve"))}>Approve</button>
                      <button className="pb" disabled={busy} onClick={() => setModify(true)}>Modify</button>
                      <button className="pb no" disabled={busy} onClick={() => act(() => actions.approve("reject"))}>Reject</button>
                    </div>)}
                </div>)}

              {(status === "APPROVED" || status === "EXECUTING") && (
                <div className="sec"><div className="cap">Approved · executing</div>
                  {(["procurement", "erp", "dispatch"] as AgentRole[]).filter(r => tasks[r]).map(r => <Ln key={r} k={ROLE_LABEL[r]} v={tasks[r]!.status} cls={tasks[r]!.status === "RUNNING" ? "c-agent" : tasks[r]!.status === "FAILED" ? "c-warn" : ""} />)}
                  <ExecDetails tasks={tasks} />
                  {inc.erp && <Ln k="Work order" v={inc.erp.fiix_wo_code || "NOT CREATED"} cls={inc.erp.fiix_wo_code ? "" : "c-warn"} />}
                </div>)}

              {(gateRepair || status === "VERIFYING") && (
                <div className="sec"><div className="cap"><span>Technician report</span><span>{inc.erp?.fiix_wo_code || ""}</span></div>
                  {plan && <Ln k="Technician" v={plan.technician} />}
                  {rejected && <p className="note warn" style={{ margin: "6px 0" }}>Evidence rejected: {ver?.reason}</p>}
                  <label className="cap dim" htmlFor="technote" style={{ marginTop: 6 }}>Repair notes</label>
                  <textarea id="technote" value={notes} disabled={!gateRepair} onChange={e => setNotes(e.target.value)} />
                  <label className="cap dim" htmlFor="downtime" style={{ marginTop: 6 }}>Actual downtime (minutes)</label>
                  <input id="downtime" type="number" min={0} value={downtime} disabled={!gateRepair} onChange={e => setDowntime(e.target.value)} style={{ padding: 6, border: "1px solid var(--rule)", background: "#f2f3f1", font: "12px var(--fm)" }} />
                  <span className="cap dim" style={{ marginTop: 6 }}>Completion photo</span>
                  {mock ? (
                    <div className="choices">
                      <button className="choice" aria-pressed={photo === "wrong"} disabled={!gateRepair} onClick={() => setPhoto("wrong")}><div className="shot bad">IMG_2077.jpg</div>CHNT NCH8-63 · 63 A</button>
                      <button className="choice" aria-pressed={photo === "right"} disabled={!gateRepair} onClick={() => setPhoto("right")}><div className="shot ok">IMG_2079.jpg</div>TeSys-D style · 9 A</button>
                    </div>
                  ) : <input type="file" accept="image/*" disabled={!gateRepair} onChange={e => setFile(e.target.files?.[0] ?? null)} />}
                  <div className="btnrow">
                    <button className={"pb" + (gateRepair ? " act" : "")} disabled={!gateRepair || busy} onClick={() => {
                      if (mock ? !photo : !file) return setToast("Choose a completion photo first.");
                      if (!mock && (!notes.trim() || downtime === "")) return setToast("Add repair notes and the actual downtime.");
                      act(async () => { await actions.complete({ notes, downtimeMinutes: Number(downtime || 0), photo: file, mockPhoto: photo ?? undefined }); setPhoto(null); });
                    }}>{status === "VERIFYING" ? "Verifying" : "Report repair done"}</button>
                  </div>
                </div>)}

              {closed && (
                <div className="sec"><div className="cap"><span>Closed</span><span className="c-ok">{hhmm(inc.updated_at)}</span></div>
                  {ver?.checks.map(c => <Ln key={c.name} k={c.name} v={c.pass ? "PASS" : "FAIL"} cls={c.pass ? "c-ok" : "c-warn"} />)}
                  <Ln k="Fiix WO" v={ver?.fiix_closed ? "CLOSED" : "OPEN"} cls={ver?.fiix_closed ? "c-ok" : "c-warn"} />
                  <Ln k="Line" v={ver?.odoo_unblocked ? "RELEASED" : "BLOCKED"} cls={ver?.odoo_unblocked ? "c-ok" : "c-warn"} />
                  <Ln k="Agent sessions" v={String(Object.keys(inc.agent37_session_ids ?? {}).length)} />
                  {ver?.reason && <div className="why">{ver.reason}</div>}
                </div>)}

              {/* real evidence from each system, as written by the engine */}
              {(inc.materials || inc.erp || Object.values(tasks).some(t => t?.agent37_response_id)) && (
                <div className="sec"><div className="cap">Evidence</div>
                  {inc.materials?.monid_tool && <Ln k="Monid tool" v={inc.materials.monid_tool} />}
                  {inc.materials && (() => { const sp = inc.materials.suppliers[inc.materials.recommended_index]; return sp ? <Ln k="Supplier" v={sp.url ? <a href={sp.url} target="_blank" rel="noreferrer">{sp.supplier} {sp.currency} {sp.price}</a> : `${sp.supplier} ${sp.currency} ${sp.price}`} /> : null; })()}
                  {inc.materials?.odoo_product_id != null && <Ln k="Odoo product" v={`#${inc.materials.odoo_product_id} · stock ${inc.materials.internal_stock}`} />}
                  {inc.erp && (inc.erp.fiix_wo_code
                    ? <Ln k="Fiix WO" v={`${inc.erp.fiix_wo_code} · ${ver?.fiix_closed ? "CLOSED" : inc.erp.fiix_wo_status}`} cls={ver?.fiix_closed ? "c-ok" : ""} />
                    : <><Ln k="Fiix WO" v="NOT CREATED" cls="c-warn" /><div className="why">{inc.erp.summary}</div></>)}
                  {inc.erp?.odoo_block_ref && <Ln k="Odoo block" v={`${inc.erp.odoo_block_ref}${ver?.odoo_unblocked ? " · RELEASED" : ""}`} cls={ver?.odoo_unblocked ? "c-ok" : ""} />}
                  {inc.erp?.screenshot_path && <Ln k="WO screenshot" v={inc.erp.screenshot_path} />}
                  {(Object.values(tasks) as AgentTask[]).filter(t => t.agent37_response_id).map(t => <Ln key={t.role} k={`Agent37 ${ROLE_LABEL[t.role]}`} v={t.agent37_response_id!} />)}
                </div>)}
            </div>

            {/* ---------------- monitor wall ---------------- */}
            <div className="pane">
              <h2>Monitor wall <span>{wall.length ? `${wall.filter(r => tasks[r]?.status === "RUNNING").length} live · ${wall.length} this step` : "no sessions"}</span></h2>
              <div className="mon">
                <div className="mon-bar"><span className="chip">{fs.label.toUpperCase()} · {fs.sid}</span><span className={"live" + (fs.running ? "" : " off")}>LIVE</span><span className="sp" /><span className="chip">{manual?.role === focus ? "MANUAL · YOU" : fs.state === "run" ? "AGENT DRIVING" : fs.state === "done" ? "COMPLETE" : fs.state === "fail" ? "FAILED" : "IDLE"}</span></div>
                <div className="mon-bar">
                  <div className="nav">
                    <button aria-label="Back" disabled={!manual || manual.role !== focus || !manual.back.length} onClick={() => manual && setManual({ ...manual, page: manual.back[manual.back.length - 1], back: manual.back.slice(0, -1) })}>&#8249;</button>
                  </div>
                  <input className="burl" readOnly value={fs.url ?? (WEB_ROLES.includes(focus) ? "about:blank" : `agent37://sessions/${fs.sid}`)} aria-label="Address" />
                </div>
                <Screen s={fs} ctx={ctx} manual={manual?.role === focus} onGo={onGo} />
                <div className="mon-foot">
                  <p>{manual?.role === focus ? `You are driving ${fs.label}'s browser. Only ${fs.label} is paused; the other sessions keep running.`
                    : fs.page || fs.screenshotUrl ? `Watching ${fs.label} live.${mock ? " Take control to drive this browser yourself." : ""}`
                    : WEB_ROLES.includes(focus) ? `${fs.label} has a browser but hasn't opened a page yet.` : `${fs.label} works through tool calls (app connections, Monid, OpenAI, files). There is no browser to take over.`}</p>
                  <button className={"pb" + (manual?.role === focus ? " act" : "")} disabled={!(fs.page || fs.screenshotUrl)} onClick={() => manual?.role === focus ? handBack() : takeControl()}>
                    {manual?.role === focus ? `Hand back to ${fs.label}` : "Take control"}</button>
                </div>
              </div>
              <div className="wall">{wall.length ? wall.map((r, n) => { const s = sessions[r];
                return (
                  <button key={r} className={"tile" + (focus === r ? " focus" : "") + (manual?.role === r ? " ctl" : "")} onClick={() => focusOn(r)} aria-label={`Show ${s.label} on the main monitor`}>
                    <div className="lab"><span>CH{String(n + 1).padStart(2, "0")} {s.label.toUpperCase()}</span><span className={"st " + s.state}>{s.state === "run" ? "● LIVE" : s.state === "ctl" ? "YOU" : s.state.toUpperCase()}</span></div>
                    <Screen s={s} ctx={ctx} scale={0.4} />
                    <div className="tcap">{s.lines[s.lines.length - 1] ?? ""}</div>
                  </button>); })
                : <p className="empty">Each agent runs in its own Agent37 session. Their screens appear here when they start.</p>}</div>
            </div>

            {/* ---------------- trend + journal ---------------- */}
            <div className="stack">
              <div className="pane"><h2>Session trend <span>idle gaps folded</span></h2><Trend tasks={tasks} manualRole={manual?.role} now={clock} /></div>
              <div className="pane"><h2>Event journal <span>{journal.length} events</span></h2>
                <div className="jwrap"><table className="j"><thead><tr><th>TIME</th><th>PRI</th><th>SRC</th><th>MESSAGE</th></tr></thead>
                  <tbody>{journal.map((e, i) => { const p = priOf(e); return (
                    <tr key={e.id ?? i}><td>{hhmm(e.created_at)}</td><td><Glyph p={p} /></td><td>{e.system ? SYSTEM_LABEL[e.system] ?? e.system.toUpperCase() : e.agent.toUpperCase()}</td>
                      <td className={p === 1 ? "c-warn" : p === "a" ? "c-act" : ""}>{e.message}</td></tr>); })}</tbody></table></div>
              </div>
            </div>
          </div>

          {incidentPanels.map(P => <div className="pane" key={P.id}><h2>{P.title}</h2><div style={{ padding: 10 }}><P.Component incident={inc} /></div></div>)}
        </section>
      </main>
      {report && <ReportFailure mock={cfg.mock} onClose={() => setReport(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Header({ q, clock, onReport }: { q: string; clock: number; onReport: () => void }) {
  return (
    <header className="top">
      <Link className="back" href={"/" + q} title="Back to the 3D site view">&#8249;&nbsp;SITE</Link>
      <div className="word"><i aria-hidden="true" />PLANTAPI</div>
      <div className="clock"><small>PLANT TIME</small>{new Date(clock).toTimeString().slice(0, 5)}</div>
      {q && <div className="mock">DEMO REPLAY · EXAMPLE DATA</div>}
      <nav><button onClick={onReport} style={{ color: "#fff" }}>REPORT FAILURE</button></nav>
    </header>
  );
}

function Ln({ k, v, cls = "", why }: { k: string; v: React.ReactNode; cls?: string; why?: string }) {
  return (<>
    <div className="ln"><span className="k">{k}</span><span className="dots" /><span className={"v " + cls}>{v}</span></div>
    {why && <div className="why">{why}</div>}
  </>);
}

function Glyph({ p }: { p: Pri }) {
  if (p === 1) return <span className="pri p1">1</span>;
  if (p === 2) return <span className="pri p2">2</span>;
  if (p === "a") return <span className="pri pa">!</span>;
  return null;
}
function priOf(e: AgentEvent): Pri {
  const d = (e.data ?? {}) as { pri?: Pri };
  if (d.pri) return d.pri;
  return e.kind === "error" ? 1 : 0;
}

// Session timeline with idle gaps (waiting for people) folded, so parallel runs stay readable.
function Trend({ tasks, manualRole, now }: { tasks: Partial<Record<AgentRole, AgentTask>>; manualRole?: AgentRole; now: number }) {
  const rows = LANES.flatMap(l => l.roles).map(r => tasks[r]).filter((t): t is AgentTask => !!t?.started_at);
  if (!rows.length) return <div className="trend"><p className="dim" style={{ margin: 0, fontSize: 12 }}>One row per agent session. Overlapping bars ran in parallel.</p></div>;
  const iv = rows.map(t => [+new Date(t.started_at!), t.finished_at ? +new Date(t.finished_at) : Math.max(+new Date(t.started_at!), now)] as const);
  const sorted = [...iv].sort((a, b) => a[0] - b[0]);
  const GAP = 60e3; // a folded idle gap is drawn as one minute
  const segs: [number, number][] = [];
  for (const [s, e] of sorted) { const l = segs[segs.length - 1]; if (l && s <= l[1]) l[1] = Math.max(l[1], e); else segs.push([s, e]); }
  const map = (t: number) => { let x = 0; for (let i = 0; i < segs.length; i++) { const [s, e] = segs[i]; if (t <= s) return x; if (t <= e) return x + (t - s); x += (e - s) + (i < segs.length - 1 ? GAP : 0); } return x; };
  const total = Math.max(1, map(segs[segs.length - 1][1]));
  return (
    <div className="trend">
      {rows.map((t, i) => {
        const a = map(iv[i][0]), b = map(iv[i][1]);
        const c = manualRole === t.role ? "ctl" : t.status === "RUNNING" ? "run" : t.status === "FAILED" ? "fail" : "";
        return <div className="tr" key={t.role}><span>{ROLE_LABEL[t.role]}</span><div className="track"><div className={"bar " + c} style={{ left: `${a / total * 100}%`, width: `${Math.max(.8, (b - a) / total * 100)}%` }} /></div></div>;
      })}
      <div className="axis"><span>{hhmm(new Date(segs[0][0]).toISOString())}</span><span>{segs.length > 1 ? `${segs.length - 1} idle gap${segs.length > 2 ? "s" : ""} folded` : ""}</span><span>{hhmm(new Date(segs[segs.length - 1][1]).toISOString())}</span></div>
    </div>
  );
}

// Procurement + Dispatch results (real outputs): expedite email, supplier record, notices with their refs, technician ack.
function ExecDetails({ tasks }: { tasks: Partial<Record<AgentRole, AgentTask>> }) {
  const pr = tasks.procurement?.output as { supplier?: string; supplier_record_ref?: string | null; expedite_email?: { to: string; sent: boolean; message_id: string | null } | null; blocked?: string[] } | null | undefined;
  const dp = tasks.dispatch?.output as { technician?: string; booked_start?: string; notices?: { channel: string; to: string; ref: string | null; status: string }[]; ack_received?: boolean; follow_up?: string | null } | null | undefined;
  return (<>
    {pr?.supplier_record_ref && <Ln k="Supplier record" v={pr.supplier_record_ref} />}
    {pr?.expedite_email && <Ln k="Expedite email" v={pr.expedite_email.sent ? `SENT ${pr.expedite_email.message_id ?? ""}` : "NOT SENT"} cls={pr.expedite_email.sent ? "" : "c-caut"} why={pr.expedite_email.to} />}
    {pr?.blocked?.map(b => <Ln key={b} k="Procurement" v="BLOCKED" cls="c-caut" why={b} />)}
    {dp?.booked_start && <Ln k="Booked" v={`${dp.technician ?? ""} ${wall(dp.booked_start) ?? ""}`} />}
    {dp?.notices?.map((n, i) => <Ln key={i} k={`${n.channel} → ${n.to}`} v={`${n.status.toUpperCase()}${n.ref ? " · " + n.ref : ""}`} cls={n.status === "failed" ? "c-warn" : n.status === "blocked" ? "c-caut" : ""} />)}
    {dp && <Ln k="Technician ack" v={dp.ack_received ? "RECEIVED" : dp.follow_up ? `FOLLOW-UP ${dp.follow_up}` : "WAITING"} cls={dp.ack_received ? "c-ok" : "c-caut"} />}
  </>);
}
