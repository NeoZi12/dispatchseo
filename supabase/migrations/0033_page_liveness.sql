-- 0033: truthful "published" state for pages.
--
-- log_page is called when a guide's PR OPENS (the builder can't know when the
-- merge lands), but the dashboard read that row as "live on the site". When a
-- PR stalls unmerged - 2026-07-23: a pack update clobbered an adapted
-- auto-merge gate and a green guide PR sat parked - the Guides screen showed
-- a published guide whose URL 404'd. Split the two states:
--
--   live_at          first time the URL was verified serving HTTP 200
--                    (null = logged but not yet seen live - "awaiting publish")
--   live_checked_at  last verification attempt, so pending pages are probed
--                    with backoff instead of on every render
--
-- Existing rows predate verification and have been listed (and indexed) for a
-- while - presume them live so no established install regresses to a wall of
-- "awaiting publish" (a site whose WAF blocks our checker must not look
-- broken). New rows start null and get stamped by the first successful check.
alter table pages add column if not exists live_at timestamptz;
alter table pages add column if not exists live_checked_at timestamptz;
update pages set live_at = coalesce(published_at, created_at) where live_at is null;
