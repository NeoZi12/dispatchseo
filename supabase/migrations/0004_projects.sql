-- 0004: projects - the tenant axis. One deployment now manages many sites:
-- every operational table gains a project_id, and the dashboard grows a
-- Vercel-style project switcher.
--
-- Zero-downtime plan: project_id gets a DEFAULT of the ClockedCode project's
-- FIXED id, so code deployed before this migration keeps writing valid rows
-- during the migration->deploy window, and old rows backfill automatically
-- (ADD COLUMN ... DEFAULT fills existing rows).

create extension if not exists pgcrypto;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text not null unique,              -- bare domain: clockedcode.com
  gsc_site_url text,                        -- GSC property (sc-domain:... or https://...); null until connected
  github_repo text,                         -- owner/repo the content PRs land in; null = no pipeline yet
  mcp_token text not null unique,           -- per-project bearer for the MCP server and CI workflows
  location_code int not null default 2840,  -- DataForSEO market (2840 = US)
  language_code text not null default 'en',
  mode text not null default 'semi' check (mode in ('semi', 'auto')),
  created_at timestamptz not null default now()
);
-- Same posture as every other table here: RLS on, zero policies - only the
-- service-role key (the dashboard + MCP server) can read or write.
alter table projects enable row level security;

-- Project #1, with a FIXED id so it can be the column default below. Seeded
-- NEUTRAL: the onboarding wizard claims this row in place for the owner's
-- first site (keeping the fixed id every project_id default points at), so
-- a fresh instance is never born configured for someone else's product.
-- The legacy MCP_API_KEY env var maps to this row by its fixed id, whatever
-- slug/name the wizard later gives it. Conflict target is the id: existing
-- installs (whose row may be renamed, or the pre-2026-07-21 ClockedCode
-- seed) keep their row untouched.
insert into projects (id, slug, name, domain, gsc_site_url, github_repo, mcp_token, mode)
values (
  '00000000-0000-4000-8000-000000000001',
  'default',
  'Your site',
  '',
  null,
  null,
  encode(gen_random_bytes(24), 'hex'),
  'semi'
)
on conflict (id) do nothing;

-- ---- add project_id everywhere (default = ClockedCode) ---------------------

alter table pages              add column if not exists project_id uuid not null default '00000000-0000-4000-8000-000000000001' references projects(id);
alter table keywords           add column if not exists project_id uuid not null default '00000000-0000-4000-8000-000000000001' references projects(id);
alter table rank_checks        add column if not exists project_id uuid not null default '00000000-0000-4000-8000-000000000001' references projects(id);
alter table suggestions        add column if not exists project_id uuid not null default '00000000-0000-4000-8000-000000000001' references projects(id);
alter table gsc_stats          add column if not exists project_id uuid not null default '00000000-0000-4000-8000-000000000001' references projects(id);
alter table backlink_prospects add column if not exists project_id uuid not null default '00000000-0000-4000-8000-000000000001' references projects(id);
alter table playbook_status    add column if not exists project_id uuid not null default '00000000-0000-4000-8000-000000000001' references projects(id);
alter table site_profile       add column if not exists project_id uuid not null default '00000000-0000-4000-8000-000000000001' references projects(id);

-- ---- retarget the uniqueness that assumed one site -------------------------

-- keyword text was globally unique; now unique per project.
alter table keywords drop constraint if exists keywords_keyword_key;
create unique index if not exists keywords_project_keyword_key on keywords (project_id, keyword);

-- page url was globally unique; now unique per project.
alter table pages drop constraint if exists pages_url_key;
create unique index if not exists pages_project_url_key on pages (project_id, url);

-- one GSC snapshot per day PER PROJECT.
alter table gsc_stats drop constraint if exists gsc_stats_date_key;
create unique index if not exists gsc_stats_project_date_key on gsc_stats (project_id, date);

-- playbook progress: one row per (project, item) instead of per item.
alter table playbook_status drop constraint if exists playbook_status_pkey;
alter table playbook_status add primary key (project_id, slug);

-- site_profile: one row per project instead of the single id=1 row. The id
-- column stays as pk but gets a sequence so new projects can insert rows.
alter table site_profile drop constraint if exists site_profile_id_check;
create sequence if not exists site_profile_id_seq owned by site_profile.id;
select setval('site_profile_id_seq', greatest((select coalesce(max(id), 1) from site_profile), 1));
alter table site_profile alter column id set default nextval('site_profile_id_seq');
create unique index if not exists site_profile_project_key on site_profile (project_id);

-- ---- filter indexes for the per-project queries ----------------------------

create index if not exists suggestions_project_idx        on suggestions (project_id, created_at);
create index if not exists rank_checks_project_idx        on rank_checks (project_id, checked_at desc);
create index if not exists backlink_prospects_project_idx on backlink_prospects (project_id, created_at desc);
