-- 0030: the wizard owns the whole setup ("suffer once, then it's done").
--
-- gh_merge_token: the GitHub token behind one-tap merge, stored encrypted
-- (enc:v1:...) so the wizard connects it in-browser like the GSC key (0029)
-- - no .env edit, no restart. Env GH_MERGE_TOKEN still wins when set.
--
-- onboarding_screen: where the wizard last stood for a project, so closing
-- the tab (or a stuck terminal) resumes the wizard at the same screen
-- instead of restarting at step 1. Values are the wizard's screen ids.

alter table instance_settings add column if not exists gh_merge_token text;
alter table projects add column if not exists onboarding_screen text;
