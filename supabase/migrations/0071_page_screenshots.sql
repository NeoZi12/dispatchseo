-- 0071: stored screenshots of live articles (2026-11-05).
--
-- The article page's preview is a real screenshot of the live page, taken by
-- a remote browser (Cloudflare Browser Rendering, else Microlink -
-- src/lib/page-screenshot.ts). Taking one costs 3-30 seconds, so it is taken
-- once - when the article publishes, or in the background the first time the
-- dashboard lists it - and kept here, so opening an article never waits for a
-- browser. Served by /api/preview/<project_id>?u=<url>. A row older than
-- 30 days is re-taken in the background; the old one shows until then.
--
-- image is base64 JPEG (1280x800, ~60-150 KB): text, not bytea, so PostgREST
-- reads and writes it as a plain string on both Supabase and self-host.
--
-- Vanilla-Postgres safe, idempotent on replay.

create table if not exists page_screenshots (
  project_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references projects(id) on delete cascade,
  url text not null,
  image text not null,
  taken_at timestamptz not null default now(),
  primary key (project_id, url)
);

alter table page_screenshots enable row level security;
