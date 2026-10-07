"use client";
// Animated agent graph (FLAGS.agentGraph): the incident's flow as nodes and edges, driven by real agent_tasks status.
// Edges into a running agent flow; a node flashes when one of its events arrives.
import { useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentRole, AgentTask } from "@/lib/contracts/types";
import { ROLE_LABEL } from "../data/model";

const COLS: AgentRole[][] = [["triage"], ["reliability", "materials", "production", "workforce"], ["coordinator"], ["risk"], ["procurement", "erp", "dispatch"], ["verification"]];
const W = 900, H = 230, NW = 108, NH = 34;

function layout() {
  const pos = {} as Record<AgentRole, { x: number; y: number }>;
  COLS.forEach((col, c) => col.forEach((r, i) => {
    pos[r] = { x: 20 + c * ((W - 40 - NW) / (COLS.length - 1)), y: H / 2 - (col.length * (NH + 14) - 14) / 2 + i * (NH + 14) };
  }));
  return pos;
}
const POS = layout();
const EDGES: [AgentRole, AgentRole][] = COLS.slice(1).flatMap((col, c) => col.flatMap(to => COLS[c].map(from => [from, to] as [AgentRole, AgentRole])));

export function AgentGraph({ tasks, events, onPick, focus }: { tasks: Partial<Record<AgentRole, AgentTask>>; events: AgentEvent[]; onPick: (r: AgentRole) => void; focus: AgentRole }) {
  const [flash, setFlash] = useState<Partial<Record<AgentRole, number>>>({});
  const seen = useRef(events.length);
  useEffect(() => {
    if (events.length <= seen.current) { seen.current = events.length; return; }
    const fresh = events.slice(seen.current); seen.current = events.length;
    const now = Date.now(), next = { ...flash };
    for (const e of fresh) if (e.agent in POS) next[e.agent as AgentRole] = now;
    setFlash(next);
    const t = setTimeout(() => setFlash({}), 700);
    return () => clearTimeout(t);
  }, [events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = (r: AgentRole) => tasks[r]?.status ?? "IDLE";
  return (
    <div className="agraph">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Agent graph: which agents are running, done or failed">
        {EDGES.map(([a, b]) => {
          const A = POS[a], B = POS[b], sb = st(b), sa = st(a);
          const cls = sb === "RUNNING" ? "e run" : sb === "COMPLETE" || sb === "FAILED" ? "e done" : sa === "COMPLETE" ? "e ready" : "e";
          const x1 = A.x + NW, y1 = A.y + NH / 2, x2 = B.x, y2 = B.y + NH / 2, mx = (x1 + x2) / 2;
          return <path key={a + b} className={cls} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} />;
        })}
        {(Object.keys(POS) as AgentRole[]).map(r => {
          const p = POS[r], s = st(r);
          const cls = "n " + (s === "RUNNING" ? "run" : s === "COMPLETE" ? "done" : s === "FAILED" ? "fail" : s === "QUEUED" || s === "WAITING" ? "queued" : "idle") + (flash[r] ? " flash" : "") + (focus === r ? " focus" : "");
          return (
            <g key={r} className={cls} transform={`translate(${p.x},${p.y})`} onClick={() => onPick(r)} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onPick(r)}>
              <rect width={NW} height={NH} />
              <text x={8} y={14}>{ROLE_LABEL[r].toUpperCase()}</text>
              <text className="s" x={8} y={27}>{s === "IDLE" ? "idle" : s.toLowerCase()}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
