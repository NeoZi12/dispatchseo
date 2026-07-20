-- Reliability package (2026-07-20 audit): make the first-boot claim carry
-- everything a self-hosted instance needs so nothing depends on undocumented
-- env vars, and give stuck builds a recoverable timestamp.
--
-- instance_settings.app_url: the instance's own public URL, captured from the
-- claim request. getPipelinePack() bakes it into every connected repo's
-- workflows; before this column, self-hosted deploys silently fell back to
-- the cloud domain and shipped pipelines that phoned the wrong backend.
-- instance_settings.enc_key: auto-generated secrets-encryption key, so the
-- onboarding "connect DataForSEO/SerpApi" path works with zero manual env
-- setup (DATAFORSEO_ENC_KEY env still wins when set; existing encrypted rows
-- keep decrypting with whichever key wrote them).
-- suggestions.started_at: stamped when a build marks a suggestion
-- in_progress; the hourly recovery sweep reverts rows stuck past the
-- workflow's own 45-minute timeout back to approved so a crashed build can
-- never strand the queue.

alter table instance_settings add column if not exists app_url text;
alter table instance_settings add column if not exists enc_key text;

alter table suggestions add column if not exists started_at timestamptz;
