-- 0019: owner content preferences - the Instructions page's template controls.
-- One JSONB blob per project ({} = untouched defaults): house_rules free text
-- injected into the build playbooks, disabled_archetypes removed from the
-- guide shape rotation, disabled_blocks dropped from the guide skeleton
-- (tldr / comparison_table / visuals / faq). Normalized and validated in
-- src/lib/content-prefs.ts - the column stays schemaless on purpose so new
-- knobs don't need a migration each.
alter table projects
  add column if not exists content_prefs jsonb not null default '{}'::jsonb;
