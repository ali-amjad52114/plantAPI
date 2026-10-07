"use client";
// Report a failure: photo + alarm text -> POST /api/incidents -> open its control room. Demo mode opens the replay.
import "./report.css";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MOCK_ID } from "./data/mock";

export function ReportFailure({ mock, asset, onClose }: { mock: boolean; asset?: string; onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [alarm, setAlarm] = useState(asset ? `${asset} ` : mock ? "CV-104 MTR OL TRIP · MCC-03 BKR 7" : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="rf" role="dialog" aria-modal="true" aria-labelledby="rf-title" onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit}>
        <h2 id="rf-title">Report a failure</h2>
        <p>The agent team starts as soon as you send it: triage, planning, then one approval for you.</p>
        <label htmlFor="rf-photo">Photo of the failure</label>
        <input id="rf-photo" type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={mock} />
        <label htmlFor="rf-alarm">Alarm text or what you saw</label>
        <textarea id="rf-alarm" value={alarm} onChange={e => setAlarm(e.target.value)} rows={3} />
        {mock && <p className="rf-note">Demo replay: this opens the recorded CV-104 incident instead of sending a new one.</p>}
        {err && <p className="rf-err">{err}</p>}
        <div className="rf-row">
          <button type="submit" disabled={busy}>{busy ? "Sending…" : mock ? "Open demo incident" : "Send to agents"}</button>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
