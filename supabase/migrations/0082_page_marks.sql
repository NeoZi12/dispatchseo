-- Which DispatchSEO marks a live page carries, as last seen on the page
-- itself (src/lib/article-signature.ts, scanned by src/lib/page-marks.ts):
--
--   mark_checked_at   when the live page was last read for its marks
--                     (null = never scanned; "unchecked" in the owner's view)
--   signature_seen    the hidden <span data-dispatchseo> (or the hosted
--                     blog's generator meta) was on the page at that check
--   badge_seen        the visible "Made with DispatchSEO" credit was on it
--
-- Nullable booleans on purpose: null is "never looked", false is "looked and
-- it was not there" - the owner needs the two apart. Plain columns, no
-- Supabase-only objects; applies to vanilla Postgres as every migration must.
alter table pages add column if not exists mark_checked_at timestamptz;
alter table pages add column if not exists signature_seen boolean;
alter table pages add column if not exists badge_seen boolean;
