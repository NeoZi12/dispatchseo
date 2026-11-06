-- 0073: first-party visit log + product events for the owner's analytics
-- page (/owner, 2026-11-06).
--
-- PostHog only loads after a visitor clicks Accept, and Vercel Analytics has
-- no API, so until now the operator had no honest count of who reaches the
-- site, how many of them are crawlers, and where the funnel leaks. Two
-- tables fix that:
--
--   web_visits  one row per page request. `kind` says who wrote it: the proxy
--               ('server', every request incl. crawlers) or the browser
--               beacon ('beacon', only a browser that ran our script - the
--               "confirmed human" signal). Cookieless: `visitor` is a
--               daily-rotating salted hash, never the IP, and the user agent
--               is kept only to name crawlers.
--   app_events  the same product events the server already sends PostHog
--               (signup, checkout opened, subscription activated...), kept
--               here as well so the funnel can be read without a third party.
--
-- The owner_* functions are the page's aggregates: PostgREST has no GROUP BY,
-- and a day of crawler traffic is far more rows than a page should pull to
-- count. Plain SQL, vanilla-Postgres safe, idempotent on replay.

create table if not exists web_visits (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null default 'server',
  -- site (public pages) | app (the gated dashboard) | hosted (a customer's
  -- hosted blog) | file (sitemap, robots, llms.txt, install scripts)
  area text not null default 'site',
  path text not null,
  referrer text,
  ua text,
  bot boolean not null default false,
  bot_name text,
  device text,
  country text,
  visitor text,
  user_id uuid,
  hosted_key text,
  utm_source text,
  utm_medium text,
  utm_campaign text
);

create index if not exists web_visits_at_idx on web_visits (at desc);
create index if not exists web_visits_area_at_idx on web_visits (area, at desc);
create index if not exists web_visits_user_idx on web_visits (user_id, at desc) where user_id is not null;

alter table web_visits enable row level security;

create table if not exists app_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  distinct_id text not null,
  event text not null,
  props jsonb not null default '{}'::jsonb
);

create index if not exists app_events_at_idx on app_events (at desc);
create index if not exists app_events_event_idx on app_events (event, at desc);

alter table app_events enable row level security;

-- Per-day traffic in one area. bot_hits/browser_hits come from the proxy
-- (every request); human_views/human_visitors from the beacon (ran JS).
create or replace function owner_visits_daily(p_from timestamptz, p_to timestamptz, p_area text)
returns table (
  day date,
  bot_hits bigint,
  browser_hits bigint,
  human_views bigint,
  human_visitors bigint
)
language sql stable as $$
  select
    (at at time zone 'UTC')::date as day,
    count(*) filter (where kind = 'server' and bot) as bot_hits,
    count(*) filter (where kind = 'server' and not bot) as browser_hits,
    count(*) filter (where kind = 'beacon') as human_views,
    count(distinct visitor) filter (where kind = 'beacon') as human_visitors
  from web_visits
  where at >= p_from and at < p_to and area = p_area
  group by 1
  order by 1
$$;

-- Top values of one dimension (path, referrer, country, device, utm_source,
-- bot_name). p_bots = true counts crawler requests instead of human views.
create or replace function owner_visits_top(
  p_from timestamptz,
  p_to timestamptz,
  p_area text,
  p_dim text,
  p_bots boolean,
  p_limit int
)
returns table (key text, views bigint, visitors bigint)
language plpgsql stable as $$
begin
  if p_dim not in ('path', 'referrer', 'country', 'device', 'utm_source', 'utm_medium', 'utm_campaign', 'bot_name') then
    raise exception 'owner_visits_top: unknown dimension %', p_dim;
  end if;
  return query execute format(
    'select coalesce(%I, '''')::text as key, count(*)::bigint as views, count(distinct visitor)::bigint as visitors
       from web_visits
      where at >= $1 and at < $2 and area = $3 and %s
      group by 1
      order by 2 desc, 1
      limit $4',
    p_dim,
    case when p_bots then 'kind = ''server'' and bot' else 'kind = ''beacon''' end
  ) using p_from, p_to, p_area, p_limit;
end
$$;

-- How many human views / distinct visitors a set of paths got (the funnel's
-- "saw pricing or signup" step).
create or replace function owner_visits_count(p_from timestamptz, p_to timestamptz, p_area text, p_paths text[])
returns table (views bigint, visitors bigint)
language sql stable as $$
  select count(*)::bigint as views, count(distinct visitor)::bigint as visitors
  from web_visits
  where at >= p_from and at < p_to and area = p_area and kind = 'beacon' and path = any(p_paths)
$$;

-- One row per project: what it published, what Google sent it, what it
-- cost (LLM calls in model_calls, platform-billed DataForSEO), and views of
-- its hosted blog. *_recent = since p_since; the rest is all-time. GSC is
-- always the trailing 28 days, matching the customer's own dashboard.
create or replace function owner_project_rollup(p_since timestamptz)
returns table (
  project_id uuid,
  articles bigint,
  articles_recent bigint,
  last_article_at timestamptz,
  clicks_28d bigint,
  impressions_28d bigint,
  llm_cost_microusd bigint,
  llm_cost_recent_microusd bigint,
  dfs_cost_microusd bigint,
  dfs_cost_recent_microusd bigint,
  blog_views_recent bigint
)
language sql stable as $$
  with a as (
    select ad.project_id,
      count(*) filter (where ad.status = 'published') as articles,
      count(*) filter (where ad.status = 'published' and ad.published_at >= p_since) as articles_recent,
      max(ad.published_at) filter (where ad.status = 'published') as last_article_at
    from article_drafts ad
    group by 1
  ),
  g as (
    select gs.project_id,
      sum(coalesce(gs.clicks, 0))::bigint as clicks,
      sum(coalesce(gs.impressions, 0))::bigint as impressions
    from gsc_stats gs
    where gs.date >= current_date - 28
    group by 1
  ),
  m as (
    select mc.project_id,
      sum(mc.cost_microusd)::bigint as c,
      sum(mc.cost_microusd) filter (where mc.created_at >= p_since)::bigint as cr
    from model_calls mc
    group by 1
  ),
  d as (
    select du.project_id,
      sum(du.cost_microusd)::bigint as c,
      sum(du.cost_microusd) filter (where du.day >= p_since::date)::bigint as cr
    from dataforseo_usage du
    group by 1
  ),
  v as (
    select wv.hosted_key, count(*)::bigint as views
    from web_visits wv
    where wv.area = 'hosted' and wv.kind = 'beacon' and wv.at >= p_since and wv.hosted_key is not null
    group by 1
  )
  select p.id as project_id,
    coalesce(a.articles, 0) as articles,
    coalesce(a.articles_recent, 0) as articles_recent,
    a.last_article_at,
    coalesce(g.clicks, 0) as clicks_28d,
    coalesce(g.impressions, 0) as impressions_28d,
    coalesce(m.c, 0) as llm_cost_microusd,
    coalesce(m.cr, 0) as llm_cost_recent_microusd,
    coalesce(d.c, 0) as dfs_cost_microusd,
    coalesce(d.cr, 0) as dfs_cost_recent_microusd,
    coalesce(v.views, 0) as blog_views_recent
  from projects p
  left join a on a.project_id = p.id
  left join g on g.project_id = p.id
  left join m on m.project_id = p.id
  left join d on d.project_id = p.id
  left join v on v.hosted_key = p.hosted_key
$$;

-- Signed-in dashboard activity per user, from the proxy's rows (every
-- dashboard page load carries the session's user id).
create or replace function owner_user_activity(p_since timestamptz)
returns table (user_id uuid, last_seen timestamptz, views_recent bigint, days_active_recent bigint)
language sql stable as $$
  select wv.user_id,
    max(wv.at) as last_seen,
    count(*) filter (where wv.at >= p_since) as views_recent,
    count(distinct (wv.at at time zone 'UTC')::date) filter (where wv.at >= p_since) as days_active_recent
  from web_visits wv
  where wv.user_id is not null and wv.kind = 'server' and wv.area = 'app'
  group by 1
$$;
