// "/" — the 3D bird's-eye site view.
import { SiteView } from "@/app/components/site/SiteView";
import { siteIncidents, sourceConfig } from "@/app/components/data/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "PlantAPI · Site view" };

export default async function SitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cfg = sourceConfig(await searchParams);
  const incidents = await siteIncidents(cfg);
  return <SiteView incidents={incidents} mock={cfg.mock} />;
}
