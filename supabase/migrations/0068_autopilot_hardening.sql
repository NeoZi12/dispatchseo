-- 0068: a PARKED idea still owns its keyword.
--
-- The hosted writer now parks an idea it refuses on content grounds (too few
-- readable page-one sources, the site already ranks, no gain to add) with
-- suggestions.status = 'parked' instead of sending it back to 'pending'
-- (audit 2026-10-24, A10). 0043's one-live-keyword index enumerated the live
-- statuses as pending/approved/in_progress, so a parked keyword fell outside
-- it: autopilot research could queue the very same keyword again next week,
-- the writer would pay to read page one again, and park it again. Parked
-- joins the live set here.
--
-- Built under a NEW name first and the old index dropped only once that
-- succeeded, inside one guarded block: if an existing parked row collides
-- with a live row for the same keyword (possible for rows parked before this
-- applied), the new index cannot be built - then the old one stays exactly as
-- it was and the migration still completes, rather than leaving suggestions
-- with no keyword index at all. Re-running it after cleaning the collision
-- finishes the swap. Idempotent on replay (the docker stack applies setup.sql
-- on every boot): the second run finds the new index, and the old one gone.
--
-- Vanilla-Postgres safe: no auth schema, nothing Supabase-specific. No other
-- 2026-10-24 Workstream B change needed a column (held articles release from
-- writer_runs.updated_at; see src/lib/autopilot/hold.ts).

do $$
begin
  create unique index if not exists suggestions_live_keyword_v2_idx
    on suggestions (project_id, type, lower(btrim(primary_keyword)))
    where status in ('pending', 'approved', 'in_progress', 'parked') and primary_keyword is not null;
  drop index if exists suggestions_live_keyword_idx;
exception when unique_violation then
  raise notice '0068: a parked keyword collides with a live idea; kept suggestions_live_keyword_idx. Resolve the duplicate and re-run.';
end
$$;
