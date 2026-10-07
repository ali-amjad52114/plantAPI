// "/" — the 3D bird's-eye site view.
import { SiteView } from "@/app/components/site/SiteView";
import { siteIncidents, sourceConfig } from "@/app/components/data/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "PlantAPI · Site view" };

export default async function SitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const cfg = sourceConfig(sp);
  const incidents = await siteIncidents(cfg);
  // embed mode (iframe in the control room): /?embed=1&focus=CV-104[&mock=1]
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const embed = one(sp.embed) === "1";
  const f = one(sp.focus)?.trim().toUpperCase();
  const focus = f && /^[A-Z0-9-]{1,24}$/.test(f) ? f : undefined;
  return <SiteView incidents={incidents} mock={cfg.mock} embed={embed} focus={focus} cfg={cfg} />;
}
