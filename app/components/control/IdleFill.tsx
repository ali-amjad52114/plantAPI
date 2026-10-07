"use client";
// Idle-state fills: purposeful placeholders shown only while there are no sessions/data yet. No live values are drawn.
import "./idle.css";

// Line 2 one-line mimic (asset ids from data/assets.ts). Shown in a session screen before the session starts.
const NODES = [
  { id: "FEED", name: "ROM feed", x: 14, trip: false },
  { id: "JC-101", name: "Jaw crusher", x: 108, trip: false },
  { id: "VS-102", name: "Vib. screen", x: 202, trip: false },
  { id: "CV-104", name: "Conveyor", x: 296, trip: true },
  { id: "CC-103", name: "Cone crusher", x: 390, trip: false },
  { id: "BM-201", name: "Ball mill 1", x: 484, trip: false },
];
const W = 72, Y = 52, H = 40;

export function IdleMimic({ compact = false }: { compact?: boolean }) {
  return (
    <div className={"idle-mimic" + (compact ? " compact" : "")}>
      <svg viewBox="0 0 570 140" role="img" aria-label="Crushing Line 2 schematic. CV-104 conveyor tripped. Waiting for agents.">
        <text x="14" y="22" className="im-title">CRUSHING LINE 2 · ONE-LINE</text>
        {NODES.slice(0, -1).map((n, i) => {
          const next = NODES[i + 1];
          const x1 = n.x + W, x2 = next.x, y = Y + H / 2;
          const stopped = n.trip || next.trip || i > 3;
          return <g key={n.id}>
            <line x1={x1} y1={y} x2={x2} y2={y} className={"im-pipe" + (stopped ? " stop" : "")} />
            {!stopped && <line x1={x1} y1={y} x2={x2} y2={y} className="im-flow" />}
            <path d={`M${x2 - 6} ${y - 4} L${x2} ${y} L${x2 - 6} ${y + 4}`} className={"im-arrow" + (stopped ? " stop" : "")} />
          </g>;
        })}
        {NODES.map(n => (
          <g key={n.id} className={"im-node" + (n.trip ? " trip" : "")}>
            {n.trip ? <>
              <rect x={n.x} y={Y + 12} width={W} height={16} rx="8" />
              <circle cx={n.x + 8} cy={Y + 20} r="5" className="im-roll" /><circle cx={n.x + W - 8} cy={Y + 20} r="5" className="im-roll" />
            </> : <rect x={n.x} y={Y} width={W} height={H} rx="4" />}
            <text x={n.x + W / 2} y={Y - 8} className="im-id">{n.id}</text>
            <text x={n.x + W / 2} y={Y + H + 16} className="im-name">{n.name}</text>
            {n.trip && <text x={n.x + W / 2} y={Y + H + 30} className="im-trip">TRIP</text>}
          </g>
        ))}
      </svg>
      {!compact && <p className="im-cap">Waiting for agents · press <b>Run agents</b></p>}
    </div>
  );
}

// Session trend before any session has started: an empty time frame, no bars.
export function TrendIdle() {
  return (
    <div className="trend-idle" aria-label="No agent sessions yet">
      <div className="ti-grid">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>
      <div className="ti-rows">{Array.from({ length: 4 }, (_, i) => <span key={i} />)}</div>
      <p className="ti-msg">No agent sessions yet · one row per session once agents run</p>
      <div className="ti-axis">{["start", "", "", "", "", "", "now"].map((t, i) => <span key={i}>{t}</span>)}</div>
    </div>
  );
}

// Failure photo placeholder (the report has no photo attached yet).
export function PhotoIdle() {
  return (
    <div className="shot photo-idle">
      <svg viewBox="0 0 48 40" aria-hidden="true"><path d="M6 12h8l4-5h12l4 5h8a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z" /><circle cx="24" cy="24" r="7.5" /><circle cx="38" cy="17" r="1.2" /></svg>
      <span>Photo arrives with the report</span>
    </div>
  );
}
