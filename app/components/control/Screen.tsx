"use client";
// One agent session's screen: a browser page (demo copy or live Agent37 screenshot) or its tool-call console.
import { useLayoutEffect, useRef } from "react";
import { MOCK_PAGES, type SiteCtx } from "./mockSites";
import { IdleMimic } from "./IdleFill";

export interface SessionScreen {
  role: string;
  label: string;
  running: boolean;
  page: string | null;        // demo page id (mock mode)
  hl: string | null;          // data-hl key the agent is looking at
  url: string | null;
  screenshotUrl: string | null; // live mode: latest Agent37 browser screenshot
  lines: string[];            // console lines
}

const CURSOR = (
  <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 1 L2 15 L6 11 L9 17 L11.5 16 L8.5 10 L14 10 Z" fill="#ffffff" stroke="#1d2329" strokeWidth="1.3" strokeLinejoin="round" /></svg>
);

export function Console({ s, last }: { s: SessionScreen; last?: number }) {
  const lines = last ? s.lines.slice(-last) : s.lines;
  const cls = (l: string) => l.startsWith("#") ? "c-head" : l.startsWith("→") || l.startsWith("↪") ? "c-call" : l.startsWith("←") ? "c-res"
    : l.startsWith("✓") ? "c-okk" : l.startsWith("!") ? "c-w" : l.startsWith("✗") ? "c-bad" : "";
  return (
    <div className="console">
      {lines.length ? lines.map((l, i) => <div key={i} className={cls(l) + (i === lines.length - 1 && s.running ? " caret" : "")}>{l}</div>)
        : <IdleMimic compact={!!last} />}
    </div>
  );
}

/** Scaled (tile) or full-size (main monitor) view of a session. */
export function Screen({ s, ctx, scale = 1, manual = false, onGo }: { s: SessionScreen; ctx: SiteCtx; scale?: number; manual?: boolean; onGo?: (page: string) => void }) {
  const view = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null), cur = useRef<HTMLDivElement>(null);
  const html = s.page && MOCK_PAGES[s.page] ? MOCK_PAGES[s.page](ctx) : null;
  const tile = scale !== 1;

  useLayoutEffect(() => {
    const v = view.current, inn = inner.current, c = cur.current;
    if (!v || !inn) return;
    if (!html) { // console: keep the newest line in view
      if (tile) { const extra = inn.offsetHeight - v.clientHeight; inn.style.transform = extra > 0 ? `translateY(${-extra}px)` : "none"; }
      else v.scrollTop = v.scrollHeight;
      return;
    }
    inn.querySelectorAll(".hl").forEach(x => x.classList.remove("hl"));
    const t = !manual && s.hl ? inn.querySelector<HTMLElement>(`[data-hl="${s.hl}"]`) : null;
    if (!t || !c) { if (c) c.hidden = true; if (tile) inn.style.transform = `scale(${scale})`; return; }
    t.classList.add("hl");
    let top = 0, left = 0, el: HTMLElement | null = t;
    while (el && el !== inn) { top += el.offsetTop; left += el.offsetLeft; el = el.offsetParent as HTMLElement | null; if (el && !inn.contains(el)) break; }
    if (tile) {
      const off = Math.max(0, top - (v.clientHeight / scale) * .45);
      inn.style.transform = `scale(${scale}) translateY(${-off}px)`;
      const x = Math.max(4, Math.min(left * scale + Math.min(t.offsetWidth * scale * .35, 50), v.clientWidth - 90));
      c.style.transform = `translate(${x}px, ${(top - off) * scale + t.offsetHeight * scale / 2 - 3}px)`;
    } else {
      const x = Math.max(8, Math.min(left + Math.min(t.offsetWidth * .35, 160), v.clientWidth - 120));
      c.style.transform = `translate(${x}px, ${top + t.offsetHeight / 2 - 4}px)`;
      v.scrollTo({ top: Math.max(0, top - 160), behavior: "smooth" });
    }
    c.hidden = !s.running;
  }, [html, s.hl, s.running, s.lines.length, manual, scale, tile]);

  const onClick = (e: React.MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-go],[data-act]");
    if (!t || !onGo) return;
    if (t.dataset.go) onGo(t.dataset.go); else onGo("act:" + t.dataset.act);
  };

  if (s.screenshotUrl && !html) {
    return <div ref={view} className={tile ? "tview" : "bview"}><div ref={inner}>{/* eslint-disable-next-line @next/next/no-img-element */}<img className="shotimg" src={s.screenshotUrl} alt={`${s.label} browser`} /></div></div>;
  }
  return (
    <div ref={view} className={(tile ? "tview" : "bview") + (html ? "" : " api") + (manual ? " user" : "")} onClick={onClick}>
      <div ref={inner} className={tile ? "tinner" : undefined} style={tile && html ? { width: `${100 / scale}%` } : tile ? { width: "100%" } : undefined}>
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <Console s={s} last={tile ? 10 : undefined} />}
      </div>
      <div ref={cur} className="cursor" hidden>{CURSOR}<span>{s.label}</span></div>
    </div>
  );
}
