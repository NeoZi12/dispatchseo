-- The writer's cost ledger, split by cache use.
--
-- model_calls.input_tokens has always been the TOTAL prompt size (fresh +
-- cache read + cache write), and the price was computed in code from the
-- split the Anthropic response carries - then the split was thrown away. A
-- per-article cost that cannot be re-derived from the ledger is a cost
-- nobody can audit: the 2026-10-24 engine audit could not tell whether a
-- patch hit the cache or paid full price. These two columns keep the split.
--
-- Additive and zero-downtime: both default to 0, so rows written by code
-- that predates this migration stay valid, and models.ts retries an insert
-- without them when the columns are missing (code may ship first).
-- Plain Postgres only - the docker stack replays setup.sql on every boot.

alter table model_calls
  add column if not exists cache_read_tokens integer not null default 0;

alter table model_calls
  add column if not exists cache_write_tokens integer not null default 0;

comment on column model_calls.cache_read_tokens is
  'Prompt tokens served from the provider cache (Anthropic usage.cache_read_input_tokens). Included in input_tokens.';
comment on column model_calls.cache_write_tokens is
  'Prompt tokens written to the provider cache (Anthropic usage.cache_creation_input_tokens). Included in input_tokens.';
