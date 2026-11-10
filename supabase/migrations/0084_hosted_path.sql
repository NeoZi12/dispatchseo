-- 0084: the public path the hosted blog answers at on the site's own domain.
--
-- NULL = "blog" (every site until now). A site whose /blog is already a real
-- blog that our repo publishing cannot write into (posts kept in a CMS, not as
-- files in the repo - dfmsolutions.de, 2026-11-10) gets the hosted blog at a
-- second path instead, "articles", so its own blog is never forwarded away.
-- Our own addresses (/hosted/<key>/blog/...) do not change; only the path the
-- forwarding rule on the customer's site listens on.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hosted_path text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_hosted_path_shape') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_hosted_path_shape
      CHECK (hosted_path IS NULL OR hosted_path ~ '^[a-z0-9][a-z0-9-]{0,39}$');
  END IF;
END $$;
