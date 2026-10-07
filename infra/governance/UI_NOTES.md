# infra_actions — notes for S3 UI

Table `public.infra_actions` (migration `supabase/migrations/020_infra_actions.sql`). One row per real
InstaCloud agent-governance decision. RLS off; read with the anon key; the UI never writes.

| column | type | notes |
| --- | --- | --- |
| id | uuid | pk |
| created_at | timestamptz | when the decision was recorded |
| run_id | text | one governance run (evidence file stamp, e.g. `2026-10-07T22-20-46-232Z`) |
| outcome | text | `ALLOW` / `APPROVE` / `DENY` / `ERROR` (badge colour) |
| action | text | platform action, e.g. `branch.create`, `service.scale`, `project.delete` |
| policy_expected | text | what the live policy says (`allow`/`approve`/`deny`) |
| platform_returned | text | what the platform actually did (same vocabulary, or `error`/`skipped`) |
| approval_id | text | set for APPROVE — real InstaCloud approval id |
| detail | text | platform message (e.g. `project.delete denied by agent policy (HTTP 403)`) |
| raw | jsonb | `{ label, cli: { cmd, exitCode, ms, stdout, stderr }, step? }` |

Backfilled rows from the first live run share one `created_at`; order by `created_at`, then `raw->step`.

Initial load:

```ts
const { data } = await supabase
  .from("infra_actions")
  .select("id,created_at,run_id,outcome,action,policy_expected,platform_returned,approval_id,detail")
  .order("created_at", { ascending: false })
  .limit(50);
```

Live updates (table is in the `supabase_realtime` publication):

```ts
const ch = supabase
  .channel("infra_actions")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "infra_actions" },
      (p) => addRow(p.new as InfraAction))
  .subscribe();
// cleanup: supabase.removeChannel(ch)
```

Showing that policy and platform agree: `policy_expected === platform_returned` on every row so far.
Current real rows: see `infra/governance/infra-actions-proof.txt`.
