-- 0081: DataForSEO usage rows outlive the project that spent the money.
--
-- dataforseo_usage.project_id referenced projects(id) ON DELETE CASCADE, so
-- deleting a site erased its spend from the ledger. The platform account was
-- still charged: on 2026-11-08 a deleted test site took about $2 of Labs
-- research with it, and the owner's cost view read a third of what the
-- account actually burned that day. Drop the foreign key; the rows stay, keyed
-- by a project id that no longer resolves, and readers that name projects
-- show them as a deleted site. Nothing else depended on the constraint:
-- record_dataforseo_usage upserts by (project_id, day, endpoint) and the RLS
-- owner policy (0038) joins projects at read time, which simply finds no row.
--
-- Vanilla Postgres safe: the constraint name is the default Postgres gives an
-- inline column reference; the DO block tolerates a stack where it was never
-- created or was already dropped.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'dataforseo_usage_project_id_fkey'
      and conrelid = 'public.dataforseo_usage'::regclass
  ) then
    alter table public.dataforseo_usage drop constraint dataforseo_usage_project_id_fkey;
  end if;
end $$;
