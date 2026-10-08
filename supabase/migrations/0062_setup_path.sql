-- The hosted setup path: one evidence-derived step at a time. Four projects
-- columns - the coding-agent "seen at the MCP door" stamp (mirror of
-- chat_last_seen_at), the agent-credential stamp, the connect-phase finish
-- stamp, and the steps the owner parked with "I'll do this later".
alter table projects
  add column if not exists agent_last_seen_at timestamptz,
  add column if not exists agent_credential_at timestamptz,
  add column if not exists setup_connected_at timestamptz,
  add column if not exists setup_deferred text[] not null default '{}';

-- Every project that already passes the cloud gate counts as connected, so none re-enters the path.
update projects
   set setup_connected_at = coalesce(pipeline_installed_at, created_at)
 where setup_connected_at is null
   and (onboarding_screen = 'c5'
        or pipeline_installed_at is not null
        or (github_repo is not null and onboarding_screen is null));

-- The two statements below touch ONLY rows the backfill above connected
-- (setup_connected_at is exactly the value it wrote), never a row the new
-- path stamped at click time: the docker stack replays this file on every
-- boot, and a replay must not rewrite a live project's state.

-- A backfilled GitHub row was installed (or set up by hand) before this path
-- existed: mark the install as fired so the path never auto-installs into a
-- legacy repo. Only when the key is absent.
update projects
   set install_progress = install_progress
         || jsonb_build_object('install_fired', coalesce(pipeline_installed_at, created_at))
 where github_repo is not null
   and setup_connected_at = coalesce(pipeline_installed_at, created_at)
   and not (install_progress ? 'install_fired');

-- Seed deferrals so Home still asks a legacy project for what it skipped
-- (WordPress, chat app, Google + its property pick) - each only when no
-- evidence already proves it (the same evidence the step engine reads), so
-- a seeded deferral can always be met. Idempotent: never over a list the
-- owner has since changed.
update projects p set setup_deferred = array_remove(array[
    case when p.publish_target = 'wordpress' and p.wp_app_password is null then 'wordpress' end,
    case when p.ai_choice in ('claude-web','chatgpt') and p.chat_last_seen_at is null
              and not exists (select 1 from article_drafts d
                              where d.project_id = p.id and d.status not in ('discarded','rejected'))
              and not exists (select 1 from site_profile sp where sp.project_id = p.id)
         then 'chat_connect' end,
    case when p.gsc_oauth_refresh_token is null
              and not exists (select 1 from gsc_stats g where g.project_id = p.id)
         then 'google_connect' end,
    case when p.gsc_oauth_refresh_token is null
              and not exists (select 1 from gsc_stats g where g.project_id = p.id)
         then 'gsc_property' end
  ]::text[], null)
 where p.setup_connected_at is not null
   and p.setup_connected_at = coalesce(p.pipeline_installed_at, p.created_at)
   and p.setup_deferred = '{}';
