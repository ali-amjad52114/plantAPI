import { plantHHMM } from "./time";
// Site equipment shown in the 3D view. CV-104, MTR-104, MCC-03, P-302 and FV-221 are the Fiix/Odoo seed assets;
// the rest are example equipment that makes the hall read as a real crushing and grinding plant.
export type AssetStatus = "ok" | "warn" | "down";
export interface SiteAsset { id: string; name: string; area: "Crushing Line 2" | "Grinding" | "Wash plant"; status: AssetStatus; note: string; last: string; fiix?: boolean }
export interface SiteIncident { id: string; asset: string | null; title: string; status: string; created_at: string }

const BASE: SiteAsset[] = [
  { id: "JC-101", name: "Jaw crusher", area: "Crushing Line 2", status: "ok", note: "Running", last: "" },
  { id: "VS-102", name: "Vibrating screen", area: "Crushing Line 2", status: "ok", note: "Running", last: "" },
  { id: "CC-103", name: "Cone crusher", area: "Crushing Line 2", status: "ok", note: "Running", last: "" },
  { id: "CV-104", name: "Conveyor", area: "Crushing Line 2", status: "ok", note: "Running", last: "", fiix: true },
  { id: "MTR-104", name: "Conveyor drive motor", area: "Crushing Line 2", status: "ok", note: "Running", last: "", fiix: true },
  { id: "MCC-03", name: "Motor control centre", area: "Crushing Line 2", status: "ok", note: "Energised", last: "", fiix: true },
  { id: "BM-201", name: "Ball mill 1", area: "Grinding", status: "ok", note: "Running", last: "" },
  { id: "BM-202", name: "Ball mill 2", area: "Grinding", status: "ok", note: "Running", last: "" },
  { id: "CY-203", name: "Cyclone cluster", area: "Grinding", status: "ok", note: "Running", last: "" },
  { id: "P-302", name: "Slurry pump", area: "Wash plant", status: "ok", note: "Running", last: "", fiix: true },
  { id: "FV-221", name: "Feed valve", area: "Wash plant", status: "ok", note: "Running", last: "", fiix: true },
  { id: "TK-301", name: "Thickener 1", area: "Wash plant", status: "ok", note: "Running", last: "" },
  { id: "TK-302", name: "Thickener 2", area: "Wash plant", status: "ok", note: "Running", last: "" },
];

const CLOSED = new Set(["CLOSED", "REJECTED", "FAILED"]);
export const isOpen = (i: SiteIncident) => !CLOSED.has(i.status);

/** Applies open incidents to the equipment: the failed asset goes down, its line stops upstream. */
export function siteAssets(incidents: SiteIncident[]): SiteAsset[] {
  const out = BASE.map(a => ({ ...a }));
  for (const inc of incidents.filter(isOpen)) {
    const a = out.find(x => x.id === inc.asset);
    if (!a) continue;
    a.status = "down"; a.note = `Down since ${plantHHMM(inc.created_at)} · ${inc.status.replace("_", " ").toLowerCase()}`; a.last = inc.title;
  }
  return out;
}

/** Best guess at the asset code for an incident row (triage result, else the first tag in the text). */
export function assetOf(row: { triage?: { asset_id?: string } | null; title?: string; alarm_text?: string }): string | null {
  return row.triage?.asset_id ?? (`${row.title ?? ""} ${row.alarm_text ?? ""}`.match(/\b([A-Z]{1,3}-\d{2,3})\b/)?.[1] ?? null);
}
