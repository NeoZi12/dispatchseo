-- Playbook progress: which foundational-backlink items the user has completed.
-- One row per playbook item slug (the curated registry lives in code at
-- src/lib/playbook-data.ts - only the per-user progress is stored here).
-- Same RLS posture as 0001: enabled with no policies, so only the service-role
-- client (src/lib/db.ts) can read/write.

create table if not exists playbook_status (
  slug text primary key,
  status text not null default 'todo' check (status in ('todo', 'done', 'skipped')),
  done_at timestamptz
);

alter table playbook_status enable row level security;
