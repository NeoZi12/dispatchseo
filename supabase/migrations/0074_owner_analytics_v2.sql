-- 0074: owner analytics, second pass (2026-11-06).
--
-- Three things the first day of real data asked for:
--   - a beacon from a declared crawler (a headless browser that runs our
--     script) counted as a person; now "people" = beacon rows whose user
--     agent is not a bot.
--   - daily product-event counts (signups, checkouts) for the page's charts.
--   - daily cost (LLM calls + platform-billed DataForSEO) for a cost chart.
-- create or replace keeps the signatures of 0073, so nothing else changes.
-- Vanilla-Postgres safe, idempotent on replay.

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
    count(*) filter (where kind = 'beacon' and not bot) as human_views,
    count(distinct visitor) filter (where kind = 'beacon' and not bot) as human_visitors
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
    case when p_bots then 'kind = ''server'' and bot' else 'kind = ''beacon'' and not bot' end
  ) using p_from, p_to, p_area, p_limit;
end
$$;

create or replace function owner_visits_count(p_from timestamptz, p_to timestamptz, p_area text, p_paths text[])
returns table (views bigint, visitors bigint)
language sql stable as $$
  select count(*)::bigint as views, count(distinct visitor)::bigint as visitors
  from web_visits
  where at >= p_from and at < p_to and area = p_area and kind = 'beacon' and not bot and path = any(p_paths)
$$;

create or replace function owner_events_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, event text, n bigint, actors bigint)
language sql stable as $$
  select (at at time zone 'UTC')::date as day, event, count(*) as n, count(distinct distinct_id) as actors
  from app_events
  where at >= p_from and at < p_to
  group by 1, 2
  order by 1
$$;

create or replace function owner_cost_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, llm_microusd bigint, dfs_microusd bigint)
language sql stable as $$
  with m as (
    select (created_at at time zone 'UTC')::date as day, sum(cost_microusd)::bigint as c
    from model_calls
    where created_at >= p_from and created_at < p_to
    group by 1
  ),
  d as (
    select day, sum(cost_microusd)::bigint as c
    from dataforseo_usage
    where day >= p_from::date and day < p_to::date
    group by 1
  )
  select coalesce(m.day, d.day) as day, coalesce(m.c, 0) as llm_microusd, coalesce(d.c, 0) as dfs_microusd
  from m full outer join d on d.day = m.day
  order by 1
$$;
