-- 0036: agent-reported install progress for the wizard finale's checklist.
-- Installs run 10-60 minutes and the owner watches a mostly-dark screen; the
-- mark_install_step MCP tool merges {step: ISO timestamp} into this column
-- the moment the agent finishes each part, and the finale ticks the matching
-- row. Only the parts with no backend-visible artifact live here (workflows
-- written, stack adapted, repo settings, content home, site facts, research
-- kicked off) - derived signals (canary, site profile, the unlock stamp)
-- stay authoritative for their rows. Plain jsonb, vanilla-Postgres safe.

alter table projects add column if not exists install_progress jsonb not null default '{}'::jsonb;
