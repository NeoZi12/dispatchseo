-- 0037: the in-stack builder's Claude Code OAuth token, wizard-owned.
-- Same "suffer once in the browser, never touch .env" pattern as the GSC key
-- (0029) and the GitHub merge token (0030): the owner pastes their
-- sk-ant-oat... token on the dashboard's automatic-builds step, it's stored
-- encrypted (enc:v1:...) here, and /api/builder/jobs hands it to the builder
-- container in its poll feed - exactly how the merge token already reaches
-- it. Removes the last step that made owners hunt for the install folder and
-- edit .env by hand. The container's own CLAUDE_CODE_OAUTH_TOKEN env (set in
-- docker-compose from .env) still wins when present, so classic installs are
-- unchanged. Single-row instance_settings, vanilla-Postgres safe.

alter table instance_settings add column if not exists builder_claude_token text;
