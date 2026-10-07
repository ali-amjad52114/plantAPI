-- PlantAPI seed (S1/A1). Idempotent: fixed plant uuid + upsert on unique codes/names.
insert into public.plants (id, name, agent37_instance_id)
values ('00000000-0000-4000-8000-000000000001', 'Plant 1 – Crushing', 'pfd5d7eukw')
on conflict (id) do update set name = excluded.name, agent37_instance_id = excluded.agent37_instance_id;

insert into public.assets (plant_id, code, name, workcenter) values
  ('00000000-0000-4000-8000-000000000001', 'CV-104',  'Conveyor CV-104',                 'Crushing Line 2'),
  ('00000000-0000-4000-8000-000000000001', 'MTR-104', 'Conveyor CV-104 drive motor',     'Crushing Line 2'),
  ('00000000-0000-4000-8000-000000000001', 'MCC-03',  'Motor Control Center 03',         'Crushing Line 2'),
  ('00000000-0000-4000-8000-000000000001', 'P-302',   'Slurry pump P-302',               'Crushing Line 2'),
  ('00000000-0000-4000-8000-000000000001', 'FV-221',  'Flow control valve FV-221',       'Crushing Line 2')
on conflict (code) do update set plant_id = excluded.plant_id, name = excluded.name, workcenter = excluded.workcenter;

insert into public.technicians (name, trade, title, shift, phone, slack, email) values
  ('Sarah Chen',     'electrician',     'Electrical Technician',      '14:00-22:00', '+1-555-0101', '@sarah.chen',     'sarah.chen@plantapi.example'),
  ('Mike Rodriguez', 'millwright',      'Millwright',                 '06:00-14:00', '+1-555-0102', '@mike.rodriguez', 'mike.rodriguez@plantapi.example'),
  ('David Kim',      'instrumentation', 'Instrumentation Technician', '06:00-14:00', '+1-555-0103', '@david.kim',      'david.kim@plantapi.example')
on conflict (name) do update set trade = excluded.trade, title = excluded.title, shift = excluded.shift,
  phone = excluded.phone, slack = excluded.slack, email = excluded.email;

insert into public.parts (code, name) values
  ('LC1D09BD', 'Schneider TeSys D contactor 9A 24VDC')
on conflict (code) do update set name = excluded.name;
