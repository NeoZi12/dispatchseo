-- suggestions.source gains 'refresh': update ideas queued by the nightly
-- refresh detector (src/lib/refresh-detect.ts), which finds published guides
-- sitting at position 5-20 for their primary keyword and queues a
-- type:"update" suggestion for the daily builder's UPDATE MODE.
--
-- Same drop-and-re-add dance as 0014 (the constraint's one home): CHECK
-- constraints can't be widened in place, and DROP IF EXISTS keeps the docker
-- stack's setup.sql replay idempotent. Vanilla Postgres needs no guard block.
alter table suggestions drop constraint if exists suggestions_source_check;
alter table suggestions
  add constraint suggestions_source_check
  check (source in ('research', 'trend-scan', 'manual', 'refresh', 'autopilot', 'owner'));
