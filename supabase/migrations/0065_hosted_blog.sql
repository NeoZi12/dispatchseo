-- 0065: the hosted blog.
--
-- A code-built site with no blog used to park every article as blocked_setup
-- ("tell us the folder"). Now it gets one: DispatchSEO serves the site's /blog
-- itself (src/lib/hosted-blog.ts, /hosted/<slug>/blog/...), and the site
-- forwards /blog to us with a one-line rewrite we open as a pull request.
-- publish_target gains the value 'hosted' (text column, no constraint; code
-- change only - see 0055 for why targets are not an enum).
--
-- Plain vanilla-Postgres objects only.

alter table projects add column if not exists hosted_cta_url text;
alter table projects add column if not exists hosted_cta_label text;
-- The rewrite pull request we opened, and when /blog on the site's own domain
-- was last seen answering with our marker header (so the setup card can say
-- "merged and live" without guessing).
alter table projects add column if not exists hosted_rewrite_pr_url text;
alter table projects add column if not exists hosted_rewrite_live_at timestamptz;

comment on column projects.hosted_cta_url is
  'Hosted blog: where the call-to-action on every article points. Null = the site root.';

-- The look of the hosted blog, read once from the site's own homepage when
-- the hosted route is switched on (theme colour, logo, accent, font) and
-- editable by the owner. Null = the default theme.
alter table projects add column if not exists hosted_theme jsonb;

-- The public key the hosted routes are addressed by (/hosted/<key>/blog).
-- NEVER the project slug: slugs are reused after a project is deleted (the
-- next signup whose domain starts the same way gets it), and a merged
-- forwarding rule in the old customer's repo would then serve the new
-- tenant's articles on the old customer's domain. A random key is minted
-- when the hosted route is switched on and never reassigned.
alter table projects add column if not exists hosted_key text;
create unique index if not exists projects_hosted_key_idx on projects (hosted_key) where hosted_key is not null;
-- The origin the site actually serves from (https://www.example.com when the
-- apex redirects there), learned from the homepage fetch; canonical urls,
-- the sitemap and page records use it. Null = https://<domain>.
alter table projects add column if not exists hosted_origin text;
-- When a hosted article went live (the drafts table had no publish date;
-- updated_at moves on every edit and is the wrong thing to sort or date by).
alter table article_drafts add column if not exists published_at timestamptz;
