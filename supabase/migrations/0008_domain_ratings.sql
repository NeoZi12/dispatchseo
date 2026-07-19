-- 0008: domain_ratings - a persistent, per-project Domain Rating snapshot.
--
-- Why this exists: DR used to live only in unstable_cache. Any
-- revalidatePath('/', ...) (project connect/switch/delete/create, and every
-- '/'-scoped mutation) counts as "revalidate all data" in Next 16, so it wiped
-- BOTH the cached value AND the fetched_at timestamp the "updates in Xh Ym"
-- timer counts down from. The timer therefore snapped back to ~24h on every
-- dashboard mutation, and - worse - each wipe re-fired the paid DataForSEO
-- backlinks-summary call on the next render, defeating the 24h cache entirely.
--
-- Persisting the snapshot in the DB makes the 24h cache real: getDomainRating
-- reads this row, refreshes from DataForSEO only when fetched_at is older than
-- 24h, and the timer reflects the true last-fetch time. A page revalidation can
-- no longer reset it.
--
-- One row per project. Cascades on project delete, same as every other table
-- (see 0006). RLS on with zero policies - the service-role key (dashboard +
-- crons) is the only reader/writer, matching the house posture.

create table if not exists domain_ratings (
  project_id        uuid primary key references projects(id) on delete cascade,
  dr                int,          -- 0-100 (raw rank / 10, rounded); null = unknown
  rank              int,          -- raw 0-1000
  referring_domains int,
  backlinks         int,
  spam_score        int,          -- 0-100
  fetched_at        timestamptz not null default now()
);

alter table domain_ratings enable row level security;
