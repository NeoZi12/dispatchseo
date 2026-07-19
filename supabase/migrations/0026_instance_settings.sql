-- First-boot setup wizard (the /setup claim screen). One row max: the
-- instance's dashboard password (scrypt hash) and its generated cron secret.
-- Classic installs that set DASHBOARD_PASSWORD / CRON_SECRET env never write
-- here - env always wins at read time, so applying this to an existing
-- deployment changes nothing.
--
-- No project_id on purpose: this is the door to the whole instance, not
-- tenant state. The `id boolean primary key check (id)` trick caps the table
-- at a single row and makes the claim race safe - the second claimer hits a
-- primary-key conflict instead of silently overwriting the first.
create table if not exists instance_settings (
  id boolean primary key default true check (id),
  dashboard_password_hash text not null,
  cron_secret text not null,
  claimed_at timestamptz not null default now()
);

alter table instance_settings enable row level security;
