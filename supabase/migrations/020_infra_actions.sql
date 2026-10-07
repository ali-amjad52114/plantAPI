-- 020_infra_actions.sql (S4 Platform)
-- One row per InstaCloud agent-governance decision (ALLOW / APPROVE / DENY / ERROR)
-- observed by lib/infra/governance-demo.ts --live, so the UI can show them live.
-- REAL ONLY: rows are written from real insta CLI output (or backfilled from its evidence file).
-- RLS off (single-user demo, per CONTRACTS.md); browser reads with anon; writes use service role.
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.infra_actions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  run_id            text,
  outcome           text not null check (outcome in ('ALLOW','APPROVE','DENY','ERROR')),
  action            text,
  policy_expected   text,
  platform_returned text,
  approval_id       text,
  detail            text,
  raw               jsonb
);

create index if not exists infra_actions_created_at_idx on public.infra_actions (created_at desc);
create index if not exists infra_actions_run_id_idx on public.infra_actions (run_id);

alter table public.infra_actions disable row level security;
grant select on public.infra_actions to anon, authenticated;
grant all on public.infra_actions to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'infra_actions'
  ) then
    alter publication supabase_realtime add table public.infra_actions;
  end if;
end $$;
