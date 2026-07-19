-- 0009: per-project keyword data source - the onboarding wizard's choice.
-- Three modes the engine supports end to end:
--   'dataforseo'  paid, most accurate (the pre-wizard default, so existing
--                 projects keep behaving exactly as before)
--   'serpapi'     free mode with a bring-your-own SerpApi key (250 searches/mo
--                 free tier) - live SERP checks on a weekly cadence
--   'gsc'         pure free mode - positions come from Search Console only
-- serpapi_key is stored encrypted at rest (same crypto.ts posture as the
-- DataForSEO password). powerups_skipped remembers which optional setup cards
-- the user unchecked in the wizard so Home stops showing them.

alter table projects add column if not exists keyword_source text not null default 'dataforseo'
  check (keyword_source in ('dataforseo', 'serpapi', 'gsc'));
alter table projects add column if not exists serpapi_key text;
alter table projects add column if not exists powerups_skipped text[] not null default '{}';
