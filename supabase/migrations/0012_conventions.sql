-- Conventions: the dashboard's mirror of each repo's .dispatchseo/conventions.md
-- - the site facts the setup workflow discovers (stack, build command, theme
-- tokens, voice rules, exemplars). Written by the agent via the set_conventions
-- MCP tool right after it writes the repo file; read by the dashboard's
-- Instructions page to show "here is how DispatchSEO adapted to YOUR site".
-- One upserted row per project (jsonb, a few KB) - current value only, the
-- repo file's git history is the archive.
-- Same RLS posture as every table: enabled, no policies, service-role only.

create table if not exists conventions (
  project_id uuid primary key default '00000000-0000-4000-8000-000000000001'
    references projects(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table conventions enable row level security;
