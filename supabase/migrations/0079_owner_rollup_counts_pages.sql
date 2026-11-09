-- 0079: the Owner page's "Articles" counts what is live on the site, not what
-- the hosted writer drafted.
--
-- 0073 counted published article_drafts, which only the hosted engine writes.
-- A site whose own agent builds through PRs (Never Zero: 27 live guides and
-- tools on 2026-11-08) showed 3. Every publish path - log_page from the repo
-- builders, verify for repo/WordPress articles, publish-hosted - upserts the
-- same pages row and stamps live_at once the URL serves 200, so live pages are
-- the one count that is true for every mode. Logged-but-never-live pages (a PR
-- that never merged) stay out. Landing pages are not articles.
--
-- Same signature as 0073, so create or replace swaps it in place; the reader
-- (src/lib/owner-analytics.ts) is unchanged.
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
    select pg.project_id,
      count(*) as articles,
      count(*) filter (where coalesce(pg.published_at, pg.live_at) >= p_since) as articles_recent,
      max(coalesce(pg.published_at, pg.live_at)) as last_article_at
    from pages pg
    where pg.live_at is not null
      and coalesce(pg.type, 'guide') <> 'landing'
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
