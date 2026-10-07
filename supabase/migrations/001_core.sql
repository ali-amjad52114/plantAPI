-- PlantAPI core schema (S1/A1). Idempotent: safe to re-run.
create extension if not exists pgcrypto;

-- ---------- reference data ----------
create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agent37_instance_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid references public.plants(id) on delete cascade,
  code text not null unique,
  name text not null,
  fiix_code text,
  odoo_equipment_id integer,
  workcenter text,
  created_at timestamptz not null default now()
);

create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  trade text not null,
  title text,
  shift text,
  phone text,
  slack text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  odoo_product_id integer,
  created_at timestamptz not null default now()
);

-- ---------- incidents ----------
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid references public.plants(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  title text not null default '',
  alarm_text text not null default '',
  photo_url text,
  status text not null default 'NEW',
  triage jsonb,
  materials jsonb,
  plan jsonb,
  erp jsonb,
  verification jsonb,
  agent37_session_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.incidents drop constraint if exists incidents_status_check;
alter table public.incidents add constraint incidents_status_check check (status in (
  'NEW','TRIAGING','PLANNING','WAITING_APPROVAL','APPROVED','EXECUTING',
  'WAITING_REPAIR','VERIFYING','CLOSED','REJECTED','FAILED'));

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists incidents_set_updated_at on public.incidents;
create trigger incidents_set_updated_at before update on public.incidents
  for each row execute function public.set_updated_at();

create index if not exists incidents_status_idx on public.incidents (status, created_at desc);

-- ---------- agent tasks / events ----------
create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  role text not null,
  status text not null default 'QUEUED',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  agent37_response_id text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.agent_tasks drop constraint if exists agent_tasks_status_check;
alter table public.agent_tasks add constraint agent_tasks_status_check check (status in (
  'QUEUED','RUNNING','COMPLETE','FAILED','WAITING'));
alter table public.agent_tasks drop constraint if exists agent_tasks_role_check;
alter table public.agent_tasks add constraint agent_tasks_role_check check (role in (
  'triage','materials','coordinator','erp','verification',
  'reliability','production','workforce','risk','procurement','dispatch'));

create index if not exists agent_tasks_incident_idx on public.agent_tasks (incident_id);
create index if not exists agent_tasks_status_created_idx on public.agent_tasks (status, created_at);

create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  agent text not null,
  kind text not null,
  system text,
  message text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.agent_events drop constraint if exists agent_events_kind_check;
alter table public.agent_events add constraint agent_events_kind_check check (kind in (
  'status','log','tool','output','error'));

create index if not exists agent_events_incident_idx on public.agent_events (incident_id, created_at);

-- ---------- approvals / repair / audit ----------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  decision text not null check (decision in ('approve','reject')),
  decided_by text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists approvals_incident_idx on public.approvals (incident_id);

create table if not exists public.repair_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  kind text not null check (kind in ('completion_submitted','verification_rejected','verification_accepted')),
  notes text,
  actual_downtime_minutes integer,
  photo_url text,
  created_at timestamptz not null default now()
);
create index if not exists repair_events_incident_idx on public.repair_events (incident_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents(id) on delete cascade,
  actor text not null,
  action text not null,
  system text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_incident_idx on public.audit_logs (incident_id);

-- ---------- access: RLS off (single-user demo), anon may read ----------
alter table public.plants disable row level security;
alter table public.assets disable row level security;
alter table public.technicians disable row level security;
alter table public.parts disable row level security;
alter table public.incidents disable row level security;
alter table public.agent_tasks disable row level security;
alter table public.agent_events disable row level security;
alter table public.approvals disable row level security;
alter table public.repair_events disable row level security;
alter table public.audit_logs disable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.plants, public.assets, public.technicians, public.parts, public.incidents,
  public.agent_tasks, public.agent_events, public.approvals, public.repair_events, public.audit_logs
  to anon, authenticated;
grant all on public.plants, public.assets, public.technicians, public.parts, public.incidents,
  public.agent_tasks, public.agent_events, public.approvals, public.repair_events, public.audit_logs
  to service_role;

-- ---------- realtime ----------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['incidents','agent_tasks','agent_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- storage: evidence bucket (public read) ----------
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', true)
on conflict (id) do update set public = true;
