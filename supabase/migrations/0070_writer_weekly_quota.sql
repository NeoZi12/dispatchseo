-- 0070: a per-site number of articles a week (operator-only, 2026-10-24).
--
-- The plan decides how many articles a week a hosted site gets (billing.ts
-- ARTICLES_PER_WEEK: Starter 1, Growth 3, Scale 5). This column replaces that
-- number for ONE site when set - the owner's own Paperbot takes 3 a week on a
-- 5-a-week plan. Set by SQL only: no UI, no tier, no MCP setter. NULL = the
-- plan's number. 0 = this site writes nothing (the plan still bills).
--
-- Vanilla-Postgres safe, idempotent on replay.

alter table projects
  add column if not exists writer_weekly_quota integer;
