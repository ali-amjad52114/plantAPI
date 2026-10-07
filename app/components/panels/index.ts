// Extension slot: incident-detail panels. Waves append; keep order stable.
import type { ComponentType } from "react";
import type { Incident } from "@/lib/contracts/types";

export type IncidentPanel = { id: string; title: string; Component: ComponentType<{ incident: Incident }> };
export const incidentPanels: IncidentPanel[] = [];
