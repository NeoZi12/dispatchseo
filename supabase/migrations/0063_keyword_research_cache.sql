-- 0063: keyword research cache.
--
-- Labs keyword_suggestions / related_keywords bill ~$0.012 per seed per
-- endpoint, and the agents re-buy the same seeds every research run (the
-- 2026-10-08 ledger showed the same handful of seeds expanded week after
-- week on the platform account). Search-volume data is not tenant-specific
-- and moves on a monthly scale, so one shared cache row per (endpoint, seed,
-- market) serves every project for 30 days at $0.
--
-- Plain vanilla-Postgres objects only - no Supabase-specific references, so
-- the docker stack's setup.sql replay needs no guard block.

create table if not exists keyword_research_cache (
  endpoint text not null,             -- "keyword_suggestions" | "related_keywords"
  seed text not null,                 -- lower-cased, trimmed
  location_code int not null,
  language_code text not null,
  "limit" int not null,               -- rows requested when fetched; a bigger ask refetches
  ideas jsonb not null,               -- the mapped KeywordIdea[] exactly as the live call returned
  cost_microusd int not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (endpoint, seed, location_code, language_code)
);

-- Service-role only, like every operational table (RLS on, zero policies).
alter table keyword_research_cache enable row level security;
