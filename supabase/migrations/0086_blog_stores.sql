-- 0086: where a site's own blog keeps its posts inside its repo, when they
-- are data rather than markdown files (src/lib/blog-store.ts).
--
-- One row per project: the recipe the scout worked out once - the store file
-- (a JSON array, an array in a code file, or one JSON file per post), the
-- field names, the address pattern, the other files that need a line per
-- post, the repo's own rules - and whether it is "ready" to be written to or
-- "none" (with the reason). Cached because finding it costs a model call;
-- a "none" is looked at again after 14 days. A DB without this table simply
-- reads as "no store": those sites keep the hosted blog at /articles.
--
-- Service-role only like every operational table: RLS on, zero policies.
-- Plain Postgres; applies to the self-host stack as every migration must.
create table if not exists blog_stores (
  project_id uuid primary key references projects(id) on delete cascade,
  recipe jsonb not null,
  checked_at timestamptz not null default now()
);

alter table blog_stores enable row level security;
