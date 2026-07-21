-- 0028: separate auto-approval toggle for TOOL ideas.
--
-- auto_approve (0011) now means guides only. Tools were "approve-idea-first"
-- by instruction-layer fiat with no flag behind it; this column makes that a
-- real toggle. Default true so auto-mode projects go hands-off on tools too
-- (the auto preset = everything on); the semi preset sets it false. Enforcement
-- stays with the MCP's update_suggestion pending-coercion gate - agent tool
-- approvals land pending when this is off. Auto-approved tools do NOT fire the
-- instant build dispatch (owner approvals do); they wait for the weekly
-- tool-builder sweep, keeping the one-tool-a-week cadence.

alter table projects
  add column if not exists auto_approve_tools boolean not null default true;
