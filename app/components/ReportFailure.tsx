"use client";
// Report a failure: photo + alarm text -> POST /api/incidents -> open its control room. Demo mode opens the replay.
import "./report.css";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MOCK_ID } from "./data/mock";

export function ReportFailure({ mock, asset, onClose }: { mock: boolean; asset?: string; onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [alarm, setAlarm] = useState(asset ? `${asset} ` : mock ? "CV-104 MTR OL TRIP · MCC-03 BKR 7" : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function pick(f: File | null | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("That file is not an image. Add a photo of the failure.");
    setFile(f); setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mock) return router.push(`/incidents/${MOCK_ID}?mock=1`);
    if (!file) return setErr("Add a photo of the failure.");
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.set("photo", file); fd.set("alarm_text", alarm);
      const r = await fetch("/api/incidents", { method: "POST", body: fd });
      if (!r.ok) throw new Error(`The incident API answered ${r.status}. ${await r.text()}`);
      const { incident_id } = await r.json() as { incident_id: string };
      router.push(`/incidents/${incident_id}`);
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  const dropClass = `rf-drop${drag ? " is-drag" : ""}${file ? " has-file" : ""}${mock ? " is-off" : ""}`;

  return (
    <div className="rf" role="dialog" aria-modal="true" aria-labelledby="rf-title" aria-describedby="rf-lede"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={submit} aria-busy={busy}>
        <div className="rf-head">
          <span className="rf-eyebrow">PlantAPI // New incident</span>
          <h2 id="rf-title">Report a failure</h2>
          <p id="rf-lede">The agent team starts as soon as you send it: triage, planning, then one approval for you.</p>
        </div>

        <div className="rf-field">
          <label htmlFor="rf-photo" className="rf-label">Photo of the failure</label>
          <label htmlFor="rf-photo" className={dropClass}
            onDragOver={e => { if (mock) return; e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { if (mock) return; e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}>
            <svg className="rf-drop-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {file ? (
              <span className="rf-drop-text">
                <strong>{file.name}</strong>
                <span>{Math.max(1, Math.round(file.size / 1024))} KB · click to replace</span>
              </span>
            ) : (
              <span className="rf-drop-text">
                <strong>{mock ? "Recorded photo is used in the demo" : "Drop a photo here or click to browse"}</strong>
                <span>{mock ? "Upload is off in replay mode" : "JPG or PNG · a phone camera shot works"}</span>
              </span>
            )}
          </label>
          <input id="rf-photo" className="rf-file" type="file" accept="image/*" capture="environment"
            onChange={e => pick(e.target.files?.[0])} disabled={mock} />
        </div>

        <div className="rf-field">
          <label htmlFor="rf-alarm" className="rf-label">Alarm text or what you saw</label>
          <textarea id="rf-alarm" value={alarm} onChange={e => setAlarm(e.target.value)} rows={3}
            placeholder="e.g. CV-104 MTR OL TRIP, burning smell at the motor" />
        </div>

        {mock && <p className="rf-note"><span className="rf-tag">Demo</span> This opens the recorded CV-104 incident instead of sending a new one.</p>}
        {err && <p className="rf-err" role="alert"><span className="rf-tag">Error</span> {err}</p>}

        <div className="rf-row">
          <button type="button" className="rf-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`rf-btn primary${busy ? " is-busy" : ""}`} disabled={busy}>
            {busy && <span className="rf-spin" aria-hidden="true" />}
            {busy ? "Sending…" : mock ? "Open demo incident" : "Send to agents"}
          </button>
        </div>
      </form>
    </div>
  );
}
