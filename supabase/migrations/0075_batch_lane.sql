-- 0075: the hosted writer's "batch" provider (operator-only, 2026-11-06).
--
-- With projects.writer_provider = 'batch' every generative call of a run is
-- sent through Anthropic's Message Batches API (half the list price, results
-- within minutes to hours) on the park-and-resume rails 0069 built for the
-- subscription writer: the call becomes a writer_tasks row carrying the id
-- of its one-request batch, the stage parks, the batch-poll job reads the
-- result and settles the task, and the stage replays with the answer
-- memoized. Set by SQL only; projects.writer_provider is free text already,
-- so nothing changes there.
--
-- Vanilla-Postgres safe: plain columns and an index. Idempotent on replay.

alter table writer_tasks
  add column if not exists batch_id text,     -- msgbatch_... of the request in flight; null for agent-lane tasks
  add column if not exists batch_model text;  -- the model it was sent to, so the result is priced as that model

-- The poller and closeRunTasks read queued batch tasks per run.
create index if not exists writer_tasks_status_batch_idx
  on writer_tasks (status, batch_id)
  where batch_id is not null;
