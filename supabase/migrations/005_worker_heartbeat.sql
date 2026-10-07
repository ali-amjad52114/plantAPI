-- Worker heartbeat for GET /api/health (InstaCloud health check). One row per worker id.
create table if not exists worker_heartbeat (
  id text primary key,
  last_poll timestamptz not null default now(),
  started_at timestamptz not null default now(),
  info jsonb not null default '{}'::jsonb
);
alter table worker_heartbeat disable row level security;
grant select on worker_heartbeat to anon;
