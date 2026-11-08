-- 0080: hardening from the 2026-11-08 security audit. Four independent parts,
-- all idempotent (setup.sql replays every migration twice on self-host boot).
--
-- 1. rate_limits + rate_limit_hit(): one atomic fixed-window counter per key.
--    Used by the cloud sign-in/sign-up/reset actions (per IP and per email),
--    the paid MCP lookups (per project per day) and the public POST routes.
--    Postgres instead of Redis for the same reason as 0021: single instance,
--    the count only has to beat a script. The caller decides what a refused
--    hit means; this function only counts.
--
-- 2. The 0038 owner_can_access policies were FOR ALL ... WITH CHECK. Under
--    Supabase's default table grants that is a WRITE path for the
--    `authenticated` role, not a read backstop: a signed-in customer holding
--    the anon key could PATCH their own subscriptions row to status=active,
--    set writer_provider/writer_weekly_quota on their project, or repoint
--    github_installation_id. Recreated FOR SELECT only - the backstop's
--    stated intent ("a missed project_id filter can't leak another owner's
--    rows") needs no write clause.
--
-- 3. Every default grant on public tables, sequences and functions is revoked
--    from anon and authenticated, and the default privileges are changed so
--    future objects get none either. The app only ever talks to Postgres as
--    the service role (src/lib/db.ts); those two roles need nothing in this
--    schema. project_owned_by_caller keeps EXECUTE for authenticated because
--    the SELECT policies above call it. Guarded: vanilla Postgres (the
--    docker stack) has no anon/authenticated roles and PostgREST there runs
--    as the table owner, so the block is a no-op.
--
-- 4. writer_tasks.project_id gets the FK + cascade every other project table
--    has (0069 left it FK-free), so a deleted project takes its prompts and
--    research with it instead of leaving customer site text behind.

-- 1 ---------------------------------------------------------------------------
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table rate_limits enable row level security;

create or replace function rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
as $$
declare
  current_hits int;
begin
  -- Expired window for this key: start the count over.
  delete from rate_limits
    where key = p_key
      and window_start < now() - make_interval(secs => p_window_seconds);

  insert into rate_limits (key, window_start, hits)
    values (p_key, now(), 1)
    on conflict (key) do update set hits = rate_limits.hits + 1
    returning hits into current_hits;

  -- Opportunistic sweep so the table stays the size of one window's keys.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;

  return current_hits <= p_limit;
end;
$$;

-- 2 ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
  ) then
    execute 'drop policy if exists owner_can_access on projects';
    execute 'create policy owner_can_access on projects for select to authenticated using (owner_user_id = auth.uid())';

    execute 'drop policy if exists owner_can_access on subscriptions';
    execute 'create policy owner_can_access on subscriptions for select to authenticated using (user_id = auth.uid())';

    for tbl in select unnest(array[
      'pages', 'keywords', 'rank_checks', 'suggestions', 'gsc_stats',
      'backlink_prospects', 'playbook_status', 'site_profile',
      'domain_ratings', 'conventions', 'trend_topics', 'ai_snapshots',
      'dataforseo_usage'
    ])
    loop
      execute format('drop policy if exists owner_can_access on %I', tbl);
      execute format(
        'create policy owner_can_access on %I for select to authenticated using (project_owned_by_caller(project_id))',
        tbl
      );
    end loop;
  end if;
end $$;

-- 3 ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
    execute 'revoke all on all functions in schema public from anon, authenticated';
    execute 'revoke execute on all functions in schema public from public';
    execute 'alter default privileges in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on functions from anon, authenticated';
    execute 'alter default privileges in schema public revoke execute on functions from public';
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'project_owned_by_caller') then
      execute 'grant execute on function project_owned_by_caller(uuid) to authenticated';
    end if;
  end if;
end $$;

-- 4 ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'writer_tasks_project_id_fkey') then
    delete from writer_tasks where project_id not in (select id from projects);
    alter table writer_tasks
      add constraint writer_tasks_project_id_fkey
      foreign key (project_id) references projects(id) on delete cascade;
  end if;
end $$;
