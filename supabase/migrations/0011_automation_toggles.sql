-- 0011: per-automation toggles + the derived 'custom' publish mode.
--
-- The topbar mode is now derived from four automation flags:
--   semi   = auto_approve off, builds on, auto_merge off (you approve + merge)
--   auto   = everything on (fully hands-off)
--   custom = any other combination (set by toggling on the Automations page)
-- 'semi'/'auto' rows keep meaning the preset regardless of the flag columns;
-- the flag columns are only consulted when mode = 'custom'. Defaults are all
-- true so existing rows (both projects run auto today) keep their behavior.
--
-- Locked automations (weekly research, rank checks, GSC snapshots, tool
-- validation, IndexNow) have no columns on purpose - they cannot be disabled.

alter table projects drop constraint if exists projects_mode_check;
alter table projects
  add constraint projects_mode_check check (mode in ('semi', 'auto', 'custom'));

alter table projects
  add column if not exists auto_approve boolean not null default true,
  add column if not exists auto_build_guides boolean not null default true,
  add column if not exists auto_build_tools boolean not null default true,
  add column if not exists auto_merge boolean not null default true;
