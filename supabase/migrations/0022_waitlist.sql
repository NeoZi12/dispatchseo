-- Cloud waitlist signups from the public landing page (and the MCP parity
-- tool). Deliberately NOT project-scoped: an email on the waitlist belongs to
-- the cloud business, not to any tenant, so this table carries no project_id.
-- RLS on with zero policies, same as every other table - only the
-- service-role key touches it.

create table if not exists waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null default 'landing',
  created_at timestamptz not null default now()
);

alter table waitlist_signups enable row level security;
