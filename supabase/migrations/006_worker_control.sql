-- Worker drain switch: set drain=true before a deploy; workers stop claiming new tasks and finish the
-- Agent37 turns already running. Set drain=false (or restart without PLANTAPI_WORKER_DRAIN) to resume.
create table if not exists worker_control (
  id text primary key default 'global',
  drain boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);
insert into worker_control (id, drain) values ('global', false) on conflict (id) do nothing;
alter table worker_control disable row level security;
grant select on worker_control to anon;
-- Same table as S4/S5's proposed 021_worker_control.sql (infra/deploy, scripts/deploy-safe.sh writes updated_by).
alter table worker_control add column if not exists updated_by text;
