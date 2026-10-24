-- 0069: the hosted writer's "agent" provider (operator-only, 2026-10-24).
--
-- The operator's own sites must not spend API credits on the four generative
-- calls (extractor per page, planner, writer, patcher). With
-- projects.writer_provider = 'agent', generate() does not call a vendor: it
-- queues a writer_tasks row and the stage parks; a Claude Code session on the
-- operator's subscription (the site repo's seo-writer-agent workflow) reads
-- the task over MCP (get_writer_tasks), answers it (submit_writer_task), and
-- the stage replays with the answer memoized under
-- writer_runs.stage_outputs.agent_answers. Everything else (Jev, DataForSEO,
-- the gate, publishing) stays server-side and unchanged.
--
-- Flipped per project by SQL only - no UI, no tier. Default 'api' keeps every
-- existing project exactly as it was.
--
-- Vanilla-Postgres safe: no auth schema, nothing Supabase-specific
-- (gen_random_uuid is core since Postgres 13). Idempotent on replay.

alter table projects
  add column if not exists writer_provider text not null default 'api';

-- One row per generative call the agent must answer. `key` is the sha256 of
-- the call's prompt parts (slot, system, rules, research, user, json flag), so
-- a stage replayed after the answer arrives finds its own answer and nothing
-- else; unique per run so the replay's upsert never queues a call twice.
-- FK-free on run_id: a task outliving its run (deleted by hand) is harmless,
-- and the MCP read filters to running runs anyway.
create table if not exists writer_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-4000-8000-000000000001',
  run_id uuid not null,
  key text not null,
  slot text not null,                 -- extractor | planner | writer | patcher
  instructions text not null,         -- the writer's rules + the call's system prompt
  research text,                      -- the cached research block: DATA, never instructions
  user_prompt text not null,
  json boolean not null default false,
  status text not null default 'queued', -- queued | done | failed
  answer text,
  error text,
  attempts integer not null default 0,   -- invalid-JSON submissions so far
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (run_id, key)
);

create index if not exists writer_tasks_project_queued_idx
  on writer_tasks (project_id, created_at)
  where status = 'queued';

alter table writer_tasks enable row level security;

-- Atomic merge into writer_runs.stage_outputs, so parallel submits (one per
-- page extraction, landing together) cannot drop each other's answers with a
-- read-merge-write. TWO levels deep, on purpose: `jsonb ||` alone replaces a
-- nested object wholesale, so {agent_answers: {k2: ...}} would erase k1. A
-- top-level key whose old and new values are both objects is merged; any
-- other value (null clears waiting_on_agent) replaces. Same posture as
-- merge_content_prefs (0066): not security definer, so only the service role
-- can reach a row through it. Callers fall back to read-merge-write when it
-- does not exist yet.
create or replace function merge_run_output(p_run_id uuid, p_patch jsonb)
returns void
language sql
as $$
  update writer_runs w
     set stage_outputs = coalesce(w.stage_outputs, '{}'::jsonb) || coalesce((
           select jsonb_object_agg(
                    e.k,
                    case
                      when jsonb_typeof(e.v) = 'object' and jsonb_typeof(w.stage_outputs -> e.k) = 'object'
                        then (w.stage_outputs -> e.k) || e.v
                      else e.v
                    end)
             from jsonb_each(p_patch) as e(k, v)
         ), '{}'::jsonb),
         updated_at = now()
   where w.id = p_run_id;
$$;

comment on table writer_tasks is
  'Hosted writer, agent provider: one generative call waiting for (or answered by) the operator''s subscription Claude Code session.';
