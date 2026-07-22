-- 0032: the builder's heartbeat. The in-stack builder polls
-- /api/builder/jobs every ~10 minutes; stamping each claiming poll gives
-- the UI a verifiable "automatic builds are on" signal - the wizard
-- finale flips its step green off it, and Home shows a setup card until
-- the first check-in (an unlocked dashboard with a dead builder was the
-- silent-failure mode this closes). Plain column, vanilla-Postgres safe.

alter table instance_settings
  add column if not exists builder_last_seen_at timestamptz;
