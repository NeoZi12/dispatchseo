-- 0016: the two-stage trend radar. Stage 1 (Scan now) sweeps the niche and
-- queues trending SUBJECTS as trend_topics rows - "codex vs claude code",
-- not finished guide ideas. Stage 2 fires when the owner picks a topic
-- (Get takes): a second workflow expands that one topic into 3-5 concrete
-- guide angles, which land as pending suggestions linked back to the topic
-- via suggestions.trend_topic_id. The owner then queues or builds the takes
-- they like. Splitting the pipeline this way also splits the cost: the sweep
-- is cheap, and deep validation only runs on subjects the owner chose.
--
-- projects.trend_scan_requested_at backs the Scan-now cooldown (30 min):
-- last_trend_scan_at stamps when a scan FINISHES (record_trend_scan), so a
-- separate request stamp is needed to block double-fires while one is still
-- running. trend_topics.expand_requested_at plays the same role per topic.

create table if not exists trend_topics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references projects(id) on delete cascade,
  title text not null,
  -- { why_now, signals[], sources[] } - the hype evidence from the sweep.
  evidence jsonb,
  -- new: waiting for the owner to pick or dismiss it
  -- expanding: Get takes fired, the expand workflow is running
  -- expanded: takes are on the radar as pending suggestions
  -- dismissed: the owner passed (or the scan aged it out after 14 days)
  status text not null default 'new'
    check (status in ('new', 'expanding', 'expanded', 'dismissed')),
  expand_requested_at timestamptz,
  expanded_at timestamptz,
  created_at timestamptz not null default now()
);

-- One radar row per subject per project - a re-scan that finds the same
-- subject again must not duplicate it (the scan dedupes by title too; this
-- is the backstop).
create unique index if not exists trend_topics_project_title
  on trend_topics (project_id, lower(title));

-- Same posture as every operational table: RLS on, zero policies - only the
-- service-role key can touch it.
alter table trend_topics enable row level security;

-- Takes remember which subject they came from, so the Trends page can group
-- them under their topic card. Pre-topic trend suggestions keep null and
-- render in their own legacy block.
alter table suggestions
  add column if not exists trend_topic_id uuid references trend_topics(id) on delete set null;

alter table projects
  add column if not exists trend_scan_requested_at timestamptz;
