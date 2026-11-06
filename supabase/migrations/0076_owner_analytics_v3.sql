-- 0076: owner analytics, third pass (2026-11-06).
--
--   - imported history: a one-time PostHog import (scripts/import-posthog.mjs)
--     writes past page views into web_visits as kind='import' and past
--     product events into app_events, keyed by source_id so a re-run never
--     duplicates. Imported page views are people (PostHog only loaded for
--     visitors who accepted cookies), so every "people" count below reads
--     kind in ('beacon', 'import').
--   - owner_bots_daily: crawler hits per day and bot, for the AI panel.
--   - owner_cost_breakdown: one customer's metered cost by day and line item
--     (LLM slot, DataForSEO endpoint), for the per-customer page.
--   - owner_user_days: one customer's signed-in dashboard days.
-- Vanilla-Postgres safe, idempotent on replay.

alter table web_visits add column if not exists source_id text;
create unique index if not exists web_visits_source_id_idx on web_visits (source_id);
alter table app_events add column if not exists source_id text;
create unique index if not exists app_events_source_id_idx on app_events (source_id);
create index if not exists web_visits_bot_at_idx on web_visits (at desc) where bot;

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
    count(*) filter (where kind in ('beacon', 'import') and not bot) as human_views,
    count(distinct visitor) filter (where kind in ('beacon', 'import') and not bot) as human_visitors
  from web_visits
  where at >= p_from and at < p_to and area = p_area
  group by 1
  order by 1
$$;

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
    case when p_bots then 'kind = ''server'' and bot' else 'kind in (''beacon'', ''import'') and not bot' end
  ) using p_from, p_to, p_area, p_limit;
end
$$;

create or replace function owner_visits_count(p_from timestamptz, p_to timestamptz, p_area text, p_paths text[])
returns table (views bigint, visitors bigint)
language sql stable as $$
  select count(*)::bigint as views, count(distinct visitor)::bigint as visitors
  from web_visits
  where at >= p_from and at < p_to and area = p_area and kind in ('beacon', 'import') and not bot and path = any(p_paths)
$$;

create or replace function owner_bots_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, bot_name text, area text, hits bigint)
language sql stable as $$
  select (at at time zone 'UTC')::date as day, coalesce(bot_name, 'unknown') as bot_name, area, count(*)::bigint as hits
  from web_visits
  where at >= p_from and at < p_to and bot and kind = 'server' and area in ('site', 'file')
  group by 1, 2, 3
  order by 1
$$;

create or replace function owner_cost_breakdown(p_projects uuid[])
returns table (day date, kind text, item text, microusd bigint)
language sql stable as $$
  select (mc.created_at at time zone 'UTC')::date as day, 'llm'::text as kind, coalesce(mc.slot, 'other') as item, sum(mc.cost_microusd)::bigint as microusd
  from model_calls mc
  where mc.project_id = any(p_projects)
  group by 1, 2, 3
  union all
  select du.day, 'dfs'::text as kind, du.endpoint as item, sum(du.cost_microusd)::bigint as microusd
  from dataforseo_usage du
  where du.project_id = any(p_projects)
  group by 1, 2, 3
$$;

create or replace function owner_user_days(p_user uuid, p_from timestamptz, p_to timestamptz)
returns table (day date, views bigint)
language sql stable as $$
  select (at at time zone 'UTC')::date as day, count(*)::bigint as views
  from web_visits
  where user_id = p_user and kind = 'server' and area = 'app' and at >= p_from and at < p_to
  group by 1
  order by 1
$$;
