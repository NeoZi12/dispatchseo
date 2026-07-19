-- 0020: cron run log - the "did my install break overnight?" answer.
-- Every cron route records one row per run (ok or failed, with the error
-- strings). The dashboard Home banner and the get_cron_health MCP tool read
-- the latest row per job; failure emails debounce against emailed_at.
-- No project_id on purpose: a run spans all projects (this is a system
-- table, not operational per-project state) - per-project error detail
-- lives inside the errors jsonb as "slug: message" strings.
create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  ok boolean not null,
  errors jsonb not null default '[]',
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists cron_runs_job_created_idx on cron_runs (job, created_at desc);

-- Same posture as every other table: RLS on, zero policies - only the
-- service-role key (server code) can touch it.
alter table cron_runs enable row level security;
