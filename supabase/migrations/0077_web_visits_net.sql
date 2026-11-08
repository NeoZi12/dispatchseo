-- 0077: a per-day network id on web_visits, so the owner page can leave the
-- operator's own visits out of "Every visit" (lib/owner-visitors.ts).
--
-- `visitor` hashes IP + user agent + day: one browser. A second browser on the
-- same network (a test browser, the phone on home wifi) is a different
-- visitor, so the operator's logged-out visits from it still showed. `net`
-- hashes IP + day only, salted like `visitor` - the IP itself is still never
-- written, and it cannot be joined across days.
--
-- Additive and nullable: rows before this have no net and fall back to the
-- visitor match alone.

alter table web_visits add column if not exists net text;

create index if not exists web_visits_net_idx on web_visits (net) where net is not null;
