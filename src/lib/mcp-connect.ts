// The `claude mcp add` snippet shown wherever a project's MCP key surfaces
// (onboarding wizard, pipeline card, settings). The server name is unique per
// project so one owner can connect any number of projects - at any config
// scope - without a second project's entry colliding with or shadowing the
// first one's token. The slug in the name also makes "which project is this
// session talking to" visible in `claude mcp list` at a glance.
//
// Client-safe on purpose: the wizard builds the command in the browser, so
// nothing here may import db.ts or any server-only module.

export function mcpServerName(slug: string): string {
  return `dispatchseo-${slug}`;
}

export function mcpAddCommand(slug: string, origin: string, token: string): string {
  // --transport http is required: without it current Claude Code versions
  // interpret the URL as a stdio command and the connection never works.
  return `claude mcp add --transport http ${mcpServerName(slug)} ${origin}/api/mcp --header "Authorization: Bearer ${token}"`;
}

// The one-command onboarding: public/setup.sh checks the folder and tools,
// connects Claude Code, saves every Actions secret (each value verified
// before it is stored), enables PR permissions, and hands off to the
// owner's agent for the pipeline install. Run from inside the site's repo.
export function setupCommand(slug: string, origin: string, token: string): string {
  return `curl -fsSL ${origin}/setup.sh | bash -s -- ${token} ${slug} ${origin}`;
}
