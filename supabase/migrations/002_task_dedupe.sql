-- Wave A fan-in: at most one open (QUEUED/RUNNING) task per role per incident, so two planners
-- finishing at the same moment can't both enqueue the coordinator. Engine ignores 23505 on enqueue.
create unique index if not exists agent_tasks_one_open_per_role
  on agent_tasks (incident_id, role)
  where status in ('QUEUED', 'RUNNING');
