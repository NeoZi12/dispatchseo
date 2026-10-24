-- 0066: the autopilot.
--
-- A cloud project no longer needs a coding agent: DispatchSEO researches the
-- keywords, writes the articles and publishes them on a weekly cadence set by
-- the plan (src/lib/autopilot/*, /api/cron/autopilot). The bring-your-own-
-- agent path stays, untouched, for existing projects and every self-host.
--
-- Plain vanilla-Postgres objects only.

-- Who writes: 'hosted' (our server) or 'agent' (the owner's AI over MCP).
-- Default 'agent' so every existing row - and every self-host install - keeps
-- exactly the behaviour it had; only new cloud projects are created 'hosted'.
alter table projects add column if not exists writer_mode text not null default 'agent';

-- The pause switch. Set by the owner, or by the autopilot itself when Search
-- Console shows the site collapsing (src/lib/autopilot/pause.ts). Null =
-- running. Only the owner ever clears it: a pause that lifted itself would
-- resume writing into the very problem that paused it.
alter table projects add column if not exists writer_paused_at timestamptz;
alter table projects add column if not exists writer_pause_reason text;
-- When the owner last resumed it. The collapse rule stays quiet for 28 days
-- after a resume (the window it reads still holds the collapse the owner just
-- acknowledged), and the zero-impression rule only counts articles published
-- after it - otherwise the very next daily run would pause the site again on
-- the evidence the owner already looked at.
alter table projects add column if not exists writer_resumed_at timestamptz;

-- The byline. Set = the article schema names a Person; null = the site's
-- Organization, as before.
alter table projects add column if not exists author_name text;
alter table projects add column if not exists author_bio text;
alter table projects add column if not exists author_url text;

-- When autopilot keyword research last ran (the cron re-runs it weekly), and
-- when the scheduler expects to start the next article (informational: the
-- dashboard shows it, nothing reads it to decide).
alter table projects add column if not exists last_research_at timestamptz;
alter table projects add column if not exists next_article_at timestamptz;

comment on column projects.writer_mode is
  'hosted = DispatchSEO researches, writes and publishes on a weekly cadence; agent = the owner''s AI drives everything over MCP.';

-- The scheduler and the report count a project's approved guides on every
-- run; the existing (project_id, created_at) index does not cover it.
create index if not exists suggestions_project_status_type_idx
  on suggestions (project_id, status, type);

-- suggestions.source gains 'autopilot' (ideas research approved on its own)
-- and 'owner' (a topic the owner suggested on a hosted project, which passes
-- the same judge gate). Same drop-and-re-add dance as 0052; 0014 and 0052
-- carry this SAME final list so the setup.sql replay never re-validates a
-- narrower vocabulary against rows that use the new values (see 0013/0014).
alter table suggestions drop constraint if exists suggestions_source_check;
alter table suggestions
  add constraint suggestions_source_check
  check (source in ('research', 'trend-scan', 'manual', 'refresh', 'autopilot', 'owner'));

-- Merge keys into projects.content_prefs in ONE statement. The blob is shared
-- by the template editor (house_rules, archetypes, blocks) and the autopilot
-- (blocked_topics, profile_locked); a read-merge-write from two saves landing
-- together could drop one of them. jsonb || is atomic per row. Callers fall
-- back to read-merge-write when this function does not exist yet. Not
-- security definer: it runs as the caller, and projects has RLS on with no
-- policies, so only the service role can change a row through it.
create or replace function merge_content_prefs(p_project_id uuid, p_patch jsonb)
returns void
language sql
as $$
  update projects
     set content_prefs = coalesce(content_prefs, '{}'::jsonb) || p_patch
   where id = p_project_id;
$$;
