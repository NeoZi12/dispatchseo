-- 0025: AI visibility (GEO) - for a tracked query, does an AI answer exist,
-- and is this project's domain cited in it? Two writers share the table:
--   - the daily-ranks cron parses Google's AI Overview out of the same SERP
--     pull that checks rankings (engine 'google_ai_overview'), so Google AI
--     data costs nothing beyond the rank check the project already pays for;
--   - the agent's geo-scan workflow samples answer engines on the user's own
--     subscription and writes results via record_ai_citations (engine
--     'claude' today; 'chatgpt' / 'perplexity' / 'gemini' reserved).
-- Append-only snapshots (like rank_checks) so the dashboard can draw a trend.
create table if not exists ai_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references projects(id) on delete cascade,
  engine text not null,
  query text not null,
  has_ai_answer boolean not null default false,
  cited boolean not null default false,
  cited_url text,
  -- Verbatim answer snippet: the dashboard shows the actual AI text behind
  -- the number, which is what makes the metric feel real.
  answer_excerpt text,
  -- Every source the answer cited: [{domain, url, title}]. Powers the
  -- "cited instead of you" gap list.
  citations jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now()
);

create index if not exists ai_snapshots_project_idx
  on ai_snapshots (project_id, engine, checked_at desc);

-- Same posture as every other table: RLS on, zero policies - service-role only.
alter table ai_snapshots enable row level security;
