// Apply supabase/migrations/*.sql + seed.sql to the EXISTING project via the Management API.
// Usage: npx tsx supabase/apply.ts [--verify-only]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "../lib/db/env";

loadEnv();
const ref = process.env.SUPABASE_PROJECT_REF || "npbcyyudbftyklenxycr";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error("Missing env SUPABASE_ACCESS_TOKEN");

async function query(sql: string): Promise<unknown> {
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    lastErr = `HTTP ${res.status}: ${text.slice(0, 500)}`;
    if (res.status < 500 && res.status !== 429) break; // SQL errors: don't retry
  }
  throw new Error(lastErr);
}

const dir = join(process.cwd(), "supabase");
async function main() {
  if (!process.argv.includes("--verify-only")) {
    const migs = readdirSync(join(dir, "migrations")).filter((f) => f.endsWith(".sql")).sort();
    for (const f of [...migs.map((m) => join("migrations", m)), "seed.sql"]) {
      await query(readFileSync(join(dir, f), "utf8"));
      console.log(`applied ${f}`);
    }
  }
  const verify: Record<string, string> = {
    tables: `select string_agg(table_name, ',' order by table_name) as t from information_schema.tables
             where table_schema='public' and table_name in ('plants','assets','technicians','parts','incidents',
             'agent_tasks','agent_events','approvals','repair_events','audit_logs')`,
    seed: `select (select count(*) from plants) plants, (select count(*) from assets) assets,
           (select count(*) from technicians) technicians, (select count(*) from parts) parts`,
    realtime: `select string_agg(tablename, ',' order by tablename) as t from pg_publication_tables
               where pubname='supabase_realtime' and schemaname='public'`,
    bucket: `select id, public from storage.buckets where id='evidence'`,
  };
  for (const [k, sql] of Object.entries(verify)) console.log(k, JSON.stringify(await query(sql)));
}
main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
