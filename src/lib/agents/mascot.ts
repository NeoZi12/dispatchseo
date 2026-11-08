// The agent ids and each agent's two mascot colours, in a module of their own.
//
// The pixel dispatcher (components/pixel-dispatcher.tsx) draws on every
// dashboard screen and needs exactly this to tint itself; the full registry
// in ./index.ts also carries every connect-command builder (mcp-connect.ts),
// about 37 KB of source that rode into every page's client bundle for three
// colour pairs. The registry reads its mascot colours from here, so the two
// cannot drift.

export type AgentId = "claude" | "codex" | "cursor";

// The default for every project that has never chosen. Also what a row reads as
// on a database that hasn't run migration 0044 yet - see projectAgent().
export const DEFAULT_AGENT: AgentId = "claude";

export type Mascot = { body: string; shade: string };

export const MASCOTS: Record<AgentId, Mascot> = {
  // Clay - the site's default body, our nod to Claude Code's rust.
  claude: { body: "#d97757", shade: "#b0563a" },
  // OpenAI's near-white, with a mid-grey shade so legs/outline still read
  // against the near-black scene.
  codex: { body: "#f4f4f5", shade: "#8f8f99" },
  // Cursor's violet: the brand's cube is black and white, and several tints
  // each looked worse at 12px than it sounded; the cube's b&w just doesn't
  // survive a near-black scene at sprite scale.
  cursor: { body: "#c4b5fd", shade: "#8f76e0" },
};

/** The mascot colours for an agent id, or null for anything that isn't one. */
export function mascotFor(id: string | null | undefined): Mascot | null {
  return id && Object.prototype.hasOwnProperty.call(MASCOTS, id) ? MASCOTS[id as AgentId] : null;
}
