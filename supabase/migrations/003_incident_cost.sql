-- Wave B: cost per incident (written by lib/engine/cost.ts after every step).
alter table incidents add column if not exists cost jsonb;
