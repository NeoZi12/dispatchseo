-- 0034: GitHub App install core. Adds the columns the App's install flow
-- (src/app/api/github/install/{start,callback}) writes: the installation id
-- GitHub assigns when the owner installs/updates the App on a repo or org,
-- and when that happened. Both are plain columns - no auth/storage objects
-- involved - so unlike 0031 this needs no DO-guard to stay vanilla-Postgres
-- safe; it applies identically on Supabase and the docker stack's setup.sql.
--
-- Auth plumbing only: the App does not yet replace github.ts's PAT-based
-- calls (mergePr, dispatchToolBuild, ...) - that swap, plus webhook handling
-- and per-project secret storage, are later steps.

alter table projects add column if not exists github_installation_id bigint;
alter table projects add column if not exists github_app_installed_at timestamptz;
create index if not exists projects_github_installation_id_idx on projects (github_installation_id);
