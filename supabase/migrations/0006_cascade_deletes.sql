-- 0006: deletable projects. Deleting a projects row now cascades through every
-- table that carries its project_id, so "Delete project" is one statement and
-- can never leave orphans behind.

alter table pages
  drop constraint if exists pages_project_id_fkey,
  add constraint pages_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade;

alter table keywords
  drop constraint if exists keywords_project_id_fkey,
  add constraint keywords_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade;

alter table rank_checks
  drop constraint if exists rank_checks_project_id_fkey,
  add constraint rank_checks_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade;

alter table suggestions
  drop constraint if exists suggestions_project_id_fkey,
  add constraint suggestions_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade;

alter table gsc_stats
  drop constraint if exists gsc_stats_project_id_fkey,
  add constraint gsc_stats_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade;

alter table backlink_prospects
  drop constraint if exists backlink_prospects_project_id_fkey,
  add constraint backlink_prospects_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade;

alter table playbook_status
  drop constraint if exists playbook_status_project_id_fkey,
  add constraint playbook_status_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade;

alter table site_profile
  drop constraint if exists site_profile_project_id_fkey,
  add constraint site_profile_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade;

-- Rank history dies with its keyword (it is meaningless without it).
alter table rank_checks
  drop constraint if exists rank_checks_keyword_id_fkey,
  add constraint rank_checks_keyword_id_fkey
    foreign key (keyword_id) references keywords(id) on delete cascade;

-- A keyword survives its target page - it just loses the pointer.
alter table keywords
  drop constraint if exists keywords_target_page_id_fkey,
  add constraint keywords_target_page_id_fkey
    foreign key (target_page_id) references pages(id) on delete set null;
