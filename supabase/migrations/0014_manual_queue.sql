-- 0014: manual ideas + a visible, owner-controlled build queue.
--
-- suggestions.source gains 'manual': ideas the owner typed themselves (via
-- the dashboard's Add-idea form or an explicit ask in Claude Code). Manual
-- ideas land already approved - the owner wrote them, there is nothing to
-- gate.
--
-- suggestions.queue_position makes the build order explicit and owner-owned.
-- Semantics (all consumers sort in JS so pre-migration deploys keep working):
--   - lowest position builds next; rows with NULL queue FIFO by created_at
--     AFTER every positioned row.
--   - a dashboard reorder rewrites the whole group (guides vs tools are
--     separate lists) to dense 1..n.
--   - "front" placement (trend approvals, manual do-this-next adds) writes
--     min(position) - 1, so it beats everything already positioned.

alter table suggestions
  add column if not exists queue_position int;

-- This is the ONLY place suggestions_source_check is established (0013 added
-- the column but deliberately leaves the constraint to here - see its
-- comment). setup.sql replays the whole history on every docker boot, and a
-- standalone `add constraint ... check` re-validates every existing row, so
-- the replayed history must contain exactly one, final vocabulary.
-- WIDENING THIS LATER: edit the list HERE rather than adding the new value
-- in a new migration, otherwise this line becomes the landmine 0013 was.
alter table suggestions drop constraint if exists suggestions_source_check;
alter table suggestions
  add constraint suggestions_source_check
  check (source in ('research', 'trend-scan', 'manual', 'refresh', 'autopilot', 'owner'));
