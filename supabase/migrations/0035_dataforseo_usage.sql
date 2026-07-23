-- 0035: bundled DataForSEO on cloud, per-tier metering. Platform credentials
-- (DATAFORSEO_PLATFORM_LOGIN/PASSWORD) bill paid cloud projects that never
-- connected their own DataForSEO account; this ledger is what keeps that
-- spend inside each owner's tier budget. One row per (project, day,
-- endpoint), incremented atomically through record_dataforseo_usage so
-- concurrent calls never race a read-modify-write - same pattern as
-- record_login_failure in 0021_login_lockout.sql. Only references `projects`
-- (no auth schema), so no DO-block guard is needed for vanilla Postgres.
create table if not exists dataforseo_usage (
  project_id uuid not null references projects (id) on delete cascade,
  day date not null,
  endpoint text not null,
  calls integer not null default 0,
  cost_microusd bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (project_id, day, endpoint)
);

-- Same posture as every other table: RLS on, zero policies - service-role only.
alter table dataforseo_usage enable row level security;

create or replace function record_dataforseo_usage(
  p_project_id uuid,
  p_day date,
  p_endpoint text,
  p_calls integer,
  p_cost_microusd bigint
)
returns void
language plpgsql
as $$
begin
  insert into dataforseo_usage (project_id, day, endpoint, calls, cost_microusd, updated_at)
  values (p_project_id, p_day, p_endpoint, p_calls, p_cost_microusd, now())
  on conflict (project_id, day, endpoint) do update
    set calls = dataforseo_usage.calls + excluded.calls,
        cost_microusd = dataforseo_usage.cost_microusd + excluded.cost_microusd,
        updated_at = now();
end;
$$;
