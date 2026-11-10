-- 0087: does the connected repository build this site? (src/lib/repo-site-check.ts)
--
-- reverto.ai (2026-11-10) connected a repository that is not the site's own
-- code; every article would have become a pull request into a repo that never
-- reaches the site. The check compares the static files the live homepage
-- names with the repo's file list and is stored here as
-- {verdict: match|mismatch|unknown, repo, named, found, at}, so the dashboard
-- can say why an article is waiting and setup can refuse the wrong repo.
-- NULL = never checked. (0086 is taken by the blog-stores work.)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_site_check jsonb;
