-- 0018: explicit pipeline-install completion mark.
-- The install workflow's final step calls the mark_pipeline_installed MCP
-- tool, which stamps this; the Home setup card flips to its green
-- "installed" state on the stamp (with the conventions row kept as a
-- back-compat fallback signal). Additive and nullable - in-flight code that
-- never selects the column keeps working.
alter table projects add column if not exists pipeline_installed_at timestamptz;
