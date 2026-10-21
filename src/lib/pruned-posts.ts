// Blog posts removed on purpose in the 2026-10-21 prune (the site was demoted
// sitewide by Google's August 2026 spam update; 82 guides became 28). These
// slugs are off-remit (coding-agent how-tos on an SEO-tool domain) and have
// no on-topic replacement, so they answer 410 Gone from src/proxy.ts rather
// than 404: "gone on purpose, drop it" is the signal we want Google to read,
// and a 404 would keep the URL in the recrawl queue for months. Posts that
// DID have a replacement are 301s in next.config.ts instead. Never republish
// a slug from this list - the point of the prune is that it stays small.
export const GONE_POSTS: ReadonlySet<string> = new Set([
  "claude-code-timeout",
  "claude-code-automation",
  "claude-code-security-review",
  "claude-code-docker",
  "claude-code-vs-windsurf",
  "claude-code-tasks",
  "claude-code-fast-mode",
  "claude-code-environment-variables",
  "claude-code-stuck",
  "claude-code-multi-agent-orchestration",
  "claude-code-auto-compact",
  "claude-code-settings-json-example",
  "claude-code-background-tasks",
  "claude-code-vs-codex",
  "how-to-add-skills-to-claude-code",
  "claude-code-agents-vs-skills",
  "claude-code-git-worktree",
  "claude-code-permissions",
  "claude-code-bypass-permissions",
  "claude-code-slash-commands",
  "claude-code-statusline",
  "claude-code-checkpoints",
  "claude-code-plan-mode",
  "claude-code-sandbox",
  "claude-code-loop",
  "claude-code-routines-vs-cron",
  "claude-code-rate-limit",
  "claude-code-hooks",
  "best-mcp-servers-for-claude-code",
  "claude-code-headless-mode",
  "claude-code-vs-cursor",
  "claude-code-memory",
  "claude-code-subagents",
  "claude-code-mcp-server",
  "claude-code-github-actions",
  "mcp-server-examples",
  "how-to-build-an-mcp-server",
  "self-hosted-ai",
]);
