-- 0017: the content-surface answer from onboarding. "Does the site have a
-- blog or content section?" - 'existing' = yes (content_path_hint optionally
-- says where), 'create' = no, scaffold one during setup, 'detect' = not sure,
-- the agent inspects the repo and decides. The setup workflow treats this as
-- a hint and reconciles it against what the repo actually contains - the
-- repo always wins, and a second content system is never created.
alter table projects
  add column if not exists content_mode text not null default 'detect'
    check (content_mode in ('existing', 'create', 'detect')),
  add column if not exists content_path_hint text;
