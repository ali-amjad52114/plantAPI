"use client";
// Docked picture-in-picture of the 3D site view, focused on the failed asset, so the dashboard and the machine stay in view together.
import "./pip.css";
import { useEffect, useState } from "react";
import type { Incident } from "@/lib/contracts/types";

const CODE = /\b[A-Z]{1,4}-\d{2,4}\b/;

export function assetCodeOf(inc: Pick<Incident, "asset_id" | "alarm_text" | "triage">, mock: boolean): string | null {
  const tri = inc.triage?.asset_id;
  if (tri && CODE.test(tri)) return tri.match(CODE)![0];
  const fromAlarm = inc.alarm_text?.match(CODE)?.[0];
  if (fromAlarm) return fromAlarm;
  if (inc.asset_id && CODE.test(inc.asset_id)) return inc.asset_id.match(CODE)![0];
  return mock ? "CV-104" : null;
}

export function AssetPip({ inc, mock }: { inc: Pick<Incident, "asset_id" | "alarm_text" | "triage">; mock: boolean }) {
  const code = assetCodeOf(inc, mock);
  const [mode, setMode] = useState<"dock" | "big" | "min">("dock");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // on phones the docked view would cover the procedure: start as the small "Show asset 3D" pill
    if (window.matchMedia("(max-width: 700px)").matches) setMode("min");
    const t = setTimeout(() => setShown(true), 300); return () => clearTimeout(t);
  }, []);

  const q = mock ? "&mock=1" : "";
  const src = `/?embed=1${code ? `&focus=${encodeURIComponent(code)}` : ""}${q}`;
  const full = "/" + (mock ? "?mock=1" : "");
  const label = code ?? "Asset";

  if (mode === "min") {
    return (
      <button type="button" className={"pip-pill" + (shown ? " in" : "")} onClick={() => setMode("dock")} aria-label={`Show ${label} live 3D view`}>
        <i aria-hidden="true" />Show asset 3D
      </button>
    );
  }
  return (
    <aside className={"pip" + (mode === "big" ? " big" : "") + (shown ? " in" : "")} aria-label={`${label} live 3D view`}>
      <div className="pip-bar">
        <span className="pip-t"><i aria-hidden="true" />{label} · Live 3D</span>
        <a className="pip-link" href={full}>Open full 3D view</a>
        <button type="button" className="pip-b" onClick={() => setMode(mode === "big" ? "dock" : "big")} aria-label={mode === "big" ? "Shrink 3D view" : "Expand 3D view"} title={mode === "big" ? "Shrink" : "Expand"}>{mode === "big" ? "⤡" : "⤢"}</button>
        <button type="button" className="pip-b" onClick={() => setMode("min")} aria-label="Minimize 3D view" title="Minimize">–</button>
      </div>
      <iframe className="pip-f" src={src} title={`${label} live 3D site view`} loading="lazy" />
    </aside>
  );
}
