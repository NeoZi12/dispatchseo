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

-- No seed. The dashboard shows its "set up your site profile" card (and the
-- agent's /seo-setup writes the row) once the owner's real site exists - a
-- fresh instance must never be born describing someone else's product.
-- (Until 2026-07-21 this seeded ClockedCode, this repo's original tenant;
-- existing installs keep whatever row they already have.)
