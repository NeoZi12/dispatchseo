-- 0089: review before publishing (src/lib/article-review.ts).
--
-- Some owners want to read every article before it reaches their site. Setup
-- now asks once: publish automatically (what every site did until now) or
-- wait for my review. "review" parks each finished article as status
-- 'review' on article_drafts and emails the owner; their Publish button
-- releases it through the normal publish job.
--
-- NULL = never chosen, which publishes automatically: every existing site
-- keeps exactly the behaviour it had, and the setup's Publishing step asks
-- only a site whose column is still NULL.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS publish_mode text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_publish_mode_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_publish_mode_check CHECK (publish_mode IS NULL OR publish_mode IN ('auto', 'review'));
  END IF;
END $$;

-- The owner's approval, on the article itself. An approved article can still
-- park on setup afterwards (a repo that isn't the site, a WordPress user who
-- can't publish); when it is released later it must go straight out, not
-- back into review with a second "ready for review" email. NULL = never
-- approved by hand (every automatic article, and every one still waiting).
ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- One live draft per idea (0059) now counts an article waiting for review as
-- live too, or a second draft for the same idea could be written meanwhile
-- and the owner's Publish would then fail on this index.
DROP INDEX IF EXISTS article_drafts_active_suggestion_idx;
CREATE UNIQUE INDEX IF NOT EXISTS article_drafts_active_suggestion_idx
  ON article_drafts (suggestion_id)
  WHERE suggestion_id IS NOT NULL
    AND status IN ('submitted', 'accepted', 'blocked_setup', 'review', 'finished', 'published');
