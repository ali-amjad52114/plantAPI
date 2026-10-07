-- Demo reset (S2 demo-reset.ts) archives old test incidents instead of deleting them.
alter table incidents add column if not exists archived boolean not null default false;
create index if not exists incidents_active_idx on incidents (created_at desc) where archived = false;
