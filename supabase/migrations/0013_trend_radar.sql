-- 0013: the trend radar - hype-window guide ideas with their own approval gate.
--
-- suggestions.source records which automation queued an idea: 'research' (the
-- weekly run - also the default, so every existing row keeps its meaning) or
-- 'trend-scan' (the Mon/Thu hype scan). Trend ideas get their own approval
-- flag because their value decays in days: with auto_trend on, the scan's
-- single best find approves itself and the daily builder ships it FIRST
-- (newest-first inside a 14-day freshness window - see the build-guide
-- instructions); off, trend ideas wait as pending like everything else.
-- Default true matches 0011's posture (existing projects run auto today).
--
-- projects.last_trend_scan_at lets the scheduled scan skip itself when a
-- manual Scan-now already ran within the last 48 hours; the scan stamps it
-- via the record_trend_scan MCP tool.

alter table suggestions
  add column if not exists source text not null default 'research';
alter table suggestions drop constraint if exists suggestions_source_check;
alter table suggestions
  add constraint suggestions_source_check check (source in ('research', 'trend-scan'));

alter table projects
  add column if not exists auto_trend boolean not null default true,
  add column if not exists last_trend_scan_at timestamptz;
