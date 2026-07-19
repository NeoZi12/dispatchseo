-- SEO Manager MVP - initial schema.
-- Single user. Access is server-side only via the service role key.
-- RLS is ENABLED with zero policies on every table: that makes the anon and
-- authenticated PostgREST roles see nothing, while the service role bypasses
-- RLS entirely. This is the "no RLS complexity" posture without leaving the
-- tables open to anyone holding the public anon key.

-- pages first: keywords.target_page_id references it.
create table pages (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text,
  type text,                          -- guide | tool | landing
  primary_keyword text,
  published_at timestamptz,
  pr_url text,
  created_at timestamptz default now()
);

-- tracked keywords
create table keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  search_volume int,
  keyword_difficulty numeric,
  cpc numeric,
  intent text,                        -- informational/commercial/etc
  status text default 'tracking',     -- tracking | paused
  target_page_id uuid references pages(id),
  created_at timestamptz default now()
);

-- rank history (one row per keyword per check)
create table rank_checks (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid references keywords(id) on delete cascade,
  position int,                       -- null = not in top 100
  url text,                           -- which page ranks
  checked_at timestamptz default now()
);

-- the daily cron reads/writes per keyword ordered by time
create index rank_checks_keyword_checked_idx
  on rank_checks (keyword_id, checked_at desc);

-- the suggestions queue (heart of the system)
create table suggestions (
  id uuid primary key default gen_random_uuid(),
  type text not null,                 -- guide | tool | backlink | update
  title text not null,
  primary_keyword text,
  keyword_volume int,
  keyword_difficulty numeric,
  rationale text,                     -- why this is worth doing
  spec jsonb,                         -- brief: outline, angle, tool functionality, target url for backlinks
  status text default 'pending',      -- pending | approved | rejected | in_progress | done
  result_pr_url text,
  created_at timestamptz default now(),
  decided_at timestamptz,
  completed_at timestamptz
);

-- daily GSC snapshot
create table gsc_stats (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  clicks int,
  impressions int,
  ctr numeric,
  avg_position numeric,
  top_queries jsonb,                  -- [{query, clicks, impressions, position}] top 20
  top_pages jsonb
);

-- backlink prospects
create table backlink_prospects (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  url text,
  domain_rating numeric,
  reason text,                        -- why relevant / where found
  status text default 'new',          -- new | contacted | acquired | rejected
  created_at timestamptz default now()
);

alter table pages enable row level security;
alter table keywords enable row level security;
alter table rank_checks enable row level security;
alter table suggestions enable row level security;
alter table gsc_stats enable row level security;
alter table backlink_prospects enable row level security;
