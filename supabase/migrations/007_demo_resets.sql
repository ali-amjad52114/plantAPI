-- One "Reset demo" button: POST /api/demo/reset queues a row; the worker runs S2's resetDemo() and writes
-- each step here (Realtime on so the UI can show progress). At most one queued/running reset at a time.
create table if not exists demo_resets (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'refused')),
  force boolean not null default false,
  requested_by text,
  steps jsonb not null default '[]'::jsonb,
  summary text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists demo_resets_one_active on demo_resets ((true)) where status in ('queued', 'running');
create index if not exists demo_resets_created_idx on demo_resets (created_at desc);
alter table demo_resets disable row level security;
grant select on demo_resets to anon;

create or replace function demo_resets_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists demo_resets_touch on demo_resets;
create trigger demo_resets_touch before update on demo_resets for each row execute function demo_resets_touch();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'demo_resets') then
    alter publication supabase_realtime add table public.demo_resets;
  end if;
end $$;
