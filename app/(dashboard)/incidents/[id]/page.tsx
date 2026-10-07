// "/incidents/[id]" — the incident control room. ?mock=1 replays the recorded CV-104 incident.
import { ControlRoom } from "@/app/components/control/ControlRoom";
import { sourceConfig } from "@/app/components/data/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "PlantAPI · Control room" };

export default async function IncidentPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const asset = typeof search.asset === "string" ? search.asset : undefined;
  return <ControlRoom id={id} cfg={sourceConfig(search)} asset={asset} />;
}
