"use client";
// 3D bird's-eye site view. Zoom, orbit, click a machine to fly in and open its incident in the control room.
import "./site.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { isOpen, siteAssets, type SiteIncident } from "../data/assets";
import { ReportFailure } from "../ReportFailure";
import { ResetDemoButton, type ResetConfig } from "../ResetDemo";
import { buildScene } from "./scene";

// three comes from node_modules (package.json); the CDN copy is only a fallback if the local chunk fails to load.
const THREE_URL = "https://esm.sh/three@0.170.0";
const ADDONS = "https://esm.sh/three@0.170.0/examples/jsm";
const load = (u: string) => import(/* webpackIgnore: true */ u);

export function SiteView({ incidents, mock, embed = false, focus, cfg }: { incidents: SiteIncident[]; mock: boolean; embed?: boolean; focus?: string; cfg?: ResetConfig }) {
  const root = useRef<HTMLDivElement>(null);
  const scene = useRef<{ show(id: string): void; open(id: string): void; dispose(): void } | null>(null);
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const q = mock ? "?mock=1" : "";
  const open = useMemo(() => incidents.filter(isOpen), [incidents]);
  const assets = useMemo(() => siteAssets(incidents), [incidents]);
  const lead = open[0];
  const down = assets.filter(a => a.status === "down").length;
  const running = assets.filter(a => a.status === "ok").length;

  // keep the latest routing data available to the scene's click handler
  const route = useRef({ open, q });
  route.current = { open, q };

  // The header wraps to two rows on narrower screens; keep the asset list and incident card below it.
  useEffect(() => {
    const top = root.current?.querySelector<HTMLElement>("#top");
    if (!top) return;
    const set = () => root.current?.style.setProperty("--top-h", `${Math.ceil(top.getBoundingClientRect().height)}px`);
    set(); // measure now as well: ResizeObserver only reports when the page renders
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set);
    ro?.observe(top);
    addEventListener("resize", set);
    return () => { ro?.disconnect(); removeEventListener("resize", set); };
  }, [embed]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [THREE, oc, css2d] = await Promise.all([import("three"), import("three/examples/jsm/controls/OrbitControls.js"), import("three/examples/jsm/renderers/CSS2DRenderer.js")])
          .catch(() => Promise.all([load(THREE_URL), load(`${ADDONS}/controls/OrbitControls.js`), load(`${ADDONS}/renderers/CSS2DRenderer.js`)]));
        if (cancelled || !root.current) return;
        scene.current = buildScene(root.current, { THREE, OrbitControls: oc.OrbitControls, CSS2DRenderer: css2d.CSS2DRenderer, CSS2DObject: css2d.CSS2DObject }, {
          assets,
          embed,
          focus,
          onOpen: (assetId: string) => {
            const { open, q } = route.current;
            const hit = open.find(i => i.asset === assetId) ?? open[0];
            if (!hit) { setReport(assetId); root.current?.classList.remove("leaving"); root.current?.querySelector("#fade")?.classList.remove("on"); root.current?.querySelector("#stage")?.classList.remove("on"); return; }
            const sep = q ? "&" : "?";
            router.push(`/incidents/${hit.id}${q}${hit.asset === assetId ? "" : `${sep}asset=${encodeURIComponent(assetId)}`}`);
          },
        });
      } catch (e) {
        console.error("3D site view failed to start", e);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, [assets, router, embed, focus]);

  if (embed) {
    const fa = assets.find(a => a.id === focus);
    const word = fa ? (fa.status === "down" ? "Down" : fa.status === "warn" ? "Maintenance" : "Running") : null;
    return (
      <div className="sv embed" ref={root}>
        <div id="host" />
        <div className="emb">
          {focus ?? "Site"} · Live 3D{word && <> · <b className={fa!.status}>{word}</b></>}
        </div>
        {failed && <div id="fallback" style={{ display: "grid" }}><div><p>3D view unavailable in this browser.</p></div></div>}
      </div>
    );
  }

  return (
    <div className="sv" ref={root}>
      <div id="host" />
      <div className="hz" aria-hidden="true" />
      <div id="top">
        <div className="glass brand"><i aria-hidden="true" /><div><span className="eyebrow">Digital twin · Site view</span><b>PlantAPI</b><small>Crushing Plant · Line 2 · Grinding · Wash</small></div></div>
        <div className="glass stat"><div className="k">Assets</div><div className="v">{assets.length}</div></div>
        <div className="glass stat"><div className="k">Running</div><div className="v" style={{ color: "var(--ok)" }}>{running}</div></div>
        <div className={"glass stat" + (down ? " bad" : "")}><div className="k">Down</div><div className="v">{down}</div></div>
        <div className="glass stat opt"><div className="k">Open incidents</div><div className="v" style={{ color: open.length ? "var(--crit)" : undefined }}>{open.length}</div></div>
        <div className="sp" />
        {mock ? <span className="tag">Demo replay · example data</span> : <span className={"chip" + (down ? " alarm" : "")}>{down ? `Live · ${down} down` : "Live · all running"}</span>}
        <button className="glass hbtn" onClick={() => setReport("")}>Report failure</button>
        {!embed && <ResetDemoButton cfg={cfg ?? { mock }} className="hbtn hbtn-sec" />}
        <button className="glass hbtn" id="assetsBtn">Assets</button>
        <button className="glass hbtn" id="labelsBtn" aria-pressed="true">Labels<kbd>L</kbd></button>
        <button className="glass hbtn" id="homeBtn">Overview<kbd>Esc</kbd></button>
      </div>
      <aside id="panel" className="glass" aria-label="Assets" />
      {lead ? (
        <div id="alert" className="glass">
          <span className="k">Open incident{open.length > 1 ? ` · 1 of ${open.length}` : ""} · {lead.status.replace("_", " ")}</span>
          <h2>{lead.asset ?? "Asset"} {lead.status === "WAITING_APPROVAL" ? "needs your approval" : "down"}</h2>
          <p>{lead.title}</p>
          <button className="go" onClick={() => lead.asset && scene.current ? scene.current.open(lead.asset) : router.push(`/incidents/${lead.id}${q}`)}>Open in control room →</button>
          {lead.asset && <button className="ghost" onClick={() => scene.current?.show(lead.asset!)}>Show me {lead.asset}</button>}
        </div>
      ) : (
        <div id="alert" className="glass" style={{ borderLeftColor: "var(--ok)" }}>
          <span className="k" style={{ color: "var(--ok)" }}>No open incidents</span>
          <h2>All equipment running</h2>
          <p>Report a failure to start the agent team, or click any machine.</p>
          <button className="go" onClick={() => setReport("")}>Report failure</button>
        </div>
      )}
      <div id="keys" className="glass"><span><b>Drag</b>orbit</span><span><b>Right-drag</b>pan</span><span><b>Wheel</b>zoom</span><span><b>Click</b>a machine to open its incident</span></div>
      <div id="legend" className="glass" aria-label="Legend">
        <h4>Asset status</h4>
        <span><i className="ok" />Running</span>
        <span><i className="down" />Down · open incident</span>
        <span><i className="warn" />Maintenance</span>
        <em>Click a machine</em>
      </div>
      <div id="tip" className="glass" />
      <div id="stage" className="glass" />
      <div id="fade" />
      {failed && (
        <div id="fallback" style={{ display: "grid" }}><div>
          <p>The 3D site view couldn&apos;t start in this browser.</p>
          {lead && <p><a href={`/incidents/${lead.id}${q}`}>Open the control room for {lead.asset ?? "the open incident"}</a></p>}
        </div></div>
      )}
      {report !== null && <ReportFailure mock={mock} asset={report || undefined} onClose={() => setReport(null)} />}
    </div>
  );
}
