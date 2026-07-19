-- Verified Google index state for published pages.
--
-- index_requested_at (0005) records that the manual "Request indexing" step
-- happened; these two columns record what Google actually says. The URL
-- Inspection API is read-only but that is exactly what verification needs:
-- the hourly-gsc cron asks it about every not-yet-confirmed page and stamps
-- indexed_at on a PASS verdict, so the dashboard's "Indexed" badge no longer
-- has to wait for the first impression to land. The agent's
-- mark_indexing_requested MCP tool also stamps indexed_at when Search Console
-- showed a page was already on Google.
alter table pages add column if not exists indexed_at timestamptz;
alter table pages add column if not exists index_checked_at timestamptz;

comment on column pages.indexed_at is
  'When Google was first confirmed to have this page indexed (URL Inspection API PASS, or the agent saw "URL is on Google" in Search Console). Null = not confirmed yet.';
comment on column pages.index_checked_at is
  'Last time the cron asked the URL Inspection API about this page - rotates the per-run inspection budget through the unconfirmed backlog.';
