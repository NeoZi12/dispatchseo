-- 0092: who attached a site's GitHub installation (src/lib/github-installer.ts).
--
-- The GitHub login of the person whose sign-in proved the installation when
-- it was attached to the site. A repository is only ever used by the site
-- when that person can push to it: an installation on an organization also
-- covers repositories its members can only read, and our App must not open
-- (or merge) pull requests there on their say-so (security review,
-- 2026-11-12).
--
-- Null = attached before this migration, or GitHub did not name the person:
-- the site keeps the rule it always had (any repository the installation
-- covers). Additive and nullable, so in-flight code is unaffected.

alter table projects add column if not exists github_installer_login text;
