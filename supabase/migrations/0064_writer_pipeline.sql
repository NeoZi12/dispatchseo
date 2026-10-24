-- 0064: the hosted writer pipeline (pivot of 2026-10-22).
--
-- DispatchSEO stops waiting for the customer's own coding agent to write the
-- article. Our server researches, writes, verifies and hands the article to
-- the existing finish -> publish -> verify chain (article_drafts + jobs,
-- migrations 0055/0056). Three tables:
--
--   writer_runs        one row per article attempt. The run walks a fixed list
--                      of stages (pick, research, plan, write, verify); every
--                      stage is one `write` job in the jobs queue, so a crash
--                      resumes at the stage it died in instead of re-paying the
--                      whole article.
--   writer_fact_sheets the research cache. A keyword's fact sheet (facts with
--                      the exact passage they came from, plus the pages they
--                      were read from) is not tenant-specific, so one row per
--                      (keyword, market) serves every site for a while.
--   model_calls        the cost ledger. Every model call, whichever vendor,
--                      lands here with its token counts and price, so the
--                      per-article cost is a SUM, not a guess.
--
-- Plain vanilla-Postgres objects only - the docker stack replays setup.sql.

create table if not exists writer_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references projects (id) on delete cascade,
  -- The queued idea this run fulfils, when there is one. A run can also be
  -- started from a bare keyword (owner's "suggest a topic", or a smoke test).
  suggestion_id uuid references suggestions (id) on delete set null,
  keyword text,
  title_hint text,

  -- pick | research | plan | write | verify | done
  stage text not null default 'pick',
  -- running | held | done | failed
  --   held   = the article exists as a draft but was NOT queued to publish;
  --            somebody (the operator, during the early customers) releases it
  status text not null default 'running',
  -- Every stage writes its output under its own key, so the next stage reads
  -- it from here rather than from a return value, and a dashboard can show the
  -- research ledger weeks later.
  stage_outputs jsonb not null default '{}'::jsonb,
  -- How many times the write stage has been re-entered (ledger / review / gate
  -- send it back). Bounded in code; stored so a retry after a crash does not
  -- forget it was already on its last loop.
  rewrites integer not null default 0,
  draft_id uuid references article_drafts (id) on delete set null,
  error text,
  cost_usd numeric(10, 4) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists writer_runs_project_created_idx
  on writer_runs (project_id, created_at desc);

-- One live run per idea. Without this, a cron that fires twice writes the
-- same article twice and pays for it twice.
create unique index if not exists writer_runs_active_suggestion_idx
  on writer_runs (suggestion_id)
  where suggestion_id is not null and status in ('running', 'held');

alter table writer_runs enable row level security;

create table if not exists writer_fact_sheets (
  keyword text not null,              -- lower-cased, trimmed
  location_code int not null,
  language_code text not null,
  sheet jsonb not null,               -- { facts: [{ claim, quote, url }], sources: [{ url, title }] }
  cost_usd numeric(10, 4) not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (keyword, location_code, language_code)
);

alter table writer_fact_sheets enable row level security;

create table if not exists model_calls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references projects (id) on delete cascade,
  run_id uuid references writer_runs (id) on delete set null,
  slot text not null,                 -- judge | extractor | planner | writer
  provider text not null,             -- anthropic | openai | typesafe | dry-run
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_microusd integer not null default 0,
  latency_ms integer not null default 0,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists model_calls_project_created_idx
  on model_calls (project_id, created_at desc);
create index if not exists model_calls_run_idx
  on model_calls (run_id);

alter table model_calls enable row level security;

comment on table writer_runs is
  'Hosted writer pipeline: one row per article attempt, advanced one stage per `write` job.';
comment on table model_calls is
  'Per-call model spend ledger for the hosted writer. Sum by run_id for the per-article cost.';
