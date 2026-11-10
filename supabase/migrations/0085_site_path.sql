-- 0085: the folder a site lives in on its host, when it is not the root.
--
-- NULL = the site is the root of its domain (every site until now). A GitHub
-- Pages project site is served at https://<owner>.github.io/<repo>/ and the
-- root of that host is somebody else's page (or a 404): the first such signup
-- (mohamadgarmabi.github.io/tanstack-fetch, 2026-11-10) had its crawl, its
-- Google verification and its article addresses all pointed at an empty root.
-- Stored with a leading slash and no trailing one ("/tanstack-fetch"); every
-- "the site's own address" in the code is the domain plus this.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_path text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_site_path_shape') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_site_path_shape
      CHECK (site_path IS NULL OR site_path ~ '^(/[A-Za-z0-9._~-]+){1,4}$');
  END IF;
END $$;
