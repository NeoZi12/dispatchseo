-- Google's hour-by-hour numbers, one row per site per Google day.
--
-- Search Console keeps hourly data (dataState HOURLY_ALL) for about ten days
-- only, so the hourly-gsc cron saves the last ten days on every run
-- (src/lib/gsc-hourly.ts): the day page's "Hour by hour" chart then reads
-- stored rows and never calls Google while someone waits, and a day stays
-- hour-by-hour after Google has dropped it.
--
--   date        Google's day, on its Pacific clock (the same day gsc_stats uses)
--   hours       [{ at, clicks, impressions }] - `at` is Google's own hour key
--               with its offset ("2026-11-09T14:00:00-08:00"), so the day
--               clocks go back keeps both of its 1 AMs; only the hours Google
--               returned, a silent hour has no entry
--   utc_offset  that day's Pacific offset ("-08:00" / "-07:00"), so a browser
--               can show each hour in the viewer's own time zone
--
-- Per project like every operational table (project_id defaults to the
-- ClockedCode id so pre-tenant writes stay valid). Plain table, no
-- Supabase-only objects; applies to vanilla Postgres as every migration must.
-- RLS on with zero policies: only the service role reads or writes it.
create table if not exists gsc_hourly (
  project_id uuid not null default '00000000-0000-4000-8000-000000000001' references projects(id) on delete cascade,
  date date not null,
  hours jsonb not null default '[]'::jsonb,
  utc_offset text not null default '-08:00',
  updated_at timestamptz not null default now(),
  primary key (project_id, date)
);

alter table gsc_hourly enable row level security;
