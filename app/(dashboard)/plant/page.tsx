// "/plant" — plant panels from real sources: Agent37 (instance, budget, usage, metrics, logs, sessions, crons, backups, files)
// and Supabase (incidents.cost, agent_events per system). Server component: keys never reach the browser.
import "@/app/components/control/hmi.css";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import * as a37 from "@/app/components/plant/agent37";
import { SYSTEM_LABEL } from "@/app/components/data/model";

export const dynamic = "force-dynamic";
export const metadata = { title: "PlantAPI · Plant" };

const usd = (micros: number) => `$${(micros / 1e6).toFixed(2)}`;
const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const kb = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function Ln({ k, v, cls = "" }: { k: React.ReactNode; v: React.ReactNode; cls?: string }) {
  return <div className="ln"><span className="k">{k}</span><span className="dots" /><span className={"v " + cls}>{v}</span></div>;
}
function Err({ e }: { e: string }) { return <p className="note warn" style={{ margin: 10 }}>Not available: {e}</p>; }

function Spark({ pts, label, max }: { pts: [number, number][]; label: string; max?: number }) {
  if (!pts.length) return null;
  const w = 260, h = 44, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = max ?? Math.max(...ys, 0.0001);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${((p[0] - x0) / Math.max(1, x1 - x0) * w).toFixed(1)},${(h - p[1] / y1 * (h - 4)).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1][1];
  return (
    <div style={{ padding: "6px 10px" }}>
      <div className="ln"><span className="k">{label}</span><span className="dots" /><span className="v">{last.toFixed(3)}</span></div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`${label} trend`}>
        <path d={`${d} L${w},${h} L0,${h} Z`} fill="var(--well)" /><path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

export default async function PlantPage() {
  const sbUrl = process.env.SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const sb = sbUrl && sbKey ? createClient(sbUrl, sbKey) : null;
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const [inst, bud, use, met, cr, bk, ses, fl, lg, incs, evs] = await Promise.all([
    a37.instance(), a37.budget(), a37.usage(), a37.metrics(), a37.crons(), a37.backups(), a37.sessions(), a37.files(), a37.logs(),
    sb ? sb.from("incidents").select("id,title,status,cost,created_at").order("created_at", { ascending: false }).limit(12) : null,
    sb ? sb.from("agent_events").select("system,kind,created_at").gte("created_at", since).not("system", "is", null).limit(5000) : null,
  ]);

  // connected systems = real evidence: events per system in the last 24 h (Agent37 has no integrations endpoint)
  const sys = new Map<string, { n: number; err: number; last: string }>();
  for (const e of (evs?.data ?? []) as { system: string; kind: string; created_at: string }[]) {
    const s = sys.get(e.system) ?? { n: 0, err: 0, last: e.created_at };
    s.n++; if (e.kind === "error") s.err++; if (e.created_at > s.last) s.last = e.created_at;
    sys.set(e.system, s);
  }
  const logTail = lg.ok ? lg.data.logs.trim().split("\n").slice(-12) : [];

  return (
    <div className="cr">
      <header className="top">
        <Link className="back" href="/">&#8249;&nbsp;SITE</Link>
        <div className="word"><i aria-hidden="true" />PLANTAPI</div>
        <div className="clock"><small>PLANT</small>{inst.ok ? inst.data.id : "—"}</div>
        <nav><Link href="/plant" style={{ color: "#fff", display: "flex", alignItems: "center", padding: "0 16px", fontWeight: 700, fontSize: 11, letterSpacing: ".1em" }}>PLANT</Link>
          <Link href="/governance" style={{ color: "#9aa09b", display: "flex", alignItems: "center", padding: "0 16px", fontWeight: 700, fontSize: 11, letterSpacing: ".1em" }}>GOVERNANCE</Link></nav>
      </header>
      <main className="wrap">
        <div className="grid3">
          <div className="pane"><h2>Agent37 plant instance <span>live</span></h2>
            {inst.ok ? <div className="sec">
              <Ln k="Instance" v={inst.data.id} /><Ln k="Status" v={inst.data.status.toUpperCase()} cls={inst.data.status === "running" ? "c-ok" : "c-caut"} /><Ln k="Template" v={inst.data.template} />
              {bud.ok && <><Ln k="Budget" v={`${usd(bud.data.monthly_consumed_micros)} / ${usd(bud.data.monthly_cap_micros)}`} /><Ln k="Remaining" v={usd(bud.data.monthly_remaining_micros)} cls={bud.data.monthly_remaining_micros < bud.data.monthly_cap_micros * .1 ? "c-warn" : ""} /></>}
            </div> : <Err e={inst.error} />}
          </div>

          <div className="pane"><h2>Cost per incident <span>incidents.cost (Agent37 usage delta)</span></h2>
            {incs?.error ? <Err e={incs.error.message} /> : <ul className="list">{((incs?.data ?? []) as { id: string; title: string; status: string; cost: { agent37_usd: number; shared_instance: boolean } | null }[]).map(i => (
              <li key={i.id}><Link href={`/incidents/${i.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                <Ln k={`${i.id.slice(0, 8)} · ${i.status.replace("_", " ").toLowerCase()}`} v={i.cost ? `$${i.cost.agent37_usd.toFixed(2)}${i.cost.shared_instance ? "*" : ""}` : "—"} cls={i.cost ? "c-agent" : "dim"} /></Link></li>))}
              <li className="dim" style={{ fontSize: 11 }}>* instance shared with other work during the incident</li></ul>}
          </div>

          <div className="pane"><h2>Usage this period <span>{use.ok ? use.data.period : ""}</span></h2>
            {use.ok ? <ul className="list">{Object.entries(use.data.by_integration).sort((a, b) => b[1].cost_micros - a[1].cost_micros).map(([k, v]) => (
              <li key={k}><Ln k={k} v={`${usd(v.cost_micros)}${v.calls ? ` · ${v.calls} calls` : ""}`} /></li>))}
              <li><Ln k="Total" v={usd(use.data.total_micros)} cls="c-agent" /></li></ul> : <Err e={use.error} />}
          </div>

          <div className="pane"><h2>Connected systems <span>events, last 24 h</span></h2>
            {sys.size ? <ul className="list">{[...sys.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => (
              <li key={k}><Ln k={SYSTEM_LABEL[k] ?? k.toUpperCase()} v={`${v.n} · ${ago(+new Date(v.last))}${v.err ? ` · ${v.err} err` : ""}`} cls={v.err ? "c-caut" : ""} /></li>))}</ul>
              : <p className="dim" style={{ padding: 10, margin: 0 }}>No system activity in the last 24 hours.</p>}
          </div>

          <div className="pane"><h2>Agent memory <span>Agent37 sessions</span></h2>
            {ses.ok ? <ul className="list">{ses.data.data.slice(0, 8).map(s => (
              <li key={s.id}><Ln k={s.title || s.id.slice(0, 8)} v={`${s.message_count} msg · ${ago(s.last_active)}`} /></li>))}</ul> : <Err e={ses.error} />}
          </div>

          <div className="pane"><h2>Workspace files <span>~/plantapi on the instance</span></h2>
            {fl.ok ? <ul className="list">{fl.data.slice(0, 12).map(f => <li key={f.path}><Ln k={<span className="m" style={{ fontSize: 11, textTransform: "none" }}>{f.path}</span>} v={kb(f.bytes)} /></li>)}</ul> : <Err e={fl.error} />}
          </div>

          <div className="pane"><h2>Agent health <span>instance metrics + log</span></h2>
            {met.ok ? Object.entries(met.data.series).slice(0, 3).map(([k, pts]) => <Spark key={k} label={k} pts={pts.slice(-60)} />) : <Err e={met.error} />}
            {logTail.length > 0 && <div className="console" style={{ background: "#0f1210", maxHeight: 160, overflow: "auto", fontSize: 10.5 }}>{logTail.map((l, i) => <div key={i} className={/error|fail/i.test(l) ? "c-bad" : ""}>{l}</div>)}</div>}
          </div>

          <div className="pane"><h2>Scheduled follow-ups <span>Agent37 crons</span></h2>
            {cr.ok ? (cr.data.data.length ? <ul className="list">{cr.data.data.map((c, i) => <li key={c.id ?? i}><Ln k={String(c.name ?? c.prompt ?? c.id ?? "cron").slice(0, 60)} v={String(c.schedule ?? c.cron ?? c.next_run_at ?? "")} /></li>)}</ul>
              : <p className="dim" style={{ padding: 10, margin: 0 }}>No crons on the instance yet. Dispatch creates a follow-up when a technician doesn&apos;t acknowledge.</p>) : <Err e={cr.error} />}
          </div>

          <div className="pane"><h2>Backups <span>Agent37 checkpoints</span></h2>
            {bk.ok ? (bk.data.data.length ? <ul className="list">{bk.data.data.map((b, i) => <li key={b.id ?? i}><Ln k={String(b.id ?? i)} v={String(b.created_at ?? "")} /></li>)}</ul>
              : <p className="dim" style={{ padding: 10, margin: 0 }}>No backups yet. The engine takes one before execution once wave B is on.</p>) : <Err e={bk.error} />}
          </div>
        </div>
      </main>
    </div>
  );
}
