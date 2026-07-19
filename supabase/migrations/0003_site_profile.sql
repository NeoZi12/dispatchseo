-- Site profile: the product identity the backlink playbook personalizes from
-- (name, tagline, descriptions at directory-friendly lengths, categories,
-- tags). Written by the /seo-setup agent command via the set_site_profile MCP
-- tool; read by the dashboard to prefill every playbook submission and
-- @browser command.
--
-- Single-tenant: one row, id locked to 1. The future multi-tenant version
-- replaces this with per-tenant rows keyed to an account.
-- Same RLS posture as 0001/0002: enabled, no policies, service-role only.

create table if not exists site_profile (
  id int primary key default 1 check (id = 1),
  name text not null,
  url text not null,
  tagline text not null,          -- <= 60 chars, fits most directory tagline limits
  short_description text not null, -- <= 160 chars, meta-description-sized fields
  long_description text not null,  -- 300-600 chars, roomy description fields
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table site_profile enable row level security;

-- Seed for THIS instance (clockedcode.com). A fresh deployment for a different
-- product deletes this insert and runs /seo-setup instead - the dashboard shows
-- the setup card until the row exists.
insert into site_profile (id, name, url, tagline, short_description, long_description, categories, tags)
values (
  1,
  'ClockedCode',
  'https://clockedcode.com',
  'Upgrade your Claude Code setup in one paste',
  'A curated Claude Code setup: vetted tools, subagents, and a tuned CLAUDE.md, compiled into one master prompt you paste once. One-time $39, lifetime access.',
  'ClockedCode upgrades a developer''s Claude Code setup in one paste. You get a curated, continuously updated set of vetted tools, subagents, and CLAUDE.md instructions - the stuff power users assemble by hand over months - compiled into a single master prompt. Check off what you want, paste once, and your Claude Code works like a senior engineer''s. One-time $39 purchase, lifetime updates, and a free tips library at clockedcode.com/free.',
  array['Developer Tools', 'AI', 'Productivity'],
  array['claude-code', 'ai-coding', 'developer-tools', 'cli', 'anthropic']
)
on conflict (id) do nothing;
