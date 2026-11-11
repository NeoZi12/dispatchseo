-- 0091: per-person "last visited" for the owner dashboard (src/lib/owner-analytics.ts,
-- src/lib/owner-customer.ts).
--
-- Two separate timestamps per signed-in user, read from the first-party visit
-- log (web_visits, 0073):
--   last_app  - the last page they opened in the dashboard (area 'app').
--   last_site - the last public dispatchseo.com page they opened (area 'site':
--               landing, blog, docs, free tools, plans, ...). Only visits made
--               while signed in carry a user id, so a logged-out browse is not
--               (and cannot be) attributed to anyone.
-- Bots and the "engaged" follow-up rows are left out: a view is a server or
-- beacon row from a real browser.
--
-- p_user NULL = every user (the Customers list); a user id = just that one
-- (the customer page). Uses web_visits_user_idx. Vanilla-Postgres safe,
-- idempotent on replay.
create or replace function owner_user_last_visits(p_user uuid default null)
returns table (user_id uuid, last_app timestamptz, last_site timestamptz)
language sql stable as $$
  select wv.user_id,
    max(wv.at) filter (where wv.area = 'app') as last_app,
    max(wv.at) filter (where wv.area = 'site') as last_site
  from web_visits wv
  where wv.user_id is not null
    and (p_user is null or wv.user_id = p_user)
    and wv.kind in ('server', 'beacon')
    and not wv.bot
    and wv.area in ('app', 'site')
  group by 1
$$;
